"""NOVA REST API routes."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent.graph import compiled_graph, run_agent_once
from agent.llm import get_settings, reinitialize_llm
from api.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    HistoryResponse,
    SettingsResponse,
    SettingsUpdate,
    ToolInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# In-memory session store
_sessions: Dict[str, Dict[str, Any]] = {}


def _get_session(session_id: str) -> Dict[str, Any]:
    """Return the agent state for a session, creating it if needed."""
    if session_id not in _sessions:
        _sessions[session_id] = {
            "messages": [],
            "memory_context": "",
            "tool_results": [],
            "iteration_count": 0,
            "total_tokens": 0,
            "token_usage": None,
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
            messages.append(ChatMessage(role="user", content=msg.content))
        elif isinstance(msg, AIMessage) and msg.content:
            messages.append(ChatMessage(role="assistant", content=msg.content))
        elif isinstance(msg, ToolMessage):
            messages.append(ChatMessage(
                role="tool",
                content=msg.content[:200],
                tools_used=[ToolInfo(name=msg.name or "unknown", result=msg.content[:200])],
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
    return {"status": "cleared", "session_id": session_id}


# ── Streaming endpoint ──────────────────────────────────────────────

def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream the agent response token-by-token via SSE."""
    state = _get_session(request.session_id)

    input_state = dict(state)
    input_state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=request.message)
    ]

    async def event_generator():
        tools_used: list[dict] = []
        final_state: Dict[str, Any] | None = None

        try:
            async for event in compiled_graph.astream_events(
                input_state, version="v2"
            ):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    content = getattr(chunk, "content", None)
                    if isinstance(content, str) and content:
                        yield _sse({"type": "token", "content": content})

                elif kind == "on_tool_start":
                    yield _sse({"type": "tool_start", "name": event["name"]})

                elif kind == "on_tool_end":
                    result = str(event["data"].get("output", ""))[:200]
                    tools_used.append(
                        {"name": event["name"], "result": result}
                    )
                    yield _sse(
                        {
                            "type": "tool_end",
                            "name": event["name"],
                            "result": result,
                        }
                    )

                elif kind == "on_chain_end" and event.get("name") == "LangGraph":
                    final_state = event["data"].get("output")

        except Exception as exc:
            logger.exception("Streaming error")
            yield _sse({"type": "error", "message": str(exc)})
            return

        if final_state:
            _sessions[request.session_id] = final_state

        yield _sse(
            {
                "type": "done",
                "tools_used": tools_used,
                "token_usage": (final_state or {}).get("token_usage"),
                "total_tokens": (final_state or {}).get("total_tokens", 0),
                "iteration_count": (final_state or {}).get(
                    "iteration_count", 0
                ),
            }
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── Settings endpoints ──────────────────────────────────────────────

@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint() -> SettingsResponse:
    """Return current LLM settings."""
    return SettingsResponse(**get_settings())


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate) -> SettingsResponse:
    """Update LLM settings, reinitialize the model, and persist to .env."""
    ok = reinitialize_llm(
        api_key=body.openai_api_key,
        model_name=body.model_name,
        temperature=body.temperature,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to apply settings")
    return SettingsResponse(**get_settings())
