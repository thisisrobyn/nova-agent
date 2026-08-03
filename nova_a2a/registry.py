"""Agent discovery.

The specification describes three ways to find an agent, and NOVA uses two of
them for different things:

1. **Well-known URI** — ``GET https://host/.well-known/agent-card.json``. Used
   *outbound*, to discover third-party agents, and served *inbound* by
   :mod:`api.routes_a2a` so others can discover NOVA. See
   :func:`fetch_remote_card`.
2. **Curated registries** — a central catalogue. Not implemented: the current
   specification does not standardise a registry API, so there is nothing to
   be compatible with yet.
3. **Direct configuration** — for agents whose existence is already known.
   This is what NOVA's own workers use: they live in the same process, so
   discovering them over HTTP would be ceremony with no payoff.

The distinction matters for what NOVA publishes. Its public card advertises
*NOVA*, not its four internal workers — a client should see one capable agent,
not an org chart. Opacity is the property the protocol is built around.

Reference: https://a2a-protocol.org/latest/topics/agent-discovery/
"""

from __future__ import annotations

from typing import Dict, List, Optional

import structlog

from nova_a2a.agents import INTERNAL_AGENTS, AgentSpec
from nova_a2a.models import WELL_KNOWN_PATH, AgentCard

logger = structlog.stdlib.get_logger(__name__)

#: How long to wait on a third-party agent's card before giving up.
_CARD_TIMEOUT_SECONDS = 5.0


# ── Mechanism 3: direct configuration (NOVA's own workers) ───────────


def all_agents() -> List[AgentSpec]:
    """Every internal agent, connected or not."""
    return list(INTERNAL_AGENTS)


def get_agent(agent_id: str) -> Optional[AgentSpec]:
    """Return the internal agent with ``agent_id``, or ``None``."""
    return next((spec for spec in INTERNAL_AGENTS if spec.id == agent_id), None)


async def available_agents() -> List[AgentSpec]:
    """Internal agents that can actually act right now.

    An agent whose provider is not connected is not merely degraded — it would
    fail every task routed to it. Filtering here means the planner never emits
    a task nobody can carry out, which is a far better failure mode than a
    worker apologising at the end of a run.

    Agents with no ``requires_any`` are always available.
    """
    try:
        from connections.store import list_connected_providers

        connected = set(await list_connected_providers())
    except Exception:
        # A fresh install has no connections database yet. Reasoning-only
        # agents still work, so degrade rather than fail.
        logger.warning("could not list connected providers", exc_info=True)
        connected = set()

    available = [
        spec
        for spec in INTERNAL_AGENTS
        if not spec.requires_any or (set(spec.requires_any) & connected)
    ]
    logger.info(
        "a2a agents available",
        count=len(available),
        agents=[spec.id for spec in available],
    )
    return available


async def skill_index() -> Dict[str, AgentSpec]:
    """Map every advertised skill id to the agent that provides it.

    This is what replaces a hardcoded routing table: the planner names a
    skill, the index resolves the agent. Adding an agent adds its skills.
    """
    index: Dict[str, AgentSpec] = {}
    for spec in await available_agents():
        for skill_id in spec.skill_ids:
            if skill_id in index:
                logger.warning(
                    "duplicate skill advertised",
                    skill=skill_id,
                    kept=index[skill_id].id,
                    ignored=spec.id,
                )
                continue
            index[skill_id] = spec
    return index


async def resolve_skill(skill_id: str) -> Optional[AgentSpec]:
    """Find the agent that provides ``skill_id``.

    Falls back to matching on the skill's namespace (``calendar`` in
    ``calendar.schedule``) because a small planner model reliably picks the
    right *area* while occasionally inventing the exact skill name.
    """
    index = await skill_index()
    if skill_id in index:
        return index[skill_id]

    namespace = skill_id.split(".", 1)[0].lower()
    for known_id, spec in index.items():
        if known_id.split(".", 1)[0].lower() == namespace:
            logger.info("skill resolved by namespace", requested=skill_id, matched=known_id)
            return spec

    logger.warning("no agent provides skill", skill=skill_id)
    return None


# ── Mechanism 1: well-known URI (third-party agents) ─────────────────


async def fetch_remote_card(base_url: str) -> Optional[AgentCard]:
    """Fetch and parse another agent's public card.

    Args:
        base_url: Origin of the remote agent, e.g. ``https://agent.example``.
            The well-known path is appended.

    Returns:
        The parsed card, or ``None`` if the host does not serve one, is
        unreachable, or answers with something that is not a valid card.
    """
    import httpx

    url = f"{base_url.rstrip('/')}{WELL_KNOWN_PATH}"
    try:
        async with httpx.AsyncClient(timeout=_CARD_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            card = AgentCard.model_validate(response.json())
    except Exception as exc:
        # A missing card is the normal answer for most hosts on the internet,
        # so this is information, not an error worth raising.
        logger.info("no agent card at %s", url, error=str(exc))
        return None

    logger.info(
        "discovered remote agent",
        name=card.name,
        url=card.url,
        skills=[s.id for s in card.skills],
    )
    return card
