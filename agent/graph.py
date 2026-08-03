"""NOVA LangGraph agent graph.

Builds and compiles a ``StateGraph`` with an **agent → tools** loop:

1. ``agent`` – calls the LLM (with tools bound).
2. If the LLM requests a tool call → ``tools`` node executes it → back to agent.
3. If the LLM responds without tool calls → graph ends.

Public API
----------
- ``get_compiled_graph()`` – returns the (lazily-built) compiled LangGraph runnable.
- ``get_tools()``          – returns the list of LangChain tools available to the agent.
- ``set_mcp_tools()``      – register external MCP tools at runtime and rebuild the graph.
- ``reload_service_tools()`` – re-bind the Google/Microsoft/GitHub tools after
  a provider's OAuth application is registered or removed.
- ``run_agent_once()``     – convenience async helper for the CLI.
- ``run_agent_sync()``     – sync wrapper around ``run_agent_once``.
"""

import asyncio
import structlog
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agent.nodes import agent_node, should_use_tools
from agent.state import NOVAState

logger = structlog.stdlib.get_logger(__name__)

# ── Tool registry ────────────────────────────────────────────────────

_mcp_tools: List[BaseTool] = []
_service_tools: List[BaseTool] = []
_compiled_graph = None


def set_mcp_tools(tools: List[BaseTool]) -> None:
    """Register MCP tools and rebuild the graph so ToolNode can execute them."""
    global _mcp_tools, _compiled_graph
    _mcp_tools = list(tools)
    _compiled_graph = _build_and_compile()
    logger.info("Registered %d MCP tool(s) — graph rebuilt", len(_mcp_tools))


async def reload_service_tools() -> int:
    """Re-bind the connected-service tools and rebuild the graph.

    Called at startup and whenever a provider's OAuth application is
    registered or removed, so the agent's tool set follows the set of
    providers the user can actually sign into.

    Returns:
        The number of service tools now bound.
    """
    global _service_tools, _compiled_graph

    from nova_mcp.builtin import get_service_tools

    _service_tools = await get_service_tools()
    _compiled_graph = _build_and_compile()
    logger.info("Registered %d service tool(s) — graph rebuilt", len(_service_tools))
    return len(_service_tools)


def get_tools() -> List[BaseTool]:
    """Return all tools available to the NOVA agent (local + services + MCP)."""
    import os

    from tools.calculator import calculator
    from tools.datetime_tool import convert_timezone, get_current_datetime
    from tools.files import list_directory, read_csv, read_excel, read_text_file
    from tools.conversation_tokens import count_conversation_tokens
    from tools.rag_tool import rag_search
    from tools.web_search import web_search

    local: List[BaseTool] = [
        get_current_datetime,
        convert_timezone,
        calculator,
        list_directory,
        read_csv,
        read_excel,
        read_text_file,
        count_conversation_tokens,
        rag_search,
        web_search,
    ]

    # Conditionally add code executor
    if os.getenv("CODE_EXEC_MODE", "subprocess").lower() != "disabled":
        from tools.code_executor import execute_python
        local.append(execute_python)

    return local + _service_tools + _mcp_tools


# ── Graph construction ───────────────────────────────────────────────

def _tool_error_message(exc: Exception) -> str:
    """Turn a tool failure into an instruction the agent can act on.

    LangGraph's default text is English prose that small models tend to parrot
    back at the user verbatim. Replacing it with an explicit instruction keeps
    the failure internal and the reply in the user's language.
    """
    return (
        f"TOOL_ERROR: the tool failed with: {exc}. Do not show this raw error "
        f"to the user. Explain what went wrong in their own language, briefly, "
        f"and continue if you can."
    )


#: What to tell the agent when it invents a tool. Small models fall back to the
#: tool syntax they were pretrained with (``google:search``,
#: ``google:calendar:create event``) whenever the request smells like a known
#: service. Naming the real candidates lets the model recover on the next
#: step instead of giving up.
_UNKNOWN_TOOL_INSTRUCTION = (
    "TOOL_DOES_NOT_EXIST: '{name}' is not one of your tools. Never show this "
    "message, the tool name or any error text to the user.{suggestion} If no "
    "listed tool fits, or the service involved is not connected, tell the "
    "user — in their own language — that you cannot do it and why."
)

_SUGGESTION_TEMPLATE = (
    " Your actual tools for this look like what you wanted — call one of "
    "these instead, with its exact name and arguments: {names}."
)


def _suggest_real_tools(invented: str, valid: set[str]) -> str:
    """Point the model at bound tools resembling the name it made up.

    ``google:calendar:create event`` should surface every ``google_*calendar*``
    tool; matching on the leading word keeps it cheap and predictable.
    """
    head = invented.split(":", 1)[0].split("_", 1)[0].lower()
    if not head:
        return ""
    matches = sorted(n for n in valid if n.startswith(f"{head}_"))
    if not matches:
        return ""
    return _SUGGESTION_TEMPLATE.format(names=", ".join(matches[:12]))

_SKIPPED_TOOL_INSTRUCTION = (
    "NOT_EXECUTED: skipped because another tool call in the same batch was "
    "invalid. Reply to the user directly."
)


async def _unknown_tools_node(state: NOVAState) -> Dict[str, Any]:
    """Answer a batch of tool calls that contains at least one unknown tool.

    ``ToolNode`` handles an unknown name itself, before ``handle_tool_errors``
    can see it, and returns "... is not a valid tool, try one of [...]" — which
    the model then relays to the user in English as if they had made a mistake.
    Intercepting here keeps that text away from the model entirely.

    Every call in the batch gets a reply so no tool call is left dangling.
    """
    from langchain_core.messages import ToolMessage

    last = state["messages"][-1]
    valid = {tool.name for tool in get_tools()}

    replies = []
    for call in getattr(last, "tool_calls", []) or []:
        name = call.get("name", "")
        content = (
            _SKIPPED_TOOL_INSTRUCTION
            if name in valid
            else _UNKNOWN_TOOL_INSTRUCTION.format(
                name=name, suggestion=_suggest_real_tools(name, valid)
            )
        )
        replies.append(
            ToolMessage(content=content, name=name, tool_call_id=call.get("id", ""))
        )
        if name not in valid:
            logger.warning("model invented a tool name: %s", name)

    return {"messages": replies}


def _route_tools(state: NOVAState) -> str:
    """Send invented tool names down a separate path from real ones."""
    decision = should_use_tools(state)
    if decision != "tools":
        return decision

    valid = {tool.name for tool in get_tools()}
    calls = getattr(state["messages"][-1], "tool_calls", None) or []
    if any(call.get("name") not in valid for call in calls):
        return "unknown_tools"
    return "tools"


def _build_and_compile():
    """Build and compile the NOVA agent graph."""
    tools = get_tools()
    tool_node = ToolNode(tools, handle_tool_errors=_tool_error_message)

    graph = StateGraph(NOVAState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_node("unknown_tools", _unknown_tools_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges(
        "agent",
        _route_tools,
        {"tools": "tools", "unknown_tools": "unknown_tools", "__end__": END},
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("unknown_tools", "agent")

    compiled = graph.compile()
    logger.info("NOVA graph compiled with %d tool(s)", len(tools))
    return compiled


def get_compiled_graph():
    """Return the compiled graph, building it on first call."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_and_compile()
    return _compiled_graph


# Keep backward-compat attribute (used by routes.py streaming)
compiled_graph = None  # lazy sentinel


class _GraphProxy:
    """Proxy that always delegates to the latest compiled graph."""

    def __getattr__(self, name):
        return getattr(get_compiled_graph(), name)


compiled_graph = _GraphProxy()


# ── Convenience helpers (used by CLI) ────────────────────────────────

async def run_agent_once(
    user_input: str,
    state: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Run one turn of the agent and return the updated state dict.

    Args:
        user_input: The user's message.
        state: Previous conversation state (or ``None`` for a new session).

    Returns:
        The full updated state dictionary.
    """
    if state is None:
        state = {
            "messages": [],
            "memory_context": "",
            "tool_results": [],
            "iteration_count": 0,
            "total_tokens": 0,
            "token_usage": None,
        }

    input_state = dict(state)
    input_state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=user_input)
    ]

    result = await get_compiled_graph().ainvoke(input_state)
    return result


def run_agent_sync(user_input: str, state: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Synchronous wrapper around :func:`run_agent_once`."""
    return asyncio.run(run_agent_once(user_input, state))