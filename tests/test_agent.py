import asyncio

from agent.graph import run_agent_once

def test_run_agent_once_returns_response():
    state = asyncio.run(run_agent_once("Hello agent"))
    messages = state.get("messages", [])
    assert len(messages) >= 2
    assert messages[-1]["role"] == "assistant"
    assert "Hello" in messages[-2]["content"] or "Echo" in messages[-1]["content"]