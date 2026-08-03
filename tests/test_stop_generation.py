"""Tests for cancelling an in-flight generation."""

from __future__ import annotations

import asyncio

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from api import routes


@pytest.fixture(autouse=True)
def clean_sessions():
    """Keep the module-level session store from leaking between tests."""
    routes._sessions.clear()
    yield
    routes._sessions.clear()


@pytest.mark.asyncio
async def test_stop_is_a_no_op_without_an_active_task():
    routes._sessions["s1"] = {"messages": [], "active_task": None}

    result = await routes.stop_generation("s1")

    assert result == {"session_id": "s1", "stopped": False}


@pytest.mark.asyncio
async def test_stop_on_unknown_session_does_not_fail():
    assert (await routes.stop_generation("nope"))["stopped"] is False


@pytest.mark.asyncio
async def test_stop_cancels_the_running_task():
    async def never_finishes():
        await asyncio.sleep(60)

    task = asyncio.create_task(never_finishes())
    routes._sessions["s2"] = {"messages": [], "active_task": task}

    assert (await routes.stop_generation("s2"))["stopped"] is True

    with pytest.raises(asyncio.CancelledError):
        await task
    assert task.cancelled()


@pytest.mark.asyncio
async def test_stop_on_a_finished_task_reports_nothing_to_stop():
    async def done_already():
        return None

    task = asyncio.create_task(done_already())
    await task
    routes._sessions["s3"] = {"messages": [], "active_task": task}

    assert (await routes.stop_generation("s3"))["stopped"] is False


@pytest.mark.asyncio
async def test_cancelled_run_keeps_the_partial_answer(tmp_path, monkeypatch):
    """What the user saw on screen must survive in the persisted history."""
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    started = asyncio.Event()

    class _StallingGraph:
        """Streams two tokens, then hangs until cancelled."""

        async def astream(self, input_state, config=None, stream_mode=None):
            handler = config["configurable"]["token_handler"]
            await handler.on_llm_new_token("Hola ")
            await handler.on_llm_new_token("mun")
            started.set()
            await asyncio.sleep(60)
            yield input_state  # pragma: no cover — never reached

    monkeypatch.setattr(routes, "get_orchestrator_graph", lambda: _StallingGraph())

    buffer: asyncio.Queue = asyncio.Queue()
    input_state = {"messages": [], "iteration_count": 0, "total_tokens": 0}
    task = asyncio.create_task(routes._run_langgraph_task("s4", input_state, buffer))

    await asyncio.wait_for(started.wait(), timeout=5)
    task.cancel()
    await task

    events = []
    while not buffer.empty():
        events.append(await buffer.get())

    types = [e.get("type") for e in events if isinstance(e, dict)]
    assert "cancelled" in types

    done = next(e for e in events if isinstance(e, dict) and e.get("type") == "done")
    assert done["cancelled"] is True

    # The streamed text became a real message rather than being discarded.
    stored = routes._sessions["s4"]["messages"]
    assert stored[-1].content == "Hola mun"
    assert (tmp_path / "s4.json").exists()

    # And it is the partial text that is reported, not an older reply.
    assert done["response"] == "Hola mun"


@pytest.mark.asyncio
async def test_cancelling_before_any_token_reports_no_response(tmp_path, monkeypatch):
    """Regression: stopping used to echo the *previous* turn's answer back.

    ``response_text`` scanned the history for the last AI message, which on an
    immediate cancellation is whatever the agent said last turn.
    """
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    started = asyncio.Event()

    class _StallingGraph:
        async def astream(self, input_state, config=None, stream_mode=None):
            started.set()
            await asyncio.sleep(60)
            yield input_state  # pragma: no cover

    monkeypatch.setattr(routes, "get_orchestrator_graph", lambda: _StallingGraph())

    buffer: asyncio.Queue = asyncio.Queue()
    input_state = {
        "messages": [
            HumanMessage(content="primera pregunta"),
            AIMessage(content="respuesta anterior"),
            HumanMessage(content="y eso?"),
        ],
    }
    task = asyncio.create_task(routes._run_langgraph_task("s5", input_state, buffer))

    await asyncio.wait_for(started.wait(), timeout=5)
    task.cancel()
    await task

    events = []
    while not buffer.empty():
        events.append(await buffer.get())
    done = next(e for e in events if isinstance(e, dict) and e.get("type") == "done")

    assert done["cancelled"] is True
    assert done["response"] == ""


# ── History sanitising ───────────────────────────────────────

def test_unanswered_tool_call_is_dropped():
    """A stop mid tool-call must not leave a dangling request in the history."""
    messages = [
        HumanMessage(content="crea un evento"),
        AIMessage(
            content="",
            tool_calls=[{"name": "google_create_calendar_event", "args": {}, "id": "c1"}],
        ),
    ]

    cleaned = routes._sanitize_history(messages)

    assert len(cleaned) == 1
    assert isinstance(cleaned[0], HumanMessage)


def test_answered_tool_call_is_kept():
    messages = [
        HumanMessage(content="crea un evento"),
        AIMessage(
            content="",
            tool_calls=[{"name": "google_create_calendar_event", "args": {}, "id": "c1"}],
        ),
        ToolMessage(content="Event created.", name="google_create_calendar_event", tool_call_id="c1"),
        AIMessage(content="Listo."),
    ]

    assert routes._sanitize_history(messages) == messages


def test_partial_text_survives_a_dropped_tool_call():
    messages = [
        AIMessage(
            content="Voy a crearlo",
            tool_calls=[{"name": "whatever", "args": {}, "id": "c9"}],
        ),
    ]

    cleaned = routes._sanitize_history(messages)

    assert len(cleaned) == 1
    assert cleaned[0].content == "Voy a crearlo"
    assert not cleaned[0].tool_calls
