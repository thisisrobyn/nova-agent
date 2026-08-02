"""Tests for handling tool calls the model invented."""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from agent.graph import _route_tools, _unknown_tools_node, get_tools


def _ai(*names: str) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {"name": n, "args": {}, "id": f"call-{i}"} for i, n in enumerate(names)
        ],
    )


# ── Routing ──────────────────────────────────────────────────

def test_plain_answer_ends_the_graph():
    assert _route_tools({"messages": [AIMessage(content="hola")]}) == "__end__"


def test_real_tool_goes_to_the_tool_node():
    assert _route_tools({"messages": [_ai("calculator")]}) == "tools"


@pytest.mark.parametrize(
    "invented",
    ["google:search", "google:calendar:create event", "send_email"],
)
def test_invented_tool_is_diverted(invented):
    """Small models fall back to the tool syntax they were pretrained with."""
    assert _route_tools({"messages": [_ai(invented)]}) == "unknown_tools"


def test_a_mixed_batch_is_diverted_whole():
    assert _route_tools({"messages": [_ai("calculator", "google:search")]}) == "unknown_tools"


# ── The interception node ────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_tool_gets_an_instruction_not_an_error():
    """LangGraph's own text leaks the tool name and reads as the user's fault."""
    result = await _unknown_tools_node({"messages": [_ai("google:search")]})

    (reply,) = result["messages"]
    assert reply.content.startswith("TOOL_DOES_NOT_EXIST")
    assert "is not a valid tool, try one of" not in reply.content
    assert "in their own language" in reply.content
    assert "connections panel" in reply.content


@pytest.mark.asyncio
async def test_every_call_in_the_batch_is_answered():
    """An unanswered tool call would dangle and corrupt the next turn."""
    message = _ai("calculator", "google:search")

    result = await _unknown_tools_node({"messages": [message]})

    answered = {m.tool_call_id for m in result["messages"]}
    assert answered == {"call-0", "call-1"}


@pytest.mark.asyncio
async def test_valid_call_in_a_bad_batch_is_marked_skipped():
    result = await _unknown_tools_node({"messages": [_ai("calculator", "nope:nope")]})

    by_name = {m.name: m.content for m in result["messages"]}
    assert by_name["calculator"].startswith("NOT_EXECUTED")
    assert by_name["nope:nope"].startswith("TOOL_DOES_NOT_EXIST")


def test_local_tools_are_always_available():
    """The router's notion of 'valid' must match what is actually bound."""
    names = {t.name for t in get_tools()}
    assert {"calculator", "get_current_datetime", "web_search"} <= names


@pytest.mark.asyncio
async def test_history_without_tool_calls_is_untouched():
    result = await _unknown_tools_node(
        {"messages": [HumanMessage(content="hola"), AIMessage(content="qué tal")]}
    )
    assert result["messages"] == []
