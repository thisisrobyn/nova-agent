"""NOVA agent graph nodes.

Defines the ``agent_node`` (LLM reasoning with tool binding) and a
helper router that decides whether to call tools or finish.
"""

import logging
import os
from typing import Any, Dict, Literal

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from agent.llm import get_llm
from agent.state import NOVAState
from tools.token_counter import count_tokens_for_message

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are NOVA (Neural Orchestration & Virtual Agent), a helpful AI assistant.\n"
    "You can use the tools provided to answer the user's questions.\n"
    "When you need to perform calculations, get the date/time, or read files, "
    "use the appropriate tool instead of guessing.\n"
    "You have access to the user's file system. Use list_directory to explore "
    "folders and read_text_file / read_csv / read_excel to read file contents.\n"
    "Use rag_search to find information from the user's uploaded documents "
    "in the knowledge base.\n"
    "Use web_search when the user asks about current events, recent news, or "
    "topics requiring up-to-date information. Always cite sources with URLs.\n"
    "Use execute_python to run Python code when the user asks you to execute, "
    "test, or demonstrate code. If execution fails, analyze the error and "
    "generate corrected code.\n"
    "Current working directory: {cwd}\n"
    "Always respond in the same language the user is using."
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
