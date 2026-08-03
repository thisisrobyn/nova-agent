"""Tests for the A2A orchestrator.

No real LLM and no real Ollama: the planner and the workers are stubbed, so
what is under test is the orchestration logic itself — plan sanitising,
dependency ordering, parallelism, failure containment and the fallback.
"""

from __future__ import annotations

import asyncio

import pytest

from nova_a2a import executor as executor_mod
from nova_a2a import planner as planner_mod
from nova_a2a.agents import INTERNAL_AGENTS
from nova_a2a.agents._common import AgentSpec, skill
from nova_a2a.models import WELL_KNOWN_PATH, Artifact, Plan, Task, TaskSpec, TaskState


# ── Agent specs and the card ─────────────────────────────────────────


def test_agent_ids_and_skills_are_unique():
    """A duplicate skill id would make routing depend on registration order."""
    agent_ids = [spec.id for spec in INTERNAL_AGENTS]
    assert len(agent_ids) == len(set(agent_ids))

    skill_ids = [skill_id for spec in INTERNAL_AGENTS for skill_id in spec.skill_ids]
    assert len(skill_ids) == len(set(skill_ids))


def test_advisor_has_no_tools():
    """The reasoning-only worker must stay free of side effects."""
    advisor = next(spec for spec in INTERNAL_AGENTS if spec.id == "advisor")
    assert advisor.tool_names == ()
    assert advisor.requires_any == ()


def test_well_known_path_matches_current_spec():
    """The pre-1.0 name was agent.json; regressing to it breaks discovery."""
    assert WELL_KNOWN_PATH == "/.well-known/agent-card.json"


def test_agent_card_serialises_to_camel_case():
    from nova_a2a.models import AgentCard

    card = AgentCard(name="NOVA", description="d", url="http://x/a2a", version="1")
    payload = card.model_dump(by_alias=True)

    assert payload["protocolVersion"] == "1.0"
    assert "defaultInputModes" in payload
    assert "default_input_modes" not in payload


@pytest.mark.asyncio
async def test_available_agents_filters_on_connections(monkeypatch):
    """An agent whose provider is not connected must not be offered."""
    from nova_a2a import registry

    async def no_connections():
        return []

    monkeypatch.setattr(registry, "list_connected_providers", no_connections, raising=False)
    monkeypatch.setattr(
        "connections.store.list_connected_providers", no_connections
    )

    available = {spec.id for spec in await registry.available_agents()}

    # Research and advice need no account; calendar and docs do.
    assert available == {"research", "advisor"}


@pytest.mark.asyncio
async def test_resolve_skill_falls_back_to_namespace(monkeypatch):
    """`calendar.create` should still reach the calendar agent."""
    from nova_a2a import registry

    async def connected():
        return ["google", "microsoft"]

    monkeypatch.setattr("connections.store.list_connected_providers", connected)

    spec = await registry.resolve_skill("calendar.create_thing")
    assert spec is not None and spec.id == "calendar"

    assert await registry.resolve_skill("nonsense.skill") is None


# ── Planner sanitising ───────────────────────────────────────────────


def _valid(skill_id: str) -> bool:
    return skill_id in {"web.research", "docs.write", "calendar.schedule"}


def test_sanitise_drops_unknown_skills_and_duplicate_ids():
    tasks = planner_mod._sanitise(
        [
            TaskSpec(id="T1", skill="web.research", goal="research"),
            TaskSpec(id="T1", skill="docs.write", goal="duplicate id"),
            TaskSpec(id="T2", skill="made.up", goal="unknown skill"),
            TaskSpec(id="T3", skill="docs.write", goal=""),
        ],
        _valid,
    )
    assert [task.id for task in tasks] == ["T1"]


def test_sanitise_drops_dangling_dependencies():
    tasks = planner_mod._sanitise(
        [
            TaskSpec(id="T1", skill="web.research", goal="research"),
            TaskSpec(id="T2", skill="docs.write", goal="write", depends_on=["T9"]),
        ],
        _valid,
    )
    by_id = {task.id: task for task in tasks}
    assert by_id["T2"].depends_on == []


def test_sanitise_breaks_cycles():
    """A cyclic plan must not be able to deadlock the executor."""
    tasks = planner_mod._sanitise(
        [
            TaskSpec(id="T1", skill="web.research", goal="a", depends_on=["T2"]),
            TaskSpec(id="T2", skill="docs.write", goal="b", depends_on=["T1"]),
        ],
        _valid,
    )
    assert len(tasks) == 2
    assert all(task.depends_on == [] for task in tasks)


def test_sanitise_orders_dependencies_first():
    tasks = planner_mod._sanitise(
        [
            TaskSpec(id="T2", skill="docs.write", goal="write", depends_on=["T1"]),
            TaskSpec(id="T1", skill="web.research", goal="research"),
        ],
        _valid,
    )
    assert [task.id for task in tasks] == ["T1", "T2"]


def test_sanitise_caps_plan_size():
    specs = [
        TaskSpec(id=f"T{i}", skill="web.research", goal=f"goal {i}")
        for i in range(planner_mod.MAX_TASKS + 5)
    ]
    assert len(planner_mod._sanitise(specs, _valid)) == planner_mod.MAX_TASKS


@pytest.mark.asyncio
async def test_build_plan_returns_empty_when_structured_output_fails(monkeypatch):
    """A small model that cannot emit JSON must degrade, not crash."""

    class BrokenLLM:
        def with_structured_output(self, _schema):
            raise RuntimeError("no structured output support")

    monkeypatch.setattr("agent.llm.get_llm", lambda: BrokenLLM())

    assert await planner_mod.build_plan("do something", list(INTERNAL_AGENTS)) == []


@pytest.mark.asyncio
async def test_build_plan_returns_empty_without_agents():
    assert await planner_mod.build_plan("do something", []) == []


@pytest.mark.asyncio
async def test_build_plan_sanitises_model_output(monkeypatch):
    class Planner:
        async def ainvoke(self, _prompt):
            return Plan(
                tasks=[
                    TaskSpec(id="T1", skill="web.research", goal="research the role"),
                    TaskSpec(id="T2", skill="docs.write", goal="write it up", depends_on=["T1"]),
                    TaskSpec(id="T3", skill="invented.skill", goal="nonsense"),
                ]
            )

    class LLM:
        def with_structured_output(self, _schema):
            return Planner()

    monkeypatch.setattr("agent.llm.get_llm", lambda: LLM())

    tasks = await planner_mod.build_plan("...", list(INTERNAL_AGENTS))
    assert [task.id for task in tasks] == ["T1", "T2"]
    assert tasks[1].depends_on == ["T1"]


# ── Executor ─────────────────────────────────────────────────────────


@pytest.fixture
def stub_agent():
    """A minimal agent spec the executor can resolve every task to."""
    return AgentSpec(
        id="stub",
        name="Stub agent",
        description="test",
        skills=(skill("stub.do", "Do", "does"),),
    )


def _artifact(task: Task) -> Artifact:
    return Artifact(
        artifact_id=f"a-{task.id}", name=task.skill, text=f"done {task.id}", produced_by="stub"
    )


@pytest.mark.asyncio
async def test_execute_plan_runs_independent_tasks_concurrently(monkeypatch, stub_agent):
    """Two tasks with no dependencies must overlap, not queue."""
    running = 0
    peak = 0

    async def slow_run(spec, task, context):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.05)
        running -= 1
        result = task.model_copy(deep=True)
        result.state = TaskState.COMPLETED
        result.artifact = _artifact(task)
        return result

    monkeypatch.setattr(executor_mod, "run_task", slow_run)
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="a"),
            Task(id="T2", skill="stub.do", goal="b"),
        ]
    )

    assert peak == 2
    assert all(task.state is TaskState.COMPLETED for task in results)


@pytest.mark.asyncio
async def test_execute_plan_passes_dependency_artifacts(monkeypatch, stub_agent):
    """A dependent task must receive its dependency's artifact, and run after it."""
    seen_context: dict = {}

    async def run(spec, task, context):
        seen_context[task.id] = [artifact.text for artifact in context]
        result = task.model_copy(deep=True)
        result.state = TaskState.COMPLETED
        result.artifact = _artifact(task)
        return result

    monkeypatch.setattr(executor_mod, "run_task", run)
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="research"),
            Task(id="T2", skill="stub.do", goal="write", depends_on=["T1"]),
        ]
    )

    assert seen_context["T1"] == []
    assert seen_context["T2"] == ["done T1"]
    assert [task.id for task in results] == ["T1", "T2"]


@pytest.mark.asyncio
async def test_execute_plan_skips_dependents_of_a_failed_task(monkeypatch, stub_agent):
    """A document must never be written from research that failed."""
    ran: list[str] = []

    async def run(spec, task, context):
        ran.append(task.id)
        result = task.model_copy(deep=True)
        if task.id == "T1":
            result.state = TaskState.FAILED
            result.error = "search unavailable"
        else:
            result.state = TaskState.COMPLETED
            result.artifact = _artifact(task)
        return result

    monkeypatch.setattr(executor_mod, "run_task", run)
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(stub_agent))

    results = await executor_mod.execute_plan(
        [
            Task(id="T1", skill="stub.do", goal="research"),
            Task(id="T2", skill="stub.do", goal="write", depends_on=["T1"]),
            Task(id="T3", skill="stub.do", goal="unrelated"),
        ]
    )

    by_id = {task.id: task for task in results}
    assert "T2" not in ran
    assert by_id["T2"].state is TaskState.FAILED
    # Unrelated work still completes: one failure does not sink the run.
    assert by_id["T3"].state is TaskState.COMPLETED


@pytest.mark.asyncio
async def test_execute_plan_fails_tasks_with_no_agent(monkeypatch):
    monkeypatch.setattr(executor_mod, "resolve_skill", lambda _s: _async(None))

    results = await executor_mod.execute_plan([Task(id="T1", skill="ghost.skill", goal="x")])

    assert results[0].state is TaskState.FAILED
    assert "ghost.skill" in results[0].error


@pytest.mark.asyncio
async def test_execute_plan_with_no_tasks():
    assert await executor_mod.execute_plan([]) == []


# ── Aggregator ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesise_falls_back_to_raw_artifacts(monkeypatch):
    """A failed merge must not throw away work that already succeeded."""
    from nova_a2a import aggregator

    class LLM:
        async def ainvoke(self, _prompt):
            raise RuntimeError("model unavailable")

    monkeypatch.setattr("agent.llm.get_llm", lambda: LLM())

    task = Task(id="T1", skill="stub.do", goal="g", state=TaskState.COMPLETED)
    task.artifact = Artifact(artifact_id="a", name="n", text="the result", produced_by="stub")

    assert "the result" in await aggregator.synthesise("req", [task])


@pytest.mark.asyncio
async def test_synthesise_reports_total_failure(monkeypatch):
    from nova_a2a import aggregator

    monkeypatch.setattr("agent.llm.get_llm", lambda: None)

    task = Task(id="T1", skill="stub.do", goal="g", state=TaskState.FAILED, error="nope")
    answer = await aggregator.synthesise("req", [task])

    assert "could not" in answer.lower()


def test_content_to_text_drops_thinking_and_tool_use_blocks():
    """A reasoning model's block list must never leak into the chat as a repr."""
    from nova_a2a._content import content_to_text

    blocks = [
        {"type": "thinking", "thinking": "", "signature": "abc123"},
        {"type": "text", "text": "Tienes 2 eventos."},
    ]
    assert content_to_text(blocks) == "Tienes 2 eventos."
    assert content_to_text("plain string") == "plain string"
    assert content_to_text(None) == ""


@pytest.mark.asyncio
async def test_synthesise_strips_reasoning_blocks_from_the_final_answer(monkeypatch):
    """Extended-thinking models put content blocks in ``response.content``.

    Stringifying that list verbatim used to leak the thinking block's
    signature straight into the chat bubble.
    """
    from nova_a2a import aggregator

    class Response:
        content = [
            {"type": "thinking", "thinking": "", "signature": "abc123"},
            {"type": "text", "text": "Aqui esta tu resumen."},
        ]

    class LLM:
        async def ainvoke(self, _prompt, config=None):
            return Response()

    monkeypatch.setattr("agent.llm.get_llm", lambda: LLM())

    task = Task(id="T1", skill="stub.do", goal="g", state=TaskState.COMPLETED)
    task.artifact = Artifact(artifact_id="a", name="n", text="result", produced_by="stub")

    answer = await aggregator.synthesise("req", [task])

    assert answer == "Aqui esta tu resumen."
    assert "signature" not in answer
    assert "thinking" not in answer


# ── Orchestrator routing ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_planner_node_declines_a_single_task_plan(monkeypatch):
    """One task is not orchestration — it must route to the fallback."""
    from agent import orchestrator
    from langchain_core.messages import HumanMessage

    async def one_task(_request, _agents):
        return [Task(id="T1", skill="web.research", goal="x")]

    async def agents():
        return list(INTERNAL_AGENTS)

    monkeypatch.setattr(orchestrator, "build_plan", one_task)
    monkeypatch.setattr(orchestrator, "available_agents", agents)

    state = {"messages": [HumanMessage(content="what time is it?")]}
    result = await orchestrator.planner_node(state)

    assert result["plan"] == []
    assert orchestrator._route_plan(result) == "fallback"


@pytest.mark.asyncio
async def test_planner_node_orchestrates_a_multi_task_plan(monkeypatch):
    from agent import orchestrator
    from langchain_core.messages import HumanMessage

    async def two_tasks(_request, _agents):
        return [
            Task(id="T1", skill="web.research", goal="a"),
            Task(id="T2", skill="advice.generate", goal="b", depends_on=["T1"]),
        ]

    async def agents():
        return list(INTERNAL_AGENTS)

    monkeypatch.setattr(orchestrator, "build_plan", two_tasks)
    monkeypatch.setattr(orchestrator, "available_agents", agents)

    result = await orchestrator.planner_node(
        {"messages": [HumanMessage(content="do two things")]}
    )

    assert len(result["plan"]) == 2
    assert orchestrator._route_plan(result) == "executor"


# ── Token-streaming scope ────────────────────────────────────────────
# The planner's structured-output call and every worker's answer must never
# be attached to the SSE token handler — only the node that produces the
# user-facing reply (aggregator, or fallback's single-agent graph) may.


def test_llm_streaming_config_extracts_token_handler_from_configurable():
    from agent.orchestrator import _llm_streaming_config

    handler = object()
    config = {"configurable": {"token_handler": handler, "event_sink": object()}}

    assert _llm_streaming_config(config) == {"callbacks": [handler]}


def test_llm_streaming_config_is_none_without_a_token_handler():
    from agent.orchestrator import _llm_streaming_config

    assert _llm_streaming_config(None) is None
    assert _llm_streaming_config({}) is None
    assert _llm_streaming_config({"configurable": {}}) is None


@pytest.mark.asyncio
async def test_aggregator_node_scopes_streaming_to_its_own_call(monkeypatch):
    """The planner and workers must not leak tokens; only synthesise() may stream."""
    from agent import orchestrator

    seen_config = "not called"

    async def fake_synthesise(_request, _results, config=None):
        nonlocal seen_config
        seen_config = config
        return "the answer"

    monkeypatch.setattr(orchestrator, "synthesise", fake_synthesise)

    handler = object()
    result = await orchestrator.aggregator_node(
        {"request": "x", "results": []},
        config={"configurable": {"token_handler": handler}},
    )

    assert seen_config == {"callbacks": [handler]}
    assert result["messages"][0].content == "the answer"


@pytest.mark.asyncio
async def test_planner_node_never_receives_the_token_handler(monkeypatch):
    """The planner's structured-output JSON must never reach the SSE buffer."""
    from agent import orchestrator

    seen_args = []

    async def spy_build_plan(request, agents):
        seen_args.append((request, agents))
        return []

    async def agents():
        return list(INTERNAL_AGENTS)

    monkeypatch.setattr(orchestrator, "build_plan", spy_build_plan)
    monkeypatch.setattr(orchestrator, "available_agents", agents)

    from langchain_core.messages import HumanMessage

    await orchestrator.planner_node(
        {"messages": [HumanMessage(content="hola")]},
        config={"configurable": {"token_handler": object()}},
    )

    # build_plan takes no config at all — there is no way for it to inherit
    # the token handler, which is exactly the point.
    assert seen_args == [("hola", list(INTERNAL_AGENTS))]


def _async(value):
    """Wrap ``value`` in an awaitable, for stubbing async functions."""

    async def _coro():
        return value

    return _coro()
