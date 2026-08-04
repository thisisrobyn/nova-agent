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
*NOVA*, not its internal workers — a client should see one capable agent,
not an org chart. Opacity is the property the protocol is built around.

Reference: https://a2a-protocol.org/latest/topics/agent-discovery/
"""

from __future__ import annotations

import os
import time
from typing import Dict, List, Optional, Tuple

import structlog

from nova_a2a.agents import INTERNAL_AGENTS, AgentSpec
from nova_a2a.models import WELL_KNOWN_PATH, AgentCard

logger = structlog.stdlib.get_logger(__name__)

#: How long to wait on a third-party agent's card before giving up.
_CARD_TIMEOUT_SECONDS = 5.0

#: How long a discovered peer's card is trusted before it is fetched again. A
#: peer that gains or loses a skill should be noticed, but not at the cost of
#: two HTTP round trips on every single planning call.
_PEER_CACHE_SECONDS = 300.0

#: (expires_at, specs) of the last successful peer discovery.
_peer_cache: Tuple[float, List[AgentSpec]] = (0.0, [])


# ── Mechanism 3: direct configuration (NOVA's own workers) ───────────


def all_agents() -> List[AgentSpec]:
    """Every internal agent, connected or not."""
    return list(INTERNAL_AGENTS)


def get_agent(agent_id: str) -> Optional[AgentSpec]:
    """Return the internal agent with ``agent_id``, or ``None``."""
    return next((spec for spec in INTERNAL_AGENTS if spec.id == agent_id), None)


async def available_agents() -> List[AgentSpec]:
    """Every agent that can actually act right now, local and remote.

    An agent whose provider is not connected is not merely degraded — it would
    fail every task routed to it. Filtering here means the planner never emits
    a task nobody can carry out, which is a far better failure mode than a
    worker apologising at the end of a run.

    Agents with no ``requires_any`` are always available. Discovered peers are
    appended, so a remote agent's skills reach the planner's catalogue by the
    same route the built-in ones do — which is what makes adding an external
    agent a matter of configuration rather than of code.
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
    local_skills = {skill_id for spec in available for skill_id in spec.skill_ids}
    remote = [
        spec
        for spec in await discover_peers()
        # A peer never shadows a built-in skill: local execution has no network
        # to fail and no third party to trust, so it wins ties by default.
        if not set(spec.skill_ids) & local_skills
    ]

    logger.info(
        "a2a agents available",
        count=len(available) + len(remote),
        agents=[spec.id for spec in available],
        peers=[spec.id for spec in remote],
    )
    return available + remote


# ── Mechanism 1, inbound: peers configured for this deployment ───────


def _peer_urls() -> List[str]:
    """Base URLs of the remote agents this deployment should discover."""
    raw = os.getenv("NOVA_A2A_PEERS", "")
    return [url.strip().rstrip("/") for url in raw.split(",") if url.strip()]


def _spec_from_card(card: AgentCard) -> AgentSpec:
    """Turn a remote agent's card into a spec the planner can route to.

    Skill ids are namespaced under the peer so two agents advertising a
    plausible id like ``search`` cannot collide in the skill index — the
    planner sees ``acme.search`` and the executor knows where to send it.
    """
    from nova_a2a.models import AgentSkill

    peer_id = "".join(ch if ch.isalnum() else "-" for ch in card.name.strip().lower()).strip("-")
    peer_id = peer_id or "peer"
    return AgentSpec(
        id=f"peer:{peer_id}",
        name=card.name,
        description=card.description,
        skills=tuple(
            AgentSkill(
                id=f"{peer_id}.{skill.id}",
                name=skill.name,
                description=skill.description,
                tags=list(skill.tags),
                examples=list(skill.examples),
            )
            for skill in card.skills
        ),
        endpoint=card.url,
    )


async def discover_peers(force: bool = False) -> List[AgentSpec]:
    """Fetch the cards of every configured peer and turn them into specs.

    A peer that is unreachable is simply absent from this list: the planner
    then never routes work to it, which degrades the run to what NOVA can do
    alone instead of failing tasks that were never going to be delivered.
    """
    global _peer_cache

    urls = _peer_urls()
    if not urls:
        return []

    expires_at, cached = _peer_cache
    if not force and cached and time.monotonic() < expires_at:
        return cached

    specs: List[AgentSpec] = []
    for url in urls:
        card = await fetch_remote_card(url)
        if card is not None:
            specs.append(_spec_from_card(card))

    _peer_cache = (time.monotonic() + _PEER_CACHE_SECONDS, specs)
    logger.info("peers discovered", configured=len(urls), reachable=len(specs))
    return specs


def reset_peer_cache() -> None:
    """Forget every discovered peer, so the next call re-fetches their cards."""
    global _peer_cache
    _peer_cache = (0.0, [])


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
