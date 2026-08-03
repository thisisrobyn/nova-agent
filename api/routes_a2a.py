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

The task endpoints (``message/send``, ``message/stream``) are not here yet:
the orchestrator runs its workers in-process, so there is no transport to
serve. See :mod:`nova_a2a.worker` for why, and what changes when there is.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from nova_a2a.card import build_agent_card
from nova_a2a.models import WELL_KNOWN_PATH

logger = structlog.stdlib.get_logger(__name__)

well_known_router = APIRouter(tags=["a2a"])
router = APIRouter(prefix="/api/v1/a2a", tags=["a2a"])


@well_known_router.get(WELL_KNOWN_PATH, summary="NOVA's public A2A Agent Card")
async def agent_card() -> JSONResponse:
    """Serve the Agent Card that describes this deployment.

    Returns the card as camelCase JSON, the protocol's wire format. Fields
    that are unset are omitted rather than sent as ``null``, which some
    clients reject.
    """
    card = await build_agent_card()
    return JSONResponse(card.model_dump(by_alias=True, exclude_none=True))


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
