"""Per-message token usage and response time must survive persistence."""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from api import routes
from api.routes import (
    _STATS_KEY,
    _deserialize_message,
    _serialize_message,
    _stamp_last_ai_message,
)


def _stamped_state() -> dict:
    state = {
        "messages": [
            HumanMessage(content="hola"),
            AIMessage(content="respuesta"),
        ],
        "token_usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
    }
    _stamp_last_ai_message(state, elapsed=7.6)
    return state


def test_stamp_targets_the_final_answer():
    state = _stamped_state()

    stats = state["messages"][-1].additional_kwargs[_STATS_KEY]
    assert stats["token_usage"]["total_tokens"] == 120
    assert stats["elapsed_seconds"] == 7.6
    # The user's message is never stamped.
    assert _STATS_KEY not in getattr(state["messages"][0], "additional_kwargs", {})


def test_stamp_skips_tool_call_shells():
    """The stats belong to the visible answer, not an intermediate call."""
    state = {
        "messages": [
            AIMessage(content="texto final"),
            AIMessage(content="", tool_calls=[{"name": "x", "args": {}, "id": "1"}]),
        ],
        "token_usage": {"total_tokens": 5},
    }
    _stamp_last_ai_message(state, elapsed=1.0)

    assert _STATS_KEY in state["messages"][0].additional_kwargs
    assert _STATS_KEY not in state["messages"][1].additional_kwargs


def test_stats_survive_a_serialization_round_trip():
    """Reloading a session from disk is exactly this round trip."""
    original = _stamped_state()["messages"][-1]

    restored = _deserialize_message(_serialize_message(original))

    stats = restored.additional_kwargs[_STATS_KEY]
    assert stats["token_usage"]["prompt_tokens"] == 100
    assert stats["elapsed_seconds"] == 7.6


@pytest.mark.asyncio
async def test_history_endpoint_returns_per_message_stats(tmp_path, monkeypatch):
    """This is what the UI reads after a reload — the fields must be there."""
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)
    routes._sessions.clear()

    state = _stamped_state()
    routes._persist_session("stats-session", state)
    routes._sessions.clear()  # force the reload-from-disk path

    history = await routes.get_history("stats-session")

    assistant = next(m for m in history.messages if m.role == "assistant")
    assert assistant.token_usage["total_tokens"] == 120
    assert assistant.elapsed_seconds == 7.6

    routes._sessions.clear()
