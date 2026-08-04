"""Partial failure: one broken service must not take the plan down with it.

The behaviour these lock in is the difference between "Google Calendar is
unavailable, so here is nothing" and "Google Calendar is unavailable — here is
the research and the draft, and the meeting is the one thing still to do".
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from nova_a2a import executor as executor_mod
from nova_a2a.agents._common import AgentSpec, skill
from nova_a2a.models import Artifact, Task, TaskState


@pytest.fixture
def stub_agent():
    return AgentSpec(
        id="stub",
        name="Stub agent",
        description="test",
        skills=(skill("stub.do", "Do", "does"),),
        tool_names=("web_search",),
    )


def _async(value):
    async def _inner(*_args, **_kwargs):
        return value

    return _inner()


def _artifact(text: str, partial: bool = False) -> Artifact:
    return Artifact(artifact_id="a1", name="stub.do", text=text, partial=partial)


# ── The DAG keeps moving ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_dependent_runs_on_partial_input_instead_of_being_skipped(monkeypatch, stub_agent):
    """The headline fix: a failure that still produced material does not block."""
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))
    monkeypatch.setenv("NOVA_TASK_MAX_ATTEMPTS", "1")
    seen_context = {}

    async def run(spec, task, context, request="", **_):
        seen_context[task.id] = list(context)
        result = task.model_copy(deep=True)
        if task.id == "T1":
            result.state = TaskState.FAILED
            result.error = "the calendar is unavailable"
            result.artifact = _artifact("two of four searches came back", partial=True)
        else:
            result.state = TaskState.COMPLETED
            result.artifact = _artifact(f"done {task.id}")
        return result

    monkeypatch.setattr(executor_mod, "run_task", run)

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="research"),
            Task(id="T2", skill="stub.do", goal="write it up", depends_on=["T1"]),
        ]
    )

    by_id = {task.id: task for task in results}
    assert by_id["T2"].state is TaskState.COMPLETED
    # And it was actually handed the partial material.
    assert [a.text for a in seen_context["T2"]] == ["two of four searches came back"]


@pytest.mark.asyncio
async def test_a_dependent_is_skipped_only_when_there_is_nothing_to_work_from(
    monkeypatch, stub_agent
):
    """No input at all still blocks — writing a report from nothing invents one."""
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))
    monkeypatch.setenv("NOVA_TASK_MAX_ATTEMPTS", "1")

    async def run(spec, task, context, request="", **_):
        result = task.model_copy(deep=True)
        result.state = TaskState.FAILED
        result.error = "nothing at all"
        return result

    monkeypatch.setattr(executor_mod, "run_task", run)

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="research"),
            Task(id="T2", skill="stub.do", goal="write it up", depends_on=["T1"]),
        ]
    )

    by_id = {task.id: task for task in results}
    assert by_id["T2"].state is TaskState.SKIPPED
    # "not attempted" — never the old "did not complete", which read as a bug.
    assert "not attempted" in by_id["T2"].error
    assert "did not complete" not in by_id["T2"].error


@pytest.mark.asyncio
async def test_unrelated_work_completes_when_one_branch_fails(monkeypatch, stub_agent):
    """A broken calendar must not stop the research from being delivered."""
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))
    monkeypatch.setenv("NOVA_TASK_MAX_ATTEMPTS", "1")

    async def run(spec, task, context, request="", **_):
        result = task.model_copy(deep=True)
        if task.id == "T1":
            result.state = TaskState.FAILED
            result.error = "calendar unavailable"
        else:
            result.state = TaskState.COMPLETED
            result.artifact = _artifact(f"done {task.id}")
        return result

    monkeypatch.setattr(executor_mod, "run_task", run)

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="book a meeting"),
            Task(id="T2", skill="stub.do", goal="research"),
            Task(id="T3", skill="stub.do", goal="draft", depends_on=["T2"]),
        ]
    )

    by_id = {task.id: task for task in results}
    assert by_id["T2"].state is TaskState.COMPLETED
    assert by_id["T3"].state is TaskState.COMPLETED


@pytest.mark.asyncio
async def test_a_skipped_task_announces_itself(monkeypatch, stub_agent):
    """It settles like any other task, so the diagram never leaves it hanging."""
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))
    monkeypatch.setenv("NOVA_TASK_MAX_ATTEMPTS", "1")
    events = []

    async def run(spec, task, context, request="", **_):
        result = task.model_copy(deep=True)
        result.state = TaskState.FAILED
        result.error = "nothing"
        return result

    async def sink(event):
        events.append(event)

    monkeypatch.setattr(executor_mod, "run_task", run)

    await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="a"),
            Task(id="T2", skill="stub.do", goal="b", depends_on=["T1"]),
        ],
        on_event=sink,
    )

    ends = {e["id"]: e for e in events if e["type"] == "task_end"}
    assert ends["T2"]["state"] == "skipped"


# ── Salvaging material from a failed worker ──────────────────────────


def test_salvage_keeps_tool_results_and_drops_the_failure_report():
    from nova_a2a.worker import _salvage

    messages = [
        HumanMessage(content="do it"),
        AIMessage(content="", tool_calls=[{"name": "web_search", "args": {}, "id": "c1"}]),
        ToolMessage(content="three useful hits", name="web_search", tool_call_id="c1"),
        AIMessage(content="FAILED: the calendar is unavailable"),
    ]

    salvaged = _salvage(messages, exclude="FAILED: the calendar is unavailable")

    assert "three useful hits" in salvaged
    assert "FAILED" not in salvaged


def test_salvage_ignores_tool_error_text():
    """A tool's own error message is not material worth passing downstream."""
    from nova_a2a.worker import _salvage

    messages = [
        ToolMessage(content="ERROR: service unavailable", name="calendar", tool_call_id="c1"),
    ]

    assert _salvage(messages) == ""


@pytest.mark.asyncio
async def test_a_failed_worker_keeps_what_it_gathered(monkeypatch, stub_agent):
    """End to end: the artifact survives the failure, marked partial."""
    from nova_a2a import worker as worker_mod

    class PartialThenFails:
        async def astream(self, state, config=None, stream_mode=None):
            yield {
                "messages": [
                    AIMessage(content="", tool_calls=[{"name": "web_search", "args": {}, "id": "c1"}]),
                    ToolMessage(content="two solid findings", name="web_search", tool_call_id="c1"),
                    AIMessage(content="FAILED: could not reach the calendar"),
                ]
            }

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: PartialThenFails())

    result = await worker_mod.run_task(stub_agent, Task(id="T1", skill="stub.do", goal="x"))

    assert result.state is TaskState.FAILED
    assert result.artifact is not None and result.artifact.partial
    assert "two solid findings" in result.artifact.text


@pytest.mark.asyncio
async def test_resolve_tools_returns_tools_that_can_actually_be_called():
    """The gap that let every tool in the system break at once.

    ``resolve_tools`` once wrapped each tool to add a per-tool timeout. The
    wrapper did not reproduce ``_arun``'s signature, so LangChain stopped
    injecting ``config`` and every single call raised ``TypeError`` — which
    ``ToolNode`` turned into text, and the agents reported as "this tool is
    unavailable due to a configuration error". Every test passed: they all
    checked which tools came back, never that they still worked.
    """
    from langchain_core.tools import tool as make_tool

    from nova_a2a import worker as worker_mod

    @make_tool
    async def probe_tool(query: str) -> str:
        """Echo the query back."""
        return f"echoed {query}"

    spec = AgentSpec(
        id="probe",
        name="Probe",
        description="probes",
        skills=(skill("probe.do", "Do", "does"),),
        tool_names=("probe_tool",),
    )

    import agent.graph as graph_mod

    original = graph_mod.get_tools
    graph_mod.get_tools = lambda: [probe_tool]
    try:
        tools = worker_mod.resolve_tools(spec)
        assert [t.name for t in tools] == ["probe_tool"]
        # The assertion that was missing: invoke it the way ToolNode does.
        assert await tools[0].ainvoke({"query": "hello"}) == "echoed hello"
    finally:
        graph_mod.get_tools = original


def test_partial_material_is_labelled_for_the_next_agent():
    """Passing it silently would invite presenting half a result as a whole one."""
    from nova_a2a.worker import _format_context

    rendered = _format_context([_artifact("half the findings", partial=True)])

    assert "INCOMPLETE" in rendered
    assert "half the findings" in rendered


# ── What the user is finally told ────────────────────────────────────


def test_the_aggregator_distinguishes_the_three_outcomes():
    from nova_a2a.aggregator import _render

    done = Task(id="T1", skill="s", goal="research")
    done.state = TaskState.COMPLETED
    done.artifact = _artifact("the findings")

    partial = Task(id="T2", skill="s", goal="book it")
    partial.state = TaskState.FAILED
    partial.error = "calendar unavailable"
    partial.artifact = _artifact("found two free slots", partial=True)

    never = Task(id="T3", skill="s", goal="write it up")
    never.state = TaskState.SKIPPED
    never.error = "not attempted: T2 produced no result to work from"

    rendered = _render([done, partial, never])

    assert "RESULT:" in rendered
    assert "PARTIAL" in rendered and "found two free slots" in rendered
    assert "NOT ATTEMPTED" in rendered


def test_the_fallback_answer_uses_partial_material_too():
    """When synthesis itself fails, salvaged work is all the user has left."""
    from nova_a2a.aggregator import _fallback_answer

    partial = Task(id="T1", skill="s", goal="research")
    partial.state = TaskState.FAILED
    partial.artifact = _artifact("two findings", partial=True)

    assert "two findings" in _fallback_answer([partial])
