"""NOVA's own public Agent Card.

Served at :data:`nova_a2a.models.WELL_KNOWN_PATH`. The card describes NOVA as
a single agent — the internal workers are an implementation detail a client
has no business knowing about.

The skill list is built from the agents that are *actually usable*, so the
card is honest about a given deployment: a fresh install with nothing
connected advertises research and advice, and gains calendar and document
skills the moment an account is signed in. Advertising a skill that would fail
on every call is worse than advertising none.
"""

from __future__ import annotations

from typing import List

import structlog

from nova_a2a.models import AgentCapabilities, AgentCard, AgentSkill
from nova_a2a.registry import available_agents

logger = structlog.stdlib.get_logger(__name__)

AGENT_NAME = "NOVA"
AGENT_DESCRIPTION = (
    "Neural Orchestration & Virtual Agent — an assistant that decomposes a "
    "request across specialised agents and acts on the user's connected "
    "Google, Microsoft and GitHub accounts."
)


def _version() -> str:
    """The project version, read from installed metadata.

    Falls back to ``0.0.0`` when NOVA is run from a source checkout that was
    never installed, which is the normal state during development.
    """
    try:
        from importlib.metadata import version

        return version("nova-agent")
    except Exception:
        return "0.0.0"


def _endpoint() -> str:
    """Public URL of NOVA's A2A endpoint.

    Reuses ``NOVA_PUBLIC_URL`` — the same base the OAuth redirect URIs are
    built from — so a deployment configures its public origin exactly once.
    """
    from connections.providers import get_public_url

    return f"{get_public_url()}/a2a"


async def build_agent_card() -> AgentCard:
    """Assemble the card for this deployment, right now."""
    skills: List[AgentSkill] = []
    for spec in await available_agents():
        skills.extend(spec.skills)

    card = AgentCard(
        name=AGENT_NAME,
        description=AGENT_DESCRIPTION,
        url=_endpoint(),
        version=_version(),
        capabilities=AgentCapabilities(
            # SSE streaming already backs /chat/stream, so the orchestrator can
            # stream per-task updates over the same mechanism.
            streaming=True,
            # Neither is implemented yet; claiming them would make clients wait
            # for callbacks that never arrive.
            push_notifications=False,
            state_transition_history=False,
        ),
        skills=skills,
    )
    logger.info("agent card built", skills=len(skills), url=card.url)
    return card
