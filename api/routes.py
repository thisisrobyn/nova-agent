"""NOVA REST API routes."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from agent.graph import compiled_graph, run_agent_once
from agent.llm import get_settings, list_ollama_models, reinitialize_llm
from api.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentResponse,
    EpisodeListResponse,
    EpisodeResponse,
    FactListResponse,
    FactResponse,
    HistoryResponse,
    MemoryClearResponse,
    OllamaModel,
    OllamaModelsResponse,
    SettingsResponse,
    SettingsUpdate,
    TitleRequest,
    TitleResponse,
    ToolInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# ── Session persistence helpers ─────────────────────────────────────

_SESSIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"


def _serialize_message(msg) -> dict | None:
    """Convert a LangChain message to a JSON-serializable dict."""
    if isinstance(msg, HumanMessage):
        return {"type": "human", "content": msg.content}
    if isinstance(msg, AIMessage):
        data: dict = {"type": "ai", "content": msg.content}
        if getattr(msg, "tool_calls", None):
            data["tool_calls"] = msg.tool_calls
        return data
    if isinstance(msg, ToolMessage):
        return {
            "type": "tool",
            "content": msg.content,
            "name": getattr(msg, "name", ""),
            "tool_call_id": getattr(msg, "tool_call_id", ""),
        }
    if isinstance(msg, SystemMessage):
        return {"type": "system", "content": msg.content}
    return None


def _deserialize_message(data: dict):
    """Reconstruct a LangChain message from a serialized dict."""
    t = data.get("type")
    if t == "human":
        return HumanMessage(content=data["content"])
    if t == "ai":
        msg = AIMessage(content=data["content"])
        if "tool_calls" in data:
            msg.tool_calls = data["tool_calls"]
        return msg
    if t == "tool":
        return ToolMessage(
            content=data["content"],
            name=data.get("name", ""),
            tool_call_id=data.get("tool_call_id", ""),
        )
    if t == "system":
        return SystemMessage(content=data["content"])
    return None


def _persist_session(session_id: str, session: Dict[str, Any]) -> None:
    """Save a session to a JSON file on disk."""
    try:
        _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        msgs = [_serialize_message(m) for m in session.get("messages", [])]
        payload = {
            "messages": [m for m in msgs if m is not None],
            "memory_context": session.get("memory_context", ""),
            "tool_results": session.get("tool_results", []),
            "iteration_count": session.get("iteration_count", 0),
            "total_tokens": session.get("total_tokens", 0),
            "token_usage": session.get("token_usage"),
        }
        path = _SESSIONS_DIR / f"{session_id}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        logger.exception("Failed to persist session %s", session_id)


def _load_session_from_disk(session_id: str) -> Dict[str, Any] | None:
    """Load a session from its JSON file, or return None."""
    path = _SESSIONS_DIR / f"{session_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        messages = [_deserialize_message(m) for m in data.get("messages", [])]
        return {
            "messages": [m for m in messages if m is not None],
            "memory_context": data.get("memory_context", ""),
            "tool_results": data.get("tool_results", []),
            "iteration_count": data.get("iteration_count", 0),
            "total_tokens": data.get("total_tokens", 0),
            "token_usage": data.get("token_usage"),
            "active_task": None,
            "response_buffer": None,
            "is_generating": False,
        }
    except Exception:
        logger.exception("Failed to load session %s from disk", session_id)
        return None


def _delete_session_from_disk(session_id: str) -> None:
    """Remove the persisted JSON file for a session."""
    path = _SESSIONS_DIR / f"{session_id}.json"
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to delete session file %s", session_id)


# ── In-memory session store ─────────────────────────────────────────
# Each session stores the LangGraph agent state plus streaming metadata.
# Sessions are also persisted to data/sessions/*.json on every update.

_sessions: Dict[str, Dict[str, Any]] = {}

# Sentinel object placed into the response_buffer to signal stream end.
_STREAM_END = object()


def _get_session(session_id: str) -> Dict[str, Any]:
    """Return the agent state for a session, creating it if needed.

    Tries in-memory cache first, then falls back to disk, and finally
    creates a brand-new empty session.
    """
    if session_id not in _sessions:
        loaded = _load_session_from_disk(session_id)
        if loaded is not None:
            _sessions[session_id] = loaded
        else:
            _sessions[session_id] = {
                "messages": [],
                "memory_context": "",
                "tool_results": [],
                "iteration_count": 0,
                "total_tokens": 0,
                "token_usage": None,
                "active_task": None,
                "response_buffer": None,
                "is_generating": False,
            }
    return _sessions[session_id]


def _extract_response(state: Dict[str, Any]) -> ChatResponse:
    """Extract a ChatResponse from the agent state."""
    messages = state.get("messages", [])

    # Find last AIMessage with content
    response_text = ""
    tools_used: list[ToolInfo] = []

    for msg in messages:
        if isinstance(msg, ToolMessage):
            tools_used.append(ToolInfo(name=msg.name or "unknown", result=msg.content[:200]))
        if isinstance(msg, AIMessage) and msg.content:
            response_text = msg.content

    return ChatResponse(
        response=response_text,
        tools_used=tools_used,
        token_usage=state.get("token_usage"),
        total_tokens=state.get("total_tokens", 0),
        iteration_count=state.get("iteration_count", 0),
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the NOVA agent and get a response."""
    try:
        state = _get_session(request.session_id)
        updated_state = await run_agent_once(request.message, state)
        _sessions[request.session_id] = updated_state
        _persist_session(request.session_id, updated_state)

        # Fire-and-forget memory extraction
        asyncio.create_task(
            _trigger_memory_extraction(request.session_id, updated_state)
        )

        return _extract_response(updated_state)
    except Exception as e:
        logger.exception("Chat endpoint error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat/history/{session_id}", response_model=HistoryResponse)
async def get_history(session_id: str) -> HistoryResponse:
    """Retrieve the conversation history for a session."""
    state = _get_session(session_id)
    messages: list[ChatMessage] = []

    for msg in state.get("messages", []):
        if isinstance(msg, HumanMessage):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            messages.append(ChatMessage(role="user", content=content))
        elif isinstance(msg, AIMessage) and msg.content:
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            messages.append(ChatMessage(role="assistant", content=content))
        elif isinstance(msg, ToolMessage):
            # msg.content can be str or list[dict] (structured MCP content)
            if isinstance(msg.content, str):
                text = msg.content[:200]
            elif isinstance(msg.content, list):
                text = " ".join(
                    item.get("text", "") for item in msg.content if isinstance(item, dict)
                )[:200]
            else:
                text = str(msg.content)[:200]
            messages.append(ChatMessage(
                role="tool",
                content=text,
                tools_used=[ToolInfo(name=msg.name or "unknown", result=text)],
            ))

    return HistoryResponse(
        session_id=session_id,
        messages=messages,
        total_tokens=state.get("total_tokens", 0),
        iteration_count=state.get("iteration_count", 0),
    )


@router.delete("/chat/history/{session_id}")
async def clear_history(session_id: str) -> dict:
    """Clear the conversation history for a session."""
    if session_id in _sessions:
        del _sessions[session_id]
    _delete_session_from_disk(session_id)
    return {"status": "cleared", "session_id": session_id}


# ── Streaming endpoint ──────────────────────────────────────────────

def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


class _TokenStreamHandler(AsyncCallbackHandler):
    """LangChain callback that pushes each LLM token into an asyncio.Queue.

    ``ChatOllama._agenerate`` internally streams from Ollama and calls
    ``run_manager.on_llm_new_token`` for every chunk — even when the
    graph node uses ``ainvoke``.  This handler intercepts those calls and
    feeds them into the SSE buffer so the frontend receives tokens in
    real-time.
    """

    def __init__(self, buffer: asyncio.Queue) -> None:
        self.buffer = buffer

    async def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        if token:
            await self.buffer.put({"type": "token", "content": token})


async def _run_langgraph_task(
    session_id: str,
    input_state: Dict[str, Any],
    buffer: asyncio.Queue,
) -> None:
    """Background task: run LangGraph and push SSE events into *buffer*.

    Token streaming is achieved via a ``_TokenStreamHandler`` callback
    that intercepts ``on_llm_new_token`` events from the chat model.
    The graph is executed with ``astream`` (default ``stream_mode="values"``)
    which yields the full state after each node — used to detect tool
    events and capture the final state.

    Always persists final_state to ``_sessions`` on completion,
    regardless of whether the SSE client is still connected.
    """
    tools_used: list[dict] = []
    final_state: Dict[str, Any] | None = None
    # Track how many messages we've already seen so we only process new ones
    seen_message_count = len(input_state.get("messages", []))
    start_time = time.monotonic()

    await buffer.put({"type": "status", "message": "Processing"})

    # Callback handler that streams LLM tokens into the buffer in real-time
    token_handler = _TokenStreamHandler(buffer)

    try:
        async for state in compiled_graph.astream(
            input_state,
            config={"callbacks": [token_handler]},
            stream_mode="values",
        ):
            final_state = state

            # Detect new tool-related messages for tool_start / tool_end
            msgs = state.get("messages", [])
            new_msgs = msgs[seen_message_count:]
            seen_message_count = len(msgs)

            for msg in new_msgs:
                if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
                    for tc in msg.tool_calls:
                        await buffer.put({
                            "type": "tool_start",
                            "name": tc.get("name", "unknown"),
                        })
                elif isinstance(msg, ToolMessage):
                    result = str(msg.content)[:200]
                    name = msg.name or "unknown"
                    tools_used.append({"name": name, "result": result})
                    await buffer.put({
                        "type": "tool_end",
                        "name": name,
                        "result": result,
                    })

    except httpx.TimeoutException:
        logger.warning("LLM request timed out for session %s", session_id)
        await buffer.put({
            "type": "error",
            "message": "Response timed out. The model may be loading. Please try again.",
        })
    except httpx.ConnectError:
        logger.warning("Cannot connect to Ollama for session %s", session_id)
        await buffer.put({
            "type": "error",
            "message": "Cannot connect to the language model service. Please ensure it is running.",
        })
    except Exception as exc:
        logger.exception("Streaming error in background task")
        await buffer.put({"type": "error", "message": str(exc)})
    finally:
        elapsed = round(time.monotonic() - start_time, 1)

        # Always persist final state (in-memory + disk)
        if final_state:
            _sessions[session_id] = {
                **final_state,
                "active_task": None,
                "response_buffer": None,
                "is_generating": False,
            }
            _persist_session(session_id, _sessions[session_id])

            # Fire-and-forget memory extraction
            asyncio.create_task(
                _trigger_memory_extraction(session_id, final_state)
            )
        else:
            session = _sessions.get(session_id)
            if session:
                session["active_task"] = None
                session["response_buffer"] = None
                session["is_generating"] = False

        # Extract final response text as fallback
        response_text = ""
        if final_state:
            for msg in reversed(final_state.get("messages", [])):
                if isinstance(msg, AIMessage) and msg.content:
                    response_text = msg.content
                    break

        await buffer.put(
            {
                "type": "done",
                "response": response_text,
                "tools_used": tools_used,
                "token_usage": (final_state or {}).get("token_usage"),
                "total_tokens": (final_state or {}).get("total_tokens", 0),
                "iteration_count": (final_state or {}).get("iteration_count", 0),
                "elapsed_seconds": elapsed,
            }
        )
        await buffer.put(_STREAM_END)


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream the agent response token-by-token via SSE.

    The LangGraph execution runs in a background asyncio task that writes
    events to an ``asyncio.Queue``.  The SSE generator reads from that queue.
    If the client disconnects, the background task continues to completion
    and persists the final state (T005).
    """
    session = _get_session(request.session_id)

    input_state = dict(session)
    # Strip streaming metadata from the state passed to LangGraph
    input_state.pop("active_task", None)
    input_state.pop("response_buffer", None)
    input_state.pop("is_generating", None)

    input_state["messages"] = list(session.get("messages", [])) + [
        HumanMessage(content=request.message)
    ]

    # Create the response buffer and background task
    buffer: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(
        _run_langgraph_task(request.session_id, input_state, buffer)
    )

    # Store references in the session so other endpoints can inspect state
    session["active_task"] = task
    session["response_buffer"] = buffer
    session["is_generating"] = True

    async def event_generator():
        try:
            while True:
                event = await buffer.get()
                if event is _STREAM_END:
                    break
                yield _sse(event)
        except asyncio.CancelledError:
            # Client disconnected — the background task keeps running
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── Title generation ─────────────────────────────────────────────

@router.post("/chat/title", response_model=TitleResponse)
async def generate_title(request: TitleRequest) -> TitleResponse:
    """Generate a short chat title from the first user message."""
    from agent.llm import get_llm

    model = get_llm()
    fallback = request.message[:50] + ("…" if len(request.message) > 50 else "")

    if not model:
        return TitleResponse(title=fallback)

    try:
        response = await model.ainvoke([
            HumanMessage(
                content=(
                    "Generate a very short title (max 6 words) for a chat that "
                    f'starts with: "{request.message[:300]}". '
                    "Reply with ONLY the title, no quotes, no punctuation at the end."
                )
            )
        ])
        title = str(response.content).strip().strip('"\'')[:60]
        return TitleResponse(title=title or fallback)
    except Exception:
        logger.exception("Title generation failed")
        return TitleResponse(title=fallback)


# ── Settings endpoints ──────────────────────────────────────────────

@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint() -> SettingsResponse:
    """Return current LLM settings."""
    return SettingsResponse(**get_settings())


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate) -> SettingsResponse:
    """Update LLM settings, reinitialize the model, and persist to .env."""
    ok = reinitialize_llm(
        model_name=body.model_name,
        temperature=body.temperature,
        ollama_base_url=body.ollama_base_url,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to apply settings")
    return SettingsResponse(**get_settings())


# ── Ollama model listing ────────────────────────────────────────────

@router.get("/ollama/models", response_model=OllamaModelsResponse)
async def get_ollama_models() -> OllamaModelsResponse:
    """List locally available Ollama models with tier classification."""
    models_raw = await list_ollama_models()
    models = [OllamaModel(**m) for m in models_raw]
    return OllamaModelsResponse(models=models)


# ── Memory extraction helper ───────────────────────────────────────

_MIN_MESSAGES_FOR_EXTRACTION = 4


async def _trigger_memory_extraction(session_id: str, state: Dict[str, Any]) -> None:
    """Extract facts and summarize the conversation for long-term memory.

    Called as a fire-and-forget task after a chat response completes.
    Only runs when the session has >= ``_MIN_MESSAGES_FOR_EXTRACTION``
    user+assistant messages.
    """
    try:
        from memory import get_memory_manager

        messages = state.get("messages", [])
        # Count only user/assistant messages
        meaningful = [
            m for m in messages
            if isinstance(m, (HumanMessage, AIMessage)) and getattr(m, "content", "")
        ]
        if len(meaningful) < _MIN_MESSAGES_FOR_EXTRACTION:
            return

        mm = get_memory_manager()

        # Build simple dicts for the LLM prompts
        msg_dicts = []
        for m in meaningful:
            role = "user" if isinstance(m, HumanMessage) else "assistant"
            msg_dicts.append({"role": role, "content": m.content})

        # Extract and save facts
        facts = await mm.extract_facts_from_conversation(msg_dicts)
        if facts:
            await mm.save_facts(facts, source_session=session_id)

        # Summarize episode
        episode_data = await mm.summarize_episode(msg_dicts, session_id)
        if episode_data:
            await mm.episodic.save_episode(
                session_id=session_id,
                summary=episode_data.get("summary", ""),
                key_topics=episode_data.get("key_topics", []),
                message_count=len(meaningful),
            )
    except Exception:
        logger.exception("Memory extraction failed for session %s", session_id)


# ── Memory API routes ──────────────────────────────────────────────

@router.get("/memory/facts", response_model=FactListResponse)
async def get_memory_facts() -> FactListResponse:
    """List all stored memory facts."""
    from memory import get_memory_manager

    mm = get_memory_manager()
    facts = await mm.get_all_facts()
    return FactListResponse(
        facts=[
            FactResponse(
                id=f.id,
                key=f.key,
                value=f.value,
                source_session=f.source_session,
                confidence=f.confidence,
                updated_at=f.updated_at.isoformat() if f.updated_at else None,
            )
            for f in facts
        ],
        count=len(facts),
    )


@router.delete("/memory/facts", response_model=MemoryClearResponse)
async def clear_memory_facts() -> MemoryClearResponse:
    """Delete all stored memory facts."""
    from memory import get_memory_manager

    mm = get_memory_manager()
    count = await mm.delete_all_facts()
    return MemoryClearResponse(deleted_count=count, message=f"Deleted {count} facts")


@router.get("/memory/episodes", response_model=EpisodeListResponse)
async def get_memory_episodes(limit: int = 50, offset: int = 0) -> EpisodeListResponse:
    """List episodic memory records with pagination."""
    from memory import get_memory_manager

    mm = get_memory_manager()
    episodes = await mm.episodic.get_all_episodes(limit=limit, offset=offset)
    total = await mm.episodic.count_episodes()
    return EpisodeListResponse(
        episodes=[
            EpisodeResponse(
                id=e.id,
                session_id=e.session_id,
                summary=e.summary,
                key_topics=e.key_topics,
                message_count=e.message_count,
                created_at=e.created_at.isoformat() if e.created_at else None,
            )
            for e in episodes
        ],
        count=total,
    )


@router.delete("/memory/episodes", response_model=MemoryClearResponse)
async def clear_memory_episodes() -> MemoryClearResponse:
    """Delete all episodic memory records."""
    from memory import get_memory_manager

    mm = get_memory_manager()
    count = await mm.episodic.delete_all_episodes()
    return MemoryClearResponse(
        deleted_count=count, message=f"Deleted {count} episodes"
    )


# ── Document API routes (RAG Knowledge Base) ───────────────────────

_ALLOWED_FILE_TYPES = {"pdf", "txt", "md"}
_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/documents/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...)) -> DocumentResponse:
    """Upload a document to the knowledge base for RAG ingestion."""
    import tempfile

    from memory.rag.store import ChromaVectorStore
    from memory.rag.ingestion import DocumentIngestionPipeline

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(_ALLOWED_FILE_TYPES)}",
        )

    # Read file content to check size
    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(content)} bytes). Max: {_MAX_FILE_SIZE} bytes (50MB)",
        )

    # Save to temp file for ingestion
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        store = ChromaVectorStore()
        pipeline = DocumentIngestionPipeline(store)
        doc = await pipeline.ingest(
            file_path=tmp_path,
            original_name=file.filename,
            file_type=ext,
            file_size=len(content),
        )

        if doc.status == "error":
            raise HTTPException(
                status_code=500,
                detail=f"Ingestion failed: {doc.error_message}",
            )

        return DocumentResponse(
            id=doc.id,
            name=doc.name,
            file_type=doc.file_type,
            size_bytes=doc.size_bytes,
            chunk_count=doc.chunk_count,
            status=doc.status,
            error_message=doc.error_message,
            created_at=doc.created_at.isoformat() if doc.created_at else None,
            updated_at=doc.updated_at.isoformat() if doc.updated_at else None,
        )
    finally:
        import os
        os.unlink(tmp_path)


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(status: str | None = Query(None)) -> DocumentListResponse:
    """List all documents in the knowledge base."""
    from memory.rag.ingestion import get_documents

    docs = await get_documents(status=status)
    return DocumentListResponse(
        documents=[
            DocumentResponse(
                id=d.id,
                name=d.name,
                file_type=d.file_type,
                size_bytes=d.size_bytes,
                chunk_count=d.chunk_count,
                status=d.status,
                error_message=d.error_message,
                created_at=d.created_at.isoformat() if d.created_at else None,
                updated_at=d.updated_at.isoformat() if d.updated_at else None,
            )
            for d in docs
        ],
        count=len(docs),
    )


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document_endpoint(document_id: str) -> DocumentResponse:
    """Get a single document by ID."""
    from memory.rag.ingestion import get_document

    doc = await get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse(
        id=doc.id,
        name=doc.name,
        file_type=doc.file_type,
        size_bytes=doc.size_bytes,
        chunk_count=doc.chunk_count,
        status=doc.status,
        error_message=doc.error_message,
        created_at=doc.created_at.isoformat() if doc.created_at else None,
        updated_at=doc.updated_at.isoformat() if doc.updated_at else None,
    )


@router.delete("/documents/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document_endpoint(document_id: str) -> DocumentDeleteResponse:
    """Delete a document and its chunks from the knowledge base."""
    from memory.rag.store import ChromaVectorStore
    from memory.rag.ingestion import delete_document

    store = ChromaVectorStore()
    deleted = await delete_document(document_id, store)

    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentDeleteResponse(
        deleted=True, message=f"Document {document_id} deleted successfully"
    )
