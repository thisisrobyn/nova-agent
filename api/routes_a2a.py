"""A2A endpoints.

Two routers, mounted differently on purpose:

``well_known_router``
    Serves the Agent Card at ``/.well-known/agent-card.json``. Per RFC 8615
    the path is fixed and hangs off the *origin*, so this router is mounted
    with no prefix — it cannot live under ``/api/v1`` and still be
    discoverable.

``router``
    Ordinary versioned endpoints under ``/api/v1/a2a`` for NOVA's own UI:
    which agents exist and what they can do. This is introspection, not
    protocol — a third-party client never needs it, and deliberately so, since
    the workers are an internal detail the card does not expose.


``a2a_router``
    ``POST /a2a`` — the JSON-RPC endpoint the card advertises, so another
    agent can actually give NOVA work. Mounted at the origin for the same
    reason as the card: the URL a peer reads from the card must be the URL it
    can post to.

Only ``message/send`` is served. ``message/stream`` is the natural follow-up
and would let a caller watch NOVA's own agents work, the way its UI does.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from nova_a2a.card import build_agent_card
from nova_a2a.models import WELL_KNOWN_PATH

logger = structlog.stdlib.get_logger(__name__)

well_known_router = APIRouter(tags=["a2a"])
a2a_router = APIRouter(tags=["a2a"])
router = APIRouter(prefix="/api/v1/a2a", tags=["a2a"])

#: JSON-RPC error codes used here, from the specification's own table.
_PARSE_ERROR = -32700
_INVALID_REQUEST = -32600
_METHOD_NOT_FOUND = -32601
_INTERNAL_ERROR = -32603


def _rpc_error(request_id: Any, code: int, message: str) -> JSONResponse:
    """A JSON-RPC error response. Always HTTP 200: the error is in the body."""
    return JSONResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    )


def _text_of_message(message: Dict[str, Any]) -> str:
    """Concatenate the text parts of an incoming A2A message."""
    parts = message.get("parts") or []
    chunks = [
        str(part.get("text", ""))
        for part in parts
        if isinstance(part, dict) and part.get("kind", "text") == "text"
    ]
    return "\n".join(chunk for chunk in chunks if chunk).strip()


@well_known_router.get(WELL_KNOWN_PATH, summary="NOVA's public A2A Agent Card")
async def agent_card() -> JSONResponse:
    """Serve the Agent Card that describes this deployment.

    Returns the card as camelCase JSON, the protocol's wire format. Fields
    that are unset are omitted rather than sent as ``null``, which some
    clients reject.
    """
    card = await build_agent_card()
    return JSONResponse(card.model_dump(by_alias=True, exclude_none=True))


@a2a_router.post("/a2a", summary="A2A JSON-RPC endpoint")
async def a2a_rpc(request: Request) -> JSONResponse:
    """Accept a task from another agent and answer it.

    NOVA answers as *one* agent: the caller sends a request, NOVA runs its
    whole orchestrator over it — planning, workers, synthesis — and returns the
    single reply. That the work was split across several agents internally is not
    the caller's business, which is the same opacity the card is built around.

    Each caller conversation is kept in its own session, keyed by the
    ``contextId`` the protocol provides, so a peer can hold a multi-turn
    conversation without its context leaking into anyone else's.
    """
    try:
        payload = await request.json()
    except Exception:
        return _rpc_error(None, _PARSE_ERROR, "request body is not valid JSON")

    if not isinstance(payload, dict):
        return _rpc_error(None, _INVALID_REQUEST, "request must be a JSON object")

    request_id = payload.get("id")
    method = payload.get("method")
    if method != "message/send":
        return _rpc_error(request_id, _METHOD_NOT_FOUND, f"unsupported method '{method}'")

    message = ((payload.get("params") or {}).get("message")) or {}
    text = _text_of_message(message)
    if not text:
        return _rpc_error(request_id, _INVALID_REQUEST, "message has no text part")

    context_id = str(message.get("contextId") or uuid.uuid4().hex)
    session_id = f"a2a:{context_id}"

    # Imported here rather than at module scope: the chat routes pull in the
    # whole agent stack, and the card endpoints must stay cheap to serve.
    from api.routes import run_turn_for_a2a

    try:
        answer = await run_turn_for_a2a(session_id, text)
    except Exception as exc:
        logger.exception("a2a task failed", context_id=context_id)
        return _rpc_error(request_id, _INTERNAL_ERROR, str(exc))

    logger.info("a2a task answered", context_id=context_id, chars=len(answer))
    return JSONResponse(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "kind": "message",
                "role": "agent",
                "messageId": uuid.uuid4().hex,
                "contextId": context_id,
                "parts": [{"kind": "text", "text": answer}],
            },
        }
    )


@router.get("/agents", summary="Internal agents and their status")
async def list_agents() -> JSONResponse:
    """List NOVA's internal agents and whether each can currently act.

    An agent is unavailable when none of the accounts it needs is connected —
    the same rule that keeps its skills off the public card.
    """
    from nova_a2a.registry import all_agents, available_agents

    usable = {spec.id for spec in await available_agents()}
    agents = [
        {
            "id": spec.id,
            "name": spec.name,
            "description": spec.description,
            "skills": [skill.model_dump(by_alias=True) for skill in spec.skills],
            "requires_any": list(spec.requires_any),
            "available": spec.id in usable,
        }
        for spec in all_agents()
    ]
    return JSONResponse({"agents": agents})
