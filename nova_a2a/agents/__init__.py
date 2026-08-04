"""NOVA's internal A2A agents.

One module per agent, each exporting a single ``SPEC``. Registering a new
agent means adding a module here and listing it in :data:`INTERNAL_AGENTS` —
the planner and the registry pick it up from the spec alone, with no routing
table to update.
"""

from __future__ import annotations

from typing import Tuple

from nova_a2a.agents._common import AgentSpec
from nova_a2a.agents import advisor, calendar, docs, github, mail, research

#: Every agent NOVA ships with, in a stable order.
INTERNAL_AGENTS: Tuple[AgentSpec, ...] = (
    calendar.SPEC,
    mail.SPEC,
    research.SPEC,
    docs.SPEC,
    github.SPEC,
    advisor.SPEC,
)

__all__ = ["AgentSpec", "INTERNAL_AGENTS"]
