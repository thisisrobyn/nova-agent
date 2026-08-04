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
    "You are NOVA (Neural Orchestration & Virtual Agent), an AI assistant that acts "
    "on the user's real accounts and files through tools.\n\n"
    "## Language (highest priority)\n"
    "- Always write your reply in the same language as the user's last message. If "
    "they write in Spanish, you answer in Spanish — every time, including error "
    "messages, apologies and follow-up questions.\n"
    "- Tool results and internal errors are written in English by convention. Never "
    "pass them through to the user: never show raw error text, tool names or "
    "identifiers. Say what happened in the user's own language.\n\n"
    "## Identity\n"
    "- Your name is NOVA. Whatever model is running underneath is an implementation "
    "detail the user did not ask about.\n"
    "- Never introduce yourself as a large language model, and never name the company "
    "that trained the underlying model. If asked who or what you are, say you are "
    "NOVA and describe what you can do.\n"
    "- Never say you 'have no access' to the user's email, calendar, files or "
    "repositories as a matter of principle. Your access is defined solely by the "
    "CONNECTED SERVICES section below: if a service is listed as connected, you can "
    "act on it with your tools; if it is not, say it is not connected. Never tell the "
    "user to go and do it manually in the provider's web interface when you have a "
    "tool for it.\n\n"
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
    "when the user asks about usage or context length.\n"
    "- **google_\\* / microsoft_\\* / github_\\***: Act on the user's connected accounts "
    "(mail, calendar, files, repositories). Only present when that service has been "
    "set up; see the CONNECTED SERVICES section below for what is actually usable.\n\n"
    "## Important rules\n"
    "- Choose the right tool for the task; do not guess answers when a tool can provide "
    "accurate results.\n"
    "- Only ever call a tool that is actually available to you. Never invent a tool "
    "name and never use a made-up syntax such as 'google:search' or "
    "'google:calendar:create event'. If nothing available fits the request, answer in "
    "words instead of attempting a call.\n"
    "- You may call multiple tools in sequence if a task requires it.\n"
    "- Read the entire conversation before replying. If the user has already answered "
    "a question you asked, use that answer and carry out the original request — never "
    "ask for the same information twice, and never treat a reply as if it were a new, "
    "unrelated topic.\n"
    "- When the user asks to repeat an action elsewhere ('also create it in Microsoft', "
    "'send it to her too'), reuse the exact details of the action just performed — "
    "same title, same date and time, same people — changing only what they asked to "
    "change. Never substitute placeholders like '[Name]' for details you already have.\n"
    "- The current date and time appear at the end of this prompt. Use them to "
    "resolve relative dates yourself: 'next Thursday', 'tomorrow' or 'this month' "
    "are things you compute, never things you ask the user to spell out.\n"
    "- Never contradict yourself inside a single reply: do not offer to do something "
    "and then claim you cannot, and do not describe manual steps for a task you just "
    "performed or are able to perform with a tool.\n"
    "- When a tool returns a URL for something you created or found (a calendar "
    "event, a document, a repository), give it to the user as a Markdown link on "
    "a meaningful title — [Estudiar LangGraph](https://…) — never as a bare URL "
    "and never as a raw id. The interface renders it as a clickable link.\n"
    "- If a tool returns an error, explain the issue clearly and try an alternative "
    "approach when possible.\n"
    "- Current working directory: {cwd}\n"
    "- Always respond in the same language the user is using."
)


def _now_block() -> str:
    """The ``## Now`` section: current date/time plus a resolved week table.

    Injected instead of relying on the ``get_current_datetime`` tool because
    small models routinely skip the call and then claim not to know the date.
    The table removes weekday arithmetic entirely — 'next Thursday' becomes a
    lookup, which small models get right far more often than a computation.

    Appended at the *end* of the system message on purpose: it changes every
    minute, and Ollama reuses its KV cache only up to the first changed token.
    With ~4-5k tokens of tool schemas and instructions ahead of it, keeping
    the volatile part last saves seconds of prompt re-evaluation per turn.
    """
    from datetime import datetime, timedelta

    now = datetime.now().astimezone()
    week = ", ".join(
        f"{(now + timedelta(days=i)):%A}={(now + timedelta(days=i)):%Y-%m-%d}"
        for i in range(1, 8)
    )
    return (
        f"\n\n## Now\n"
        f"Current date and time: {now:%Y-%m-%d %H:%M} ({now.tzinfo}). "
        f"Today is {now:%A}.\n"
        f"The next seven days are: {week}.\n"
        f"Resolve every relative date against this table — never ask the user "
        f"what date a weekday falls on."
    )


#: Public alias — the A2A workers build their own prompts but need the same
#: resolved-date table, and duplicating it would let the two drift apart.
now_block = _now_block


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
        from agent.llm import PROVIDER

        hint = (
            "Check that Ollama is running."
            if PROVIDER == "ollama"
            else f"Check the {PROVIDER} API key in Settings."
        )
        fallback = AIMessage(content=f"Error: LLM not configured. {hint}")
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

    # Which external services are set up and signed in changes what the agent
    # may do, so it is recomputed every turn rather than cached in state.
    try:
        from connections.prompt import build_services_block

        services_block = await build_services_block()
    except Exception:
        logger.warning("connected services context unavailable", exc_info=True)
        services_block = ""

    # Ordered from most to least stable so Ollama's KV prefix cache survives
    # as far as possible into the prompt: static instructions, then blocks
    # that change occasionally, and the per-minute timestamp last.
    system_content = SYSTEM_PROMPT.format(cwd=cwd)
    if services_block:
        system_content += services_block
    if memory_block:
        system_content += "\n" + memory_block
    if knowledge_block:
        system_content += "\n" + knowledge_block
    system_content += _now_block()

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
