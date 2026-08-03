"""Shared definition of an internal NOVA agent.

Each module in this package declares one :class:`AgentSpec`: a name, the
skills it advertises, the tools it is allowed to touch, and the connections it
needs to be useful. That is the whole contract — the executor in
:mod:`nova_a2a.worker` turns a spec into a running ReAct graph.

Keeping the tool belt narrow is the point of the exercise. The single-agent
graph binds every tool at once, which on a small local model leaves little
room for the conversation itself. A worker that sees eight tool schemas
instead of thirty-nine has a context window that fits.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

from nova_a2a.models import AgentSkill


@dataclass(frozen=True)
class AgentSpec:
    """Declarative description of one internal agent."""

    #: Stable identifier, used in traces and artifact attribution.
    id: str
    name: str
    description: str

    #: Skills this agent advertises. The planner matches tasks against these.
    skills: Tuple[AgentSkill, ...]

    #: Exact LangChain tool names this agent may call. An empty tuple means a
    #: reasoning-only agent, which is a legitimate kind of worker.
    tool_names: Tuple[str, ...] = ()

    #: Provider ids of which *at least one* must be connected for this agent to
    #: be able to act. Empty means it never needs an external account.
    requires_any: Tuple[str, ...] = ()

    #: Appended to the worker system prompt — the agent's operating brief.
    instructions: str = ""

    @property
    def skill_ids(self) -> Tuple[str, ...]:
        """Ids of every skill this agent advertises."""
        return tuple(skill.id for skill in self.skills)


def skill(
    skill_id: str,
    name: str,
    description: str,
    *,
    tags: Tuple[str, ...] = (),
    examples: Tuple[str, ...] = (),
) -> AgentSkill:
    """Build an :class:`AgentSkill` with tuple defaults made mutable-safe."""
    return AgentSkill(
        id=skill_id,
        name=name,
        description=description,
        tags=list(tags),
        examples=list(examples),
    )
