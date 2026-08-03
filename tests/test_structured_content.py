"""Structured message content must never reach the UI as a raw block list."""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from api import routes
from api.routes import _content_to_text


#: What a reasoning model with MCP tools puts into ``AIMessage.content``.
_BLOCKS = [
    {"type": "thinking", "thinking": "", "signature": "abc"},
    {
        "type": "tool_use",
        "id": "toolu_1",
        "name": "google_list_calendar_events",
        "input": {"max_results": 25},
    },
]


def test_text_blocks_are_extracted():
    assert _content_to_text([{"type": "text", "text": "hola"}]) == "hola"
    assert _content_to_text("hola") == "hola"
    assert _content_to_text(None) == ""


def test_thinking_and_tool_use_blocks_are_dropped():
    assert _content_to_text(_BLOCKS) == ""
    assert _content_to_text([*_BLOCKS, {"type": "text", "text": "Tienes 2 eventos."}]) == (
        "Tienes 2 eventos."
    )


@pytest.mark.asyncio
async def test_history_never_leaks_block_reprs(tmp_path, monkeypatch):
    """Reloading a session used to render the Python repr of the block list."""
    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)
    routes._sessions.clear()

    state = {
        "messages": [
            HumanMessage(content="¿qué tengo hoy?"),
            AIMessage(content=_BLOCKS),
            ToolMessage(
                content=[{"type": "text", "text": "Reunión 10:00"}],
                name="google_list_calendar_events",
                tool_call_id="toolu_1",
            ),
            AIMessage(content=[{"type": "text", "text": "Tienes una reunión a las 10:00."}]),
        ],
    }
    routes._persist_session("blocks-session", state)
    routes._sessions.clear()  # force the reload-from-disk path

    history = await routes.get_history("blocks-session")

    assert all("'type': 'thinking'" not in m.content for m in history.messages)
    assert all("toolu_" not in m.content for m in history.messages)

    assistants = [m for m in history.messages if m.role == "assistant"]
    assert len(assistants) == 1  # the tool-call-only turn is not shown
    assert assistants[0].content == "Tienes una reunión a las 10:00."
    # The tool chips travel with the answer, since the UI drops tool rows.
    assert [t.name for t in assistants[0].tools_used] == ["google_list_calendar_events"]

    routes._sessions.clear()
