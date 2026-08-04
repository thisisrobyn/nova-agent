"""Tests for the streaming endpoint.

Verifies:
- Status event emitted first
- Token streaming via AsyncCallbackHandler (on_llm_new_token)
- Error handling for timeout / connection errors
- Session persistence on disconnect
- Done event includes response text and elapsed_seconds
"""

import asyncio
from types import SimpleNamespace
import json
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage


# ── Helpers ──────────────────────────────────────────────────────────

def _drain_buffer(buffer: asyncio.Queue, sentinel) -> list[dict]:
    """Collect all events from a buffer until the sentinel is found."""
    events = []
    while not buffer.empty():
        evt = buffer.get_nowait()
        if evt is sentinel:
            break
        events.append(evt)
    return events


# ── Token streaming and status event ────────────────────────────────

@pytest.mark.asyncio
async def test_background_task_emits_status_then_tokens():
    """The background task should emit 'status' first, then stream tokens
    via the callback handler, then emit 'done'."""
    from api.routes import _run_langgraph_task, _STREAM_END

    buffer: asyncio.Queue = asyncio.Queue()
    input_state = {"messages": [HumanMessage(content="hi")]}

    final_output = {
        "messages": [HumanMessage(content="hi"), AIMessage(content="Hello world")],
        "total_tokens": 5,
        "iteration_count": 1,
        "token_usage": None,
    }

    async def fake_astream(input_state, config=None, stream_mode=None):
        # The handler travels through `configurable`, not as a top-level
        # `callbacks` entry: registering it on the whole run would stream the
        # planner's JSON and every worker's answer into the chat. Only the node
        # producing the user-facing reply opts back in — see
        # `orchestrator._llm_streaming_config`.
        handler = ((config or {}).get("configurable") or {}).get("token_handler")
        if handler is not None:
            await handler.on_llm_new_token("Hello")
            await handler.on_llm_new_token(" world")
        yield final_output

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task("test-session", input_state, buffer)

    events = _drain_buffer(buffer, _STREAM_END)

    assert events[0]["type"] == "status"
    assert events[0]["message"] == "Processing"
    # Tokens from callback handler
    assert events[1] == {"type": "token", "content": "Hello"}
    assert events[2] == {"type": "token", "content": " world"}
    # Done event
    done = [e for e in events if e["type"] == "done"]
    assert len(done) == 1
    assert done[0]["response"] == "Hello world"
    assert "elapsed_seconds" in done[0]


# ── Error handling ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_background_task_emits_error_on_timeout():
    """Should emit a user-friendly error on httpx timeout."""
    import httpx
    from api.routes import _run_langgraph_task, _STREAM_END

    buffer: asyncio.Queue = asyncio.Queue()

    async def fake_astream(input_state, config=None, stream_mode=None):
        raise httpx.TimeoutException("Connection timed out")
        yield  # noqa: E501

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task("test-session", {}, buffer)

    events = _drain_buffer(buffer, _STREAM_END)
    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert "timed out" in error_events[0]["message"].lower()


@pytest.mark.asyncio
async def test_background_task_emits_error_on_connect_error():
    """Should emit a connection error message."""
    import httpx
    from api.routes import _run_langgraph_task, _STREAM_END

    buffer: asyncio.Queue = asyncio.Queue()

    async def fake_astream(input_state, config=None, stream_mode=None):
        raise httpx.ConnectError("Connection refused")
        yield  # noqa: E501

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task("test-session", {}, buffer)

    events = _drain_buffer(buffer, _STREAM_END)
    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert "cannot connect" in error_events[0]["message"].lower()


# ── Session persistence on disconnect ───────────────────────────────

@pytest.mark.asyncio
async def test_session_state_persisted_after_task_completes():
    """final_state must be saved to _sessions even if nobody reads the buffer."""
    from api.routes import _run_langgraph_task, _sessions, _STREAM_END

    session_id = "persist-test"
    _sessions[session_id] = {
        "messages": [],
        "active_task": None,
        "response_buffer": None,
        "is_generating": True,
    }

    buffer: asyncio.Queue = asyncio.Queue()
    final_output = {
        "messages": [AIMessage(content="Done")],
        "total_tokens": 10,
        "iteration_count": 1,
        "token_usage": None,
    }

    async def fake_astream(input_state, config=None, stream_mode=None):
        yield final_output

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task(session_id, {}, buffer)

    # Drain buffer (simulating disconnected client)
    while not buffer.empty():
        buffer.get_nowait()

    session = _sessions[session_id]
    assert len(session["messages"]) == 1
    assert session["messages"][0].content == "Done"
    assert session["is_generating"] is False
    assert session["active_task"] is None


@pytest.mark.asyncio
async def test_session_marked_not_generating_on_error():
    """Even on error, session.is_generating must be set to False."""
    from api.routes import _run_langgraph_task, _sessions, _STREAM_END

    session_id = "error-persist-test"
    _sessions[session_id] = {
        "messages": [],
        "active_task": None,
        "response_buffer": None,
        "is_generating": True,
    }

    buffer: asyncio.Queue = asyncio.Queue()

    async def fake_astream(input_state, config=None, stream_mode=None):
        raise RuntimeError("LLM crashed")
        yield  # noqa: E501

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task(session_id, {}, buffer)

    session = _sessions[session_id]
    assert session["is_generating"] is False
    assert session["active_task"] is None


# ── Done event content ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_done_event_includes_response_and_elapsed():
    """The done event must include the full response text and elapsed time."""
    from api.routes import _run_langgraph_task, _STREAM_END

    buffer: asyncio.Queue = asyncio.Queue()

    final_output = {
        "messages": [HumanMessage(content="hi"), AIMessage(content="Hello there!")],
        "total_tokens": 8,
        "iteration_count": 1,
        "token_usage": {"total_tokens": 8},
    }

    async def fake_astream(input_state, config=None, stream_mode=None):
        yield final_output

    with patch("api.routes.get_orchestrator_graph") as get_graph:
        get_graph.return_value = SimpleNamespace(astream=fake_astream)
        await _run_langgraph_task("test-done", {"messages": []}, buffer)

    events = _drain_buffer(buffer, _STREAM_END)
    done = [e for e in events if e["type"] == "done"][0]
    assert done["response"] == "Hello there!"
    assert done["total_tokens"] == 8
    assert isinstance(done["elapsed_seconds"], float)
    assert done["elapsed_seconds"] >= 0
