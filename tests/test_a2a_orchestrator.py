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


def test_every_declared_tool_name_exists():
    """A spec may only name tools that are really bound somewhere.

    ``worker.resolve_tools`` drops unknown names silently, which is right at
    runtime — a Google tool is genuinely absent when only Microsoft is
    connected — but it means a typo in a spec costs the agent that tool with
    no error anywhere. This is the check that catches it.
    """
    from agent.graph import get_tools
    from nova_mcp.builtin import _PROVIDER_TOOLS

    # Every tool that *could* be bound: the local belt, plus every provider's
    # tools whether or not this machine has that account connected.
    known = {tool.name for tool in get_tools()}
    known |= {fn.__name__ for tools in _PROVIDER_TOOLS.values() for fn in tools}

    for spec in INTERNAL_AGENTS:
        unknown = set(spec.tool_names) - known
        assert not unknown, f"{spec.id} declares tools that do not exist: {sorted(unknown)}"


def test_provider_tools_are_reachable_from_some_agent():
    """Every service tool must belong to a worker, or the orchestrator cannot use it.

    A tool bound into the single-agent graph but named by no spec is invisible
    to the whole multi-agent path: the worker never sees it and the planner is
    never offered a skill that would use it. GitHub and mail were both in
    exactly that state.
    """
    from nova_mcp.builtin import _PROVIDER_TOOLS

    claimed = {name for spec in INTERNAL_AGENTS for name in spec.tool_names}
    orphans = {
        fn.__name__
        for tools in _PROVIDER_TOOLS.values()
        for fn in tools
        if fn.__name__ not in claimed
    }
    assert not orphans, f"service tools no agent can reach: {sorted(orphans)}"


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

    async def slow_run(spec, task, context, request="", **_):
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

    async def run(spec, task, context, request="", **_):
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
    """A document must never be written from research that produced nothing.

    A failure that still salvaged material does *not* block its dependents —
    see ``test_a2a_partial_failure.py``. This is the other half of that
    contract: with no artifact at all there is genuinely no input, and the
    dependent is marked SKIPPED rather than FAILED, because nothing about it
    is broken. It was never attempted.
    """
    ran: list[str] = []

    async def run(spec, task, context, request="", **_):
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
    assert by_id["T2"].state is TaskState.SKIPPED
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


# ── Worker: original-request context ─────────────────────────────────


@pytest.mark.asyncio
async def test_run_task_includes_the_full_request_when_it_differs_from_the_goal(
    monkeypatch, stub_agent
):
    """A goal that references pasted material must have something to read.

    The planner's goal is a one-sentence summary — "using the job description
    below" — that does not itself contain the description. Only the user's
    original message does, so it must reach the worker's prompt.
    """
    from nova_a2a import worker as worker_mod
    from langchain_core.messages import AIMessage

    seen_prompt = None

    class StubGraph:
        async def astream(self, state, config=None, stream_mode=None):
            nonlocal seen_prompt
            seen_prompt = state["messages"][0].content
            yield {"messages": [AIMessage(content="done")]}

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: StubGraph())

    task = Task(id="T1", skill="stub.do", goal="Summarise the job description below")
    await worker_mod.run_task(
        stub_agent,
        task,
        request="Please do X.\n\nHere's the job description: senior widget engineer, 5 years Python.",
    )

    assert "senior widget engineer" in seen_prompt
    assert "Summarise the job description below" in seen_prompt


@pytest.mark.asyncio
async def test_run_task_skips_the_request_block_when_it_matches_the_goal(monkeypatch, stub_agent):
    """A trivial single-task plan (goal == request) needs no duplicate block."""
    from nova_a2a import worker as worker_mod
    from langchain_core.messages import AIMessage

    seen_prompt = None

    class StubGraph:
        async def astream(self, state, config=None, stream_mode=None):
            nonlocal seen_prompt
            seen_prompt = state["messages"][0].content
            yield {"messages": [AIMessage(content="done")]}

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: StubGraph())

    task = Task(id="T1", skill="stub.do", goal="What time is it?")
    await worker_mod.run_task(stub_agent, task, request="What time is it?")

    assert "Full request the user sent" not in seen_prompt


@pytest.mark.asyncio
async def test_run_task_caps_a_very_long_request(monkeypatch, stub_agent):
    """A multi-KB pasted document must not bloat every task's prompt unbounded.

    Dumping the whole thing into a small local model's context was observed
    to make it loop on tool calls instead of converging, ending in a
    recursion-limit failure — see ``test_run_task_reports_a_friendly_error_
    on_recursion_limit`` below.
    """
    from nova_a2a import worker as worker_mod
    from langchain_core.messages import AIMessage

    seen_prompt = None

    class StubGraph:
        async def astream(self, state, config=None, stream_mode=None):
            nonlocal seen_prompt
            seen_prompt = state["messages"][0].content
            yield {"messages": [AIMessage(content="done")]}

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: StubGraph())

    long_request = "Do the thing.\n\n" + ("word " * 2000)  # far past the cap
    task = Task(id="T1", skill="stub.do", goal="Do a specific slice of it")
    await worker_mod.run_task(stub_agent, task, request=long_request)

    assert len(seen_prompt) < len(long_request)
    assert "truncated" in seen_prompt


@pytest.mark.asyncio
async def test_run_task_reports_a_friendly_error_on_recursion_limit(monkeypatch, stub_agent):
    """LangGraph's own message names an internal step budget the user never set."""
    from nova_a2a import worker as worker_mod
    from langgraph.errors import GraphRecursionError

    class LoopingGraph:
        async def astream(self, state, config=None, stream_mode=None):
            raise GraphRecursionError("Recursion limit of 13 reached without hitting a stop condition.")
            yield {}  # unreachable; keeps this an async generator

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: LoopingGraph())

    task = Task(id="T1", skill="stub.do", goal="research something broad")
    result = await worker_mod.run_task(stub_agent, task)

    assert result.state == TaskState.FAILED
    assert "Recursion limit" not in result.error
    assert "too many steps" in result.error


@pytest.mark.asyncio
async def test_run_task_streams_its_activity_as_it_happens(monkeypatch, stub_agent):
    """The point of the live diagram: events land while the worker is running.

    Both halves are regressions that shipped together — the worker used to
    invoke its graph and replay the tool calls from the finished message list,
    and it called ``.put`` on a sink the orchestrator passes as a plain
    callback, so every event was swallowed by the emitter's ``except``.
    """
    from nova_a2a import worker as worker_mod
    from langchain_core.messages import AIMessage, ToolMessage

    events: list[dict] = []
    seen_before_finish: list[list[str]] = []

    async def sink(event):
        events.append(event)

    class ToolCallingGraph:
        async def astream(self, state, config=None, stream_mode=None):
            calling = AIMessage(
                content="",
                tool_calls=[{"name": "list_events", "args": {}, "id": "c1"}],
            )
            yield {"messages": [calling]}
            # Whatever the worker emitted by now is what the user would have
            # seen mid-run — the assertion that the UI is not left waiting.
            seen_before_finish.append([e["type"] for e in events])
            yield {
                "messages": [
                    calling,
                    ToolMessage(content="3 events", name="list_events", tool_call_id="c1"),
                    AIMessage(content="you have 3 meetings"),
                ]
            }

    monkeypatch.setattr(worker_mod, "get_worker_graph", lambda _spec: ToolCallingGraph())

    task = Task(id="T1", skill="stub.do", goal="check my calendar")
    result = await worker_mod.run_task(stub_agent, task, on_event=sink)

    assert "tool_start" in seen_before_finish[0]
    assert [e["type"] for e in events] == ["task_start", "tool_start", "tool_end", "task_end"]
    assert result.state is TaskState.COMPLETED
    # The same activity rides along on the task, so a reload can replay it.
    assert [(c.name, c.result) for c in result.tools] == [("list_events", "3 events")]


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

    async def one_task(_request, _agents, conversation=""):
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

    async def two_tasks(_request, _agents, conversation=""):
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

    async def fake_synthesise(_request, _results, config=None, on_usage=None):
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

    async def spy_build_plan(request, agents, conversation=""):
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


# ── Runtime config injection ─────────────────────────────────────────
# Calling a node directly always "works": the config is just an argument.
# Through the compiled graph it is LangGraph that decides whether to pass one,
# by matching the parameter's annotation against a fixed list of accepted
# spellings — and it passes ``None`` silently when the annotation is anything
# else. That is invisible in unit tests and catastrophic in production: the SSE
# event sink and the token handler both travel in that config, so a mistyped
# annotation costs the live agent diagram *and* the streamed answer at once.


def test_every_orchestrator_node_declares_config_langgraph_will_inject():
    """LangGraph must recognise each node's ``config`` parameter."""
    import warnings

    from langgraph._internal._runnable import RunnableCallable

    from agent import orchestrator

    nodes = (
        orchestrator.planner_node,
        orchestrator.executor_node,
        orchestrator.repair_node,
        orchestrator.aggregator_node,
        orchestrator.fallback_node,
    )
    for node in nodes:
        with warnings.catch_warnings():
            # LangGraph only *warns* about an unrecognised annotation, so the
            # regression this guards against is otherwise completely silent.
            warnings.simplefilter("error", UserWarning)
            wrapped = RunnableCallable(node)
        assert "config" in wrapped.func_accepts, f"{node.__name__} will not receive config"


@pytest.mark.asyncio
async def test_compiled_graph_delivers_the_event_sink_and_token_handler(monkeypatch):
    """End to end: a run through the compiled graph must emit plan events and tokens."""
    from langchain_core.messages import HumanMessage

    from agent import orchestrator

    sink: asyncio.Queue = asyncio.Queue()
    streamed: list[str] = []

    class _Handler:
        async def on_llm_new_token(self, token: str) -> None:
            streamed.append(token)

    async def two_tasks(_request, _agents, conversation=""):
        return [
            Task(id="T1", skill="web.research", goal="a"),
            Task(id="T2", skill="advice.generate", goal="b", depends_on=["T1"]),
        ]

    async def agents():
        return list(INTERNAL_AGENTS)

    async def fake_execute_plan(tasks, on_event=None, **_kwargs):
        assert on_event is not None, "executor_node never received the event sink"
        await on_event({"type": "plan", "tasks": [t.id for t in tasks]})
        done = []
        for task in tasks:
            finished = task.model_copy(deep=True)
            finished.state = TaskState.COMPLETED
            finished.artifact = Artifact(
                artifact_id=f"{task.id}-artifact", name=task.skill, text=f"{task.id} done"
            )
            done.append(finished)
        return done

    async def fake_synthesise(_request, _results, config=None, on_usage=None):
        assert config is not None, "aggregator_node never received the token handler"
        for handler in config["callbacks"]:
            await handler.on_llm_new_token("hola")
        return "hola"

    monkeypatch.setattr(orchestrator, "build_plan", two_tasks)
    monkeypatch.setattr(orchestrator, "available_agents", agents)
    monkeypatch.setattr(orchestrator, "execute_plan", fake_execute_plan)
    monkeypatch.setattr(orchestrator, "synthesise", fake_synthesise)
    orchestrator.reset_orchestrator_graph()

    await orchestrator.get_orchestrator_graph().ainvoke(
        {"messages": [HumanMessage(content="do two things")], "plan": [], "results": []},
        config={"configurable": {"event_sink": sink, "token_handler": _Handler()}},
    )
    orchestrator.reset_orchestrator_graph()

    events = []
    while not sink.empty():
        events.append(sink.get_nowait())

    assert [event["type"] for event in events] == ["plan"]
    assert streamed == ["hola"]
