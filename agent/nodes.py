"""NOVA agent graph nodes.

Defines the ``agent_node`` (LLM reasoning with tool binding) and a
helper router that decides whether to call tools or finish.
"""

import os
from typing import Any, Dict, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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


# ── Knowledge base (RAG) auto-retrieval ──────────────────────────────
# Facts/episodes are auto-injected into the prompt, but the knowledge base
# (uploaded documents) previously depended on the LLM choosing to call the
# ``rag_search`` tool — which small local models often skip. We retrieve
# relevant chunks automatically on each user turn and inject them, so the
# agent always "sees" the user's documents. ``rag_search`` remains available
# for explicit, follow-up searches.

_rag_store = None
_RAG_CONTEXT_CHUNKS = int(os.getenv("RAG_CONTEXT_CHUNKS", "4"))
# Chroma cosine distance (0 = identical, 2 = opposite). Chunks farther than
# this are treated as irrelevant and not injected. Calibrated for
# nomic-embed-text: on-topic questions land ~0.4-0.55, unrelated ones ~0.6+.
# Raise it toward recall (more injection) or lower it toward precision.
_RAG_CONTEXT_MAX_DISTANCE = float(os.getenv("RAG_CONTEXT_MAX_DISTANCE", "0.6"))


def _get_rag_store():
    """Lazily construct and cache the Chroma vector store (or None on failure)."""
    global _rag_store
    if _rag_store is None:
        try:
            from memory.rag.store import ChromaVectorStore

            _rag_store = ChromaVectorStore()
        except Exception:
            logger.warning("knowledge base unavailable", exc_info=True)
            return None
    return _rag_store


async def _build_knowledge_context(query: str) -> str:
    """Retrieve relevant knowledge-base excerpts and format them for the prompt.

    Returns an empty string when the base is empty, unavailable, or nothing
    relevant enough is found for ``query``.
    """
    query = (query or "").strip()
    if not query:
        return ""

    store = _get_rag_store()
    if store is None:
        return ""

    try:
        if store.count() == 0:
            return ""
        results = await store.similarity_search(query, k=_RAG_CONTEXT_CHUNKS)
    except Exception:
        logger.warning("knowledge base retrieval failed", exc_info=True)
        return ""

    relevant = [
        r for r in results
        if r.get("distance", 2.0) <= _RAG_CONTEXT_MAX_DISTANCE
    ]
    if not relevant:
        return ""

    parts: list[str] = []
    for item in relevant:
        meta = item.get("metadata") or {}
        name = meta.get("document_name", "document")
        parts.append(f"[{name}]\n{item['content']}")

    logger.info("knowledge context injected", chunks=len(relevant))
    return (
        "\n\n--- KNOWLEDGE BASE (excerpts from the user's uploaded documents) ---\n"
        + "\n\n".join(parts)
        + "\n--- END KNOWLEDGE BASE ---\n"
        "Use these excerpts to answer questions about the user and their "
        "documents. If they do not contain the answer, say so plainly.\n"
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

    # Retrieve knowledge-base context for the current user turn. Recompute only
    # on a fresh user message (last msg is Human); during the tool loop reuse
    # what was already fetched this turn.
    knowledge_block = state.get("knowledge_context", "")
    if messages and isinstance(messages[-1], HumanMessage):
        knowledge_block = await _build_knowledge_context(messages[-1].content)

    system_content = SYSTEM_PROMPT.format(cwd=cwd)
    if memory_block:
        system_content += "\n" + memory_block
    if knowledge_block:
        system_content += "\n" + knowledge_block

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
        "knowledge_context": knowledge_block,
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
