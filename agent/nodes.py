"""NOVA agent graph nodes.

Defines the ``agent_node`` (LLM reasoning with tool binding) and a
helper router that decides whether to call tools or finish.
"""

import os
from typing import Any, Dict, Literal

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
import structlog

from agent.llm import get_llm
from agent.state import NOVAState
from tools.token_counter import count_tokens_for_message

logger = structlog.stdlib.get_logger(__name__)

SYSTEM_PROMPT = (
    "You are NOVA (Neural Orchestration & Virtual Agent), a helpful AI assistant "
    "with access to tools for real-world tasks.\n\n"
    "## Tool usage guidelines\n"
    "- **calculator**: Use for any mathematical calculations instead of computing mentally.\n"
    "- **get_current_datetime / convert_timezone**: Use when the user asks about dates, "
    "times, or timezone conversions.\n"
    "- **list_directory / read_text_file / read_csv / read_excel**: Use to browse and "
    "read files on the user's local file system.\n"
    "- **rag_search**: Search the user's uploaded knowledge base documents. Use when "
    "the user asks about content from their uploaded PDFs, text files, or notes.\n"
    "- **web_search**: Search the web for current, real-time information. Use when the "
    "user asks about recent events, live data, or topics you are unsure about. Always "
    "cite sources with URLs when presenting web results.\n"
    "- **execute_python**: Run Python code in a sandboxed environment. Use when the "
    "user asks you to execute, test, or demonstrate code. If execution fails, analyze "
    "the error and generate corrected code automatically.\n"
    "- **count_conversation_tokens**: Count the tokens used in the current conversation "
    "when the user asks about usage or context length.\n\n"
    "## Important rules\n"
    "- Choose the right tool for the task; do not guess answers when a tool can provide "
    "accurate results.\n"
    "- You may call multiple tools in sequence if a task requires it.\n"
    "- If a tool returns an error, explain the issue clearly and try an alternative "
    "approach when possible.\n"
    "- Current working directory: {cwd}\n"
    "- Always respond in the same language the user is using."
)


async def agent_node(state: NOVAState, config: RunnableConfig) -> Dict[str, Any]:
    """Invoke the LLM with the full message history and bound tools.

    The LLM decides whether to call a tool or respond directly.
    Token usage is extracted and accumulated in the state.

    The ``config`` parameter is injected by LangGraph and carries
    callback handlers (e.g. ``_TokenStreamHandler`` for real-time
    token streaming) that must be forwarded to the LLM ``ainvoke``
    call so that ``on_llm_new_token`` fires for every chunk.
    """
    llm = get_llm()
    if llm is None:
        fallback = AIMessage(content="Error: LLM not configured. Check that Ollama is running.")
        return {"messages": [fallback]}

    # Import tools here to avoid circular imports
    from agent.graph import get_tools

    tools = get_tools()
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    # Build messages: system prompt + memory context + conversation history
    messages = list(state.get("messages", []))
    cwd = os.getcwd()

    # Inject memory context if available
    memory_block = state.get("memory_context", "")
    if not memory_block:
        try:
            from memory import get_memory_manager
            memory_block = await get_memory_manager().build_memory_context()
        except Exception:
            memory_block = ""

    system_content = SYSTEM_PROMPT.format(cwd=cwd)
    if memory_block:
        system_content += "\n" + memory_block

    sys_msg = SystemMessage(content=system_content)

    response: AIMessage = await llm_with_tools.ainvoke(
        [sys_msg] + messages, config=config
    )

    # Extract token usage
    token_usage = None
    if hasattr(response, "response_metadata"):
        metadata = response.response_metadata or {}
        if "usage" in metadata:
            usage = metadata["usage"]
            token_usage = {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            }

    # Estimate if API didn't return usage
    if token_usage is None:
        prompt_est = count_tokens_for_message(str(messages))
        completion_est = count_tokens_for_message(response.content or "")
        token_usage = {
            "prompt_tokens": prompt_est,
            "completion_tokens": completion_est,
            "total_tokens": prompt_est + completion_est,
        }

    total_tokens = state.get("total_tokens", 0) + token_usage.get("total_tokens", 0)
    iteration_count = state.get("iteration_count", 0) + 1

    return {
        "messages": [response],
        "memory_context": memory_block,
        "token_usage": token_usage,
        "total_tokens": total_tokens,
        "iteration_count": iteration_count,
    }


def should_use_tools(state: NOVAState) -> Literal["tools", "__end__"]:
    """Router: check if the last AI message contains tool calls."""
    messages = state.get("messages", [])
    if not messages:
        return "__end__"

    last = messages[-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return "__end__"
