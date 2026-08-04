"""Integration tests for wiring the A2A orchestrator into the chat API.

No real LLM, no real Ollama: the planner and the workers are stubbed exactly
as in ``tests/test_a2a_orchestrator.py``. What is under test here is the seam
between ``api/routes.py`` and ``agent/orchestrator.py`` — that a trivial
request still behaves like the old single-agent chat, that stopping a session
cancels an in-flight orchestrated run, and that a completed run's plan is
attached to the right message for history rehydration.
"""

from __future__ import annotations

import asyncio

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from agent import orchestrator
from api import routes
from api.schemas import ChatRequest
from nova_a2a.models import Artifact, Task, TaskState


@pytest.fixture(autouse=True)
def _clean_sessions():
    """Every test gets a clean in-memory session table."""
    routes._sessions.clear()
    yield
    routes._sessions.clear()


def _new_session_state() -> dict:
    return {
        "messages": [],
        "memory_context": "",
        "knowledge_context": "",
        "tool_results": [],
        "iteration_count": 0,
        "total_tokens": 0,
        "token_usage": None,
        "plan": [],
        "results": [],
        "active_task": None,
        "response_buffer": None,
        "is_generating": False,
    }


class _StubFallbackGraph:
    """Stands in for ``agent.graph.get_compiled_graph()``."""

    def __init__(self, reply: str):
        self.reply = reply

    async def ainvoke(self, state, config=None):
        messages = list(state.get("messages", [])) + [AIMessage(content=self.reply)]
        return {**state, "messages": messages, "total_tokens": 7, "iteration_count": 1}


@pytest.mark.asyncio
async def test_chat_endpoint_trivial_request_falls_back_unchanged(monkeypatch, tmp_path):
    """A request the planner declines must answer exactly like the old graph."""
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    async def no_plan(_request, _agents, conversation=""):
        return []

    async def agents():
        return []

    monkeypatch.setattr(orchestrator, "build_plan", no_plan)
    monkeypatch.setattr(orchestrator, "available_agents", agents)
    monkeypatch.setattr("agent.graph.get_compiled_graph", lambda: _StubFallbackGraph("4 o'clock"))

    response = await routes.chat(ChatRequest(message="what time is it?", session_id="trivial"), user=None)

    assert response.response == "4 o'clock"
    # Nothing orchestrated: the session carries no plan for a reload to show.
    assert routes._sessions["trivial"].get("plan") == []


@pytest.mark.asyncio
async def test_stop_generation_cancels_an_orchestrated_run():
    """Stopping a session must cancel its background task, orchestrated or not."""
    session = _new_session_state()
    routes._sessions["running"] = session

    started = asyncio.Event()

    async def never_finishes():
        started.set()
        await asyncio.sleep(10)

    task = asyncio.create_task(never_finishes())
    session["active_task"] = task
    await started.wait()

    result = await routes.stop_generation("running")
    assert result == {"session_id": "running", "stopped": True}

    with pytest.raises(asyncio.CancelledError):
        await task
    assert task.cancelled()


@pytest.mark.asyncio
async def test_stop_generation_is_a_noop_without_an_active_task():
    routes._sessions["idle"] = _new_session_state()
    result = await routes.stop_generation("idle")
    assert result == {"session_id": "idle", "stopped": False}


@pytest.mark.asyncio
async def test_history_attaches_plan_to_last_assistant_message(tmp_path, monkeypatch):
    """A completed orchestrated turn must rehydrate folded into its reply."""
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    completed = Task(
        id="T1",
        skill="web.research",
        goal="research the role",
        state=TaskState.COMPLETED,
        assigned_to="research",
        elapsed_seconds=1.2,
    )
    completed.artifact = Artifact(artifact_id="a1", name="web.research", text="key points", produced_by="research")

    failed = Task(
        id="T2",
        skill="docs.write",
        goal="write it up",
        depends_on=["T1"],
        state=TaskState.FAILED,
        error="no Google account connected",
    )

    session = _new_session_state()
    session["messages"] = [
        HumanMessage(content="research and write it up"),
        AIMessage(content="Here is what I found, though the doc could not be written."),
    ]
    session["plan"] = [
        Task(id="T1", skill="web.research", goal="research the role"),
        Task(id="T2", skill="docs.write", goal="write it up", depends_on=["T1"]),
    ]
    session["results"] = [completed, failed]
    routes._sessions["with-plan"] = session

    history = await routes.get_history("with-plan")

    assistant_messages = [m for m in history.messages if m.role == "assistant"]
    assert len(assistant_messages) == 1
    plan = assistant_messages[0].plan
    assert [t.id for t in plan] == ["T1", "T2"]

    by_id = {t.id: t for t in plan}
    assert by_id["T1"].state == "completed"
    assert by_id["T1"].artifact == "key points"
    assert by_id["T1"].agent == "research"
    assert by_id["T2"].state == "failed"
    assert by_id["T2"].error == "no Google account connected"
    assert by_id["T2"].depends_on == ["T1"]

    # The user's turn carries no plan of its own.
    user_messages = [m for m in history.messages if m.role == "user"]
    assert all(not m.plan for m in user_messages)


@pytest.mark.asyncio
async def test_history_without_a_plan_leaves_messages_unplanned(tmp_path, monkeypatch):
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    session = _new_session_state()
    session["messages"] = [
        HumanMessage(content="hi"),
        AIMessage(content="hello!"),
    ]
    routes._sessions["no-plan"] = session

    history = await routes.get_history("no-plan")

    assert all(m.plan == [] for m in history.messages)
