"""A2A data model — the subset of the protocol NOVA actually uses.

The wire format of the Agent2Agent protocol is camelCase JSON, while the rest
of this codebase is snake_case Python. Every model here therefore carries a
camelCase alias generator: build and read them with Python names, serialise
them with ``model_dump(by_alias=True)``.

Only the parts NOVA needs are modelled. When the HTTP transport lands, these
types are the ones to replace with ``a2a-sdk``'s own — they are deliberately
named and shaped after the specification so that swap stays mechanical.

Reference: https://a2a-protocol.org/latest/specification/
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

#: Specification version these models track.
PROTOCOL_VERSION = "1.0"

#: Where a public Agent Card is served from, per RFC 8615. Note the name: the
#: pre-1.0 drafts used ``agent.json`` and much of the material online still
#: does, but the current specification is ``agent-card.json``.
WELL_KNOWN_PATH = "/.well-known/agent-card.json"


def _camel(name: str) -> str:
    """Convert a snake_case field name to its camelCase wire form."""
    head, *rest = name.split("_")
    return head + "".join(word.capitalize() for word in rest)


class _A2AModel(BaseModel):
    """Base model that serialises to the protocol's camelCase JSON."""

    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)


# ── Agent Card ───────────────────────────────────────────────────────


class AgentSkill(_A2AModel):
    """A single capability an agent advertises on its card."""

    id: str
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)
    examples: List[str] = Field(default_factory=list)
    input_modes: List[str] = Field(default_factory=lambda: ["text"])
    output_modes: List[str] = Field(default_factory=lambda: ["text"])


class AgentCapabilities(_A2AModel):
    """Transport-level features an agent supports."""

    streaming: bool = True
    push_notifications: bool = False
    state_transition_history: bool = False


class AgentCard(_A2AModel):
    """The document served at :data:`WELL_KNOWN_PATH`.

    Identity, capabilities, skills and endpoint — everything a client needs to
    decide whether to talk to this agent, without any prior agreement.
    """

    protocol_version: str = PROTOCOL_VERSION
    name: str
    description: str
    url: str
    version: str
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    default_input_modes: List[str] = Field(default_factory=lambda: ["text"])
    default_output_modes: List[str] = Field(default_factory=lambda: ["text"])
    skills: List[AgentSkill] = Field(default_factory=list)


# ── Tasks ────────────────────────────────────────────────────────────


class TaskState(str, Enum):
    """The task lifecycle defined by the specification.

    ``INPUT_REQUIRED`` is the one worth designing for: it is how a worker asks
    the user a question without aborting the rest of the plan.
    """

    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    #: NOVA extension. The specification models one agent's task lifecycle,
    #: which has no concept of a task that never ran because another one did
    #: not produce its input. Reporting that as FAILED made a dependent look
    #: broken when nothing about it was: it was never attempted.
    SKIPPED = "skipped"


class Artifact(_A2AModel):
    """A typed result produced by a task.

    Workers return artifacts rather than prose so the agents downstream can
    consume the output without re-parsing an essay.
    """

    artifact_id: str
    name: str
    #: Human-readable rendering, always present.
    text: str = ""
    #: Structured payload when the worker has one (event id, doc URL, …).
    data: Dict[str, Any] = Field(default_factory=dict)
    #: Which internal agent produced it — what makes a run auditable.
    produced_by: str = ""
    #: True when the task that produced this did not finish cleanly. The
    #: material is still real and still worth passing downstream, but a
    #: consumer must be told not to treat it as the complete answer.
    partial: bool = False


class ToolCall(_A2AModel):
    """One tool a worker invoked while executing its task.

    Kept on the task itself so the activity a run produced survives past the
    live SSE stream — a reloaded conversation can replay what each agent did,
    not just what it concluded.
    """

    name: str
    #: Truncated rendering of what the tool returned, empty while in flight.
    result: str = ""


class Task(_A2AModel):
    """One unit of work in a plan.

    Carries both the planning fields (``skill``, ``goal``, ``depends_on``) and
    the runtime ones (``state``, ``artifact``, ``error``). They are separate
    concerns on the wire, but a single object is far easier to follow through
    a wave-based executor.
    """

    id: str
    #: Skill id the task needs; matched against agent cards, never hardcoded.
    skill: str
    #: What the task must achieve, in natural language.
    goal: str
    #: Ids of tasks whose artifacts this one consumes.
    depends_on: List[str] = Field(default_factory=list)

    state: TaskState = TaskState.SUBMITTED
    #: Agent the registry resolved this task to, once dispatched.
    assigned_to: Optional[str] = None
    artifact: Optional[Artifact] = None
    error: Optional[str] = None
    #: Every tool the worker called, in call order.
    tools: List[ToolCall] = Field(default_factory=list)
    #: Set when an execution budget cut the task short, explaining which
    #: ceiling was hit. A task can carry this *and* still have completed:
    #: running out of budget means answering with what was gathered.
    budget_note: Optional[str] = None
    #: How many times this task was executed, retries included.
    attempts: int = 1
    #: Set on a task the planner emitted to repair an earlier failure, naming
    #: the task it replaces.
    repairs: Optional[str] = None
    #: Aggregated token usage for the worker that executed this task.
    token_usage: Optional[Dict[str, Any]] = None
    #: Wall-clock seconds this task took to finish.
    elapsed_seconds: Optional[float] = None

    def is_terminal(self) -> bool:
        """Whether the task has stopped progressing, successfully or not."""
        return self.state in {
            TaskState.COMPLETED,
            TaskState.FAILED,
            TaskState.CANCELED,
        }


# ── Planning ─────────────────────────────────────────────────────────


class TaskSpec(BaseModel):
    """A planned task, as the LLM is asked to emit it.

    Deliberately *not* an :class:`_A2AModel`: this never goes on the wire, and
    a snake_case schema is what small local models produce most reliably.
    """

    id: str = Field(description="Short unique id, e.g. 'T1'")
    skill: str = Field(description="Id of the skill required to carry this out")
    goal: str = Field(description="What this task must achieve, one sentence")
    depends_on: List[str] = Field(
        default_factory=list,
        description="Ids of tasks that must finish first; empty if independent",
    )


class Plan(BaseModel):
    """The decomposition of one user request into a task graph."""

    tasks: List[TaskSpec] = Field(default_factory=list)
