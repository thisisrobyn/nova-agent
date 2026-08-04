"""Execution budgets — the ceiling on what one task may spend.

LangGraph's ``recursion_limit`` is a safety net for the *graph*, not a policy
for the *work*: it fires as an exception after a fixed number of super-steps,
which turns "the agent searched one time too many" into a failed task with no
answer at all. That is the wrong shape for a research agent, whose failure mode
is not crashing but never deciding it has enough.

A budget is the policy layer above it. It bounds a task on four axes — LLM
steps, tool calls, repeated calls and wall-clock time — and when one is hit the
worker does not fail: it stops calling tools and asks the model to answer with
what it already gathered. Running out of budget with a partial answer beats
running out of patience with none.

Defaults are per-agent (a researcher may search more than an advisor may think)
and overridable per deployment through the environment, because the right
ceiling depends entirely on how fast the local model is.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, Optional

import structlog
from langchain_core.messages import AIMessage

logger = structlog.stdlib.get_logger(__name__)


def _env_int(name: str, default: int) -> int:
    """Read a positive int from the environment, ignoring anything unusable."""
    try:
        value = int(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _env_float(name: str, default: float) -> float:
    """Read a positive float from the environment, ignoring anything unusable."""
    try:
        value = float(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class Budget:
    """What a single task is allowed to spend.

    Attributes:
        max_steps: LLM calls in the ReAct loop. Each step is one round of
            "think, maybe call a tool".
        max_tool_calls: Total tool invocations across the whole task.
        max_seconds: Wall-clock ceiling, including time spent inside tools.
        max_repeats: How many times the *same* call (tool + arguments) may be
            repeated before the task is considered to be going in circles.
            ``1`` allows a single retry, which is often a legitimate recovery.
    """

    max_steps: int = 6
    max_tool_calls: int = 8
    max_seconds: float = 180.0
    max_repeats: int = 1

    @staticmethod
    def from_env() -> "Budget":
        """The deployment-wide default, read from the environment."""
        return Budget(
            max_steps=_env_int("NOVA_TASK_MAX_STEPS", 6),
            max_tool_calls=_env_int("NOVA_TASK_MAX_TOOL_CALLS", 8),
            max_seconds=_env_float("NOVA_TASK_MAX_SECONDS", 180.0),
            max_repeats=_env_int("NOVA_TASK_MAX_REPEATS", 1),
        )

    def merge(self, override: Optional["Budget"]) -> "Budget":
        """Apply an agent's own ceiling on top of this one.

        An agent may only ever be *stricter* than the deployment default —
        otherwise a single agent definition could quietly opt out of a limit an
        operator set deliberately.
        """
        if override is None:
            return self
        return Budget(
            max_steps=min(self.max_steps, override.max_steps),
            max_tool_calls=min(self.max_tool_calls, override.max_tool_calls),
            max_seconds=min(self.max_seconds, override.max_seconds),
            max_repeats=min(self.max_repeats, override.max_repeats),
        )


@dataclass(frozen=True)
class RetryPolicy:
    """When a failed task is worth running again.

    Only *transient* failures are retried. A worker that reported "no calendar
    connected", a plan that named a skill nobody provides, or a task stopped by
    its own budget will fail identically every time — retrying those burns the
    user's time to reach the same answer. What is worth retrying is the
    infrastructure flake: a timed-out HTTP call, a model that returned nothing.

    Attributes:
        max_attempts: Total attempts, including the first. ``1`` disables
            retries entirely.
        backoff_seconds: Delay before the second attempt; doubled for each
            further one.
    """

    max_attempts: int = 2
    backoff_seconds: float = 1.0

    @staticmethod
    def from_env() -> "RetryPolicy":
        """The deployment-wide retry policy, read from the environment."""
        return RetryPolicy(
            max_attempts=_env_int("NOVA_TASK_MAX_ATTEMPTS", 2),
            backoff_seconds=_env_float("NOVA_TASK_RETRY_BACKOFF", 1.0),
        )

    def delay_for(self, attempt: int) -> float:
        """Seconds to wait before *attempt* (1-based, so attempt 2 is the first retry)."""
        return self.backoff_seconds * (2 ** max(0, attempt - 2))


def _signature(call: Dict[str, object]) -> str:
    """Canonical identity of a tool call, so near-identical repeats collapse.

    Arguments are serialised with sorted keys and case-folded: a model that
    searches "LangGraph release notes" and then "langgraph release notes" is
    doing the same search twice, and the second one costs just as much.
    """
    name = str(call.get("name", "unknown")).strip().lower()
    args = call.get("args")
    try:
        rendered = json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        rendered = str(args)
    return f"{name}::{' '.join(rendered.lower().split())}"


class BudgetTracker:
    """Watches one task's spending and says when to stop.

    Fed the messages a worker produces as they arrive; returns a human-readable
    reason the first time a limit is crossed, and ``None`` while there is room
    left. The reason is surfaced to the user, so it explains what happened in
    terms of the work, not of the graph.
    """

    def __init__(self, budget: Budget, clock: Callable[[], float] = time.monotonic) -> None:
        self.budget = budget
        self._clock = clock
        self._started = clock()
        self.steps = 0
        self.tool_calls = 0
        self.reason: Optional[str] = None
        self._seen: Dict[str, int] = {}

    @property
    def elapsed(self) -> float:
        """Seconds since the task started."""
        return self._clock() - self._started

    @property
    def remaining_seconds(self) -> float:
        """Time left before the wall-clock ceiling, never negative."""
        return max(0.0, self.budget.max_seconds - self.elapsed)

    def observe(self, messages: Iterable[object]) -> Optional[str]:
        """Account for newly produced *messages* and report any breach.

        Called with the messages a graph step just added — crucially *before*
        the tools in them have run, so a call that would exceed the budget is
        stopped rather than merely noticed afterwards.
        """
        for message in messages:
            if not isinstance(message, AIMessage):
                continue
            self.steps += 1
            for call in (message.tool_calls or []):
                self.tool_calls += 1
                signature = _signature(call)
                self._seen[signature] = self._seen.get(signature, 0) + 1
                if self._seen[signature] > self.budget.max_repeats + 1:
                    self._trip(
                        f"stopped repeating the same {call.get('name', 'tool')} call "
                        f"({self._seen[signature]} times) and answered with what it had"
                    )

        if self.tool_calls >= self.budget.max_tool_calls:
            self._trip(
                f"reached its limit of {self.budget.max_tool_calls} tool calls "
                "and answered with what it had"
            )
        if self.steps >= self.budget.max_steps:
            self._trip(
                f"reached its limit of {self.budget.max_steps} reasoning steps "
                "and answered with what it had"
            )
        if self.elapsed >= self.budget.max_seconds:
            self._trip(
                f"ran past its {self.budget.max_seconds:.0f}s time budget "
                "and answered with what it had"
            )
        return self.reason

    def _trip(self, reason: str) -> None:
        """Record the *first* breach; later ones are consequences of it."""
        if self.reason is None:
            self.reason = reason
