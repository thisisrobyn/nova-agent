"""NOVA LangGraph agent graph.

Builds and compiles a ``StateGraph`` with an **agent → tools** loop:

1. ``agent`` – calls the LLM (with tools bound).
2. If the LLM requests a tool call → ``tools`` node executes it → back to agent.
3. If the LLM responds without tool calls → graph ends.

Public API
----------
- ``compiled_graph``   – the compiled LangGraph runnable.
- ``get_tools()``      – returns the list of LangChain tools available to the agent.
- ``run_agent_once()`` – convenience async helper for the CLI.
- ``run_agent_sync()`` – sync wrapper around ``run_agent_once``.
"""

import asyncio
import logging
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agent.nodes import agent_node, should_use_tools
from agent.state import NOVAState

logger = logging.getLogger(__name__)

# ── Tool registry ────────────────────────────────────────────────────

def get_tools() -> List[BaseTool]:
    """Return all tools available to the NOVA agent."""
    from tools.calculator import calculator
    from tools.datetime_tool import convert_timezone, get_current_datetime
    from tools.files import list_directory, read_csv, read_excel, read_text_file

    return [
        get_current_datetime,
        convert_timezone,
        calculator,
        list_directory,
        read_csv,
        read_excel,
        read_text_file,
    ]


# ── Graph construction ───────────────────────────────────────────────

def build_graph() -> StateGraph:
    """Construct (but do not compile) the NOVA agent graph."""
    tools = get_tools()
    tool_node = ToolNode(tools)

    graph = StateGraph(NOVAState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_use_tools, {"tools": "tools", "__end__": END})
    graph.add_edge("tools", "agent")

    return graph


compiled_graph = build_graph().compile()
logger.info("NOVA graph compiled successfully")


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

    # Append user message and invoke the graph
    input_state = dict(state)
    input_state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=user_input)
    ]

    result = await compiled_graph.ainvoke(input_state)
    return result


def run_agent_sync(user_input: str, state: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Synchronous wrapper around :func:`run_agent_once`."""
    return asyncio.run(run_agent_once(user_input, state))