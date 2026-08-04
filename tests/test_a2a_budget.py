"""Execution budgets: the ceiling that stops an agent circling forever.

The behaviour under test is not "the task fails when it runs out" — it is the
opposite. A budget breach must convert the work already done into an answer,
because a research agent that searched four times has the material; what it
lacks is the decision to stop.
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from nova_a2a.agents._common import AgentSpec, skill
from nova_a2a.budget import Budget, BudgetTracker
from nova_a2a.models import Task, TaskState


@pytest.fixture
def spec():
    return AgentSpec(
        id="stub",
        name="Stub agent",
        description="does stub things",
        skills=(skill("stub.do", "Do", "Does the thing"),),
        tool_names=("web_search",),
    )


def _call(name: str, **args):
    return {"name": name, "args": args, "id": f"c{abs(hash((name, tuple(args.items()))))}"}


# ── Tracker ──────────────────────────────────────────────────────────


def test_tracker_allows_work_within_budget():
    tracker = BudgetTracker(Budget(max_steps=5, max_tool_calls=5, max_seconds=60))

    assert tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="a")])]) is None
    assert tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="b")])]) is None
    assert tracker.tool_calls == 2


def test_tracker_stops_on_the_tool_call_ceiling():
    tracker = BudgetTracker(Budget(max_steps=99, max_tool_calls=2, max_seconds=60))

    tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="a")])])
    reason = tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="b")])])

    assert reason is not None
    assert "2 tool calls" in reason


def test_tracker_stops_on_the_step_ceiling():
    tracker = BudgetTracker(Budget(max_steps=2, max_tool_calls=99, max_seconds=60))

    tracker.observe([AIMessage(content="thinking")])
    reason = tracker.observe([AIMessage(content="still thinking")])

    assert reason is not None
    assert "reasoning steps" in reason


def test_tracker_catches_a_search_repeated_in_a_slightly_different_shape():
    """The loop that actually happens: the same query, re-cased and re-spaced."""
    tracker = BudgetTracker(Budget(max_steps=99, max_tool_calls=99, max_seconds=60, max_repeats=0))

    assert tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="LangGraph  Release Notes")])]) is None
    reason = tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="langgraph release notes")])])

    assert reason is not None
    assert "repeating" in reason


def test_tracker_allows_one_retry_by_default():
    """A single repeat is often a legitimate recovery from a transient failure."""
    tracker = BudgetTracker(Budget(max_steps=99, max_tool_calls=99, max_seconds=60, max_repeats=1))

    call = _call("web_search", q="same")
    assert tracker.observe([AIMessage(content="", tool_calls=[call])]) is None
    assert tracker.observe([AIMessage(content="", tool_calls=[call])]) is None
    assert tracker.observe([AIMessage(content="", tool_calls=[call])]) is not None


def test_tracker_stops_on_the_clock():
    # One tick is consumed when the tracker starts, then one per check.
    ticks = iter([0.0, 5.0, 45.0])
    tracker = BudgetTracker(Budget(max_seconds=30), clock=lambda: next(ticks))

    assert tracker.observe([]) is None
    assert tracker.observe([]) is not None


def test_tracker_reports_only_the_first_breach():
    """Later limits are consequences of the first, not separate diagnoses."""
    tracker = BudgetTracker(Budget(max_steps=1, max_tool_calls=1, max_seconds=60))

    first = tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="a")])])
    assert tracker.observe([AIMessage(content="", tool_calls=[_call("web_search", q="b")])]) == first


# ── Budget composition ───────────────────────────────────────────────


def test_an_agent_may_tighten_the_deployment_budget_but_never_loosen_it():
    deployment = Budget(max_steps=6, max_tool_calls=8, max_seconds=180, max_repeats=1)
    greedy = Budget(max_steps=99, max_tool_calls=99, max_seconds=9999, max_repeats=99)
    strict = Budget(max_steps=3, max_tool_calls=2, max_seconds=30, max_repeats=0)

    assert deployment.merge(greedy) == deployment
    assert deployment.merge(strict) == strict
    assert deployment.merge(None) == deployment


def test_budget_reads_the_environment(monkeypatch):
    monkeypatch.setenv("NOVA_TASK_MAX_TOOL_CALLS", "3")
    monkeypatch.setenv("NOVA_TASK_MAX_SECONDS", "45.5")
    # Nonsense and non-positive values fall back rather than disabling a limit.
    monkeypatch.setenv("NOVA_TASK_MAX_STEPS", "not-a-number")
    monkeypatch.setenv("NOVA_TASK_MAX_REPEATS", "-4")

    budget = Budget.from_env()

    assert budget.max_tool_calls == 3
    assert budget.max_seconds == 45.5
    assert budget.max_steps == Budget().max_steps
    assert budget.max_repeats == Budget().max_repeats


# ── The worker under budget pressure ─────────────────────────────────


@pytest.mark.asyncio
async def test_a_task_that_runs_out_of_budget_answers_with_what_it_gathered(monkeypatch, spec):
    """The whole point: a stopped agent still delivers, and says why it stopped."""
    from nova_a2a import worker as worker_mod

    spec = AgentSpec(**{**spec.__dict__, "budget": Budget(max_tool_calls=2, max_seconds=60)})

    class SearchesForever:
        """A worker that never decides it has enough — the real failure mode."""

        def __init__(self):
            self.rounds = 0

        async def astream(self, state, config=None, stream_mode=None):
            messages = list(state["messages"])
            while True:
                self.rounds += 1
                messages = messages + [
                    AIMessage(
                        content="",
                        tool_calls=[{"name": "web_search", "args": {"q": f"q{self.rounds}"}, "id": f"c{self.rounds}"}],
                    ),
                    ToolMessage(content=f"result {self.rounds}", name="web_search", tool_call_id=f"c{self.rounds}"),
                ]
                yield {"messages": list(messages)}

    graph = SearchesForever()
    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: graph)

    class LLM:
        """Stands in for the tool-less concluding call."""

        async def ainvoke(self, messages, config=None):
            return AIMessage(content="Findings: result 1, result 2.")

    monkeypatch.setattr("agent.llm.get_llm", lambda: LLM())

    result = await worker_mod.run_task(spec, Task(id="T1", skill="stub.do", goal="research widgets"))

    assert result.state is TaskState.COMPLETED
    assert "Findings" in result.artifact.text
    assert result.budget_note and "2 tool calls" in result.budget_note
    # Stopped, not merely observed: the graph did not get to run again.
    assert graph.rounds <= 3


@pytest.mark.asyncio
async def test_the_budget_note_travels_on_the_task_end_event(monkeypatch, spec):
    """The UI can only show why an agent stopped if the event carries it."""
    from nova_a2a import worker as worker_mod

    spec = AgentSpec(**{**spec.__dict__, "budget": Budget(max_steps=1, max_seconds=60)})
    events: list[dict] = []

    class OneStep:
        async def astream(self, state, config=None, stream_mode=None):
            yield {"messages": [HumanMessage(content="go"), AIMessage(content="a partial answer")]}

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: OneStep())
    monkeypatch.setattr("agent.llm.get_llm", lambda: None)  # no concluding call available

    await worker_mod.run_task(
        spec, Task(id="T1", skill="stub.do", goal="x"), on_event=lambda e: events.append(e) or _noop()
    )

    end = next(e for e in events if e["type"] == "task_end")
    assert "note" in end and "reasoning steps" in end["note"]


async def _noop():
    return None
