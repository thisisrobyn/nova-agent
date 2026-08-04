"""Per-message persistence of an orchestrated run.

The session state only ever holds the *latest* turn's plan and results, so an
orchestrated run has to be stamped onto the message it produced. Without that,
scrolling back through a conversation showed the newest diagram on the newest
reply and nothing on any of the others — and reloading the page lost the run
entirely.
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from api.routes import (
    _RUN_KEY,
    _build_task_states,
    _deserialize_message,
    _serialize_message,
    _stamp_last_ai_message,
)
from nova_a2a.models import Artifact, Task, TaskState


def _run_state():
    plan = [Task(id="T1", skill="web.research", goal="research it")]
    done = plan[0].model_copy(deep=True)
    done.state = TaskState.COMPLETED
    done.artifact = Artifact(artifact_id="a1", name="web.research", text="findings")
    done.elapsed_seconds = 2.5
    done.token_usage = {"total_tokens": 42}
    done.tools = [{"name": "web_search", "result": "hits"}]
    return {
        "messages": [HumanMessage(content="hi"), AIMessage(content="here you go")],
        "plan": plan,
        "results": [done],
        "run_id": "run-abc",
        "token_usage": {"total_tokens": 42},
    }


def test_a_run_is_stamped_onto_the_message_it_produced():
    state = _run_state()

    _stamp_last_ai_message(state, elapsed=3.0)

    stamped = state["messages"][-1].additional_kwargs[_RUN_KEY]
    assert stamped["run_id"] == "run-abc"
    assert stamped["plan"][0]["id"] == "T1"
    assert stamped["results"][0]["state"] == "completed"


def test_a_stamped_run_survives_a_round_trip_through_disk():
    """Serialise → deserialise is exactly what a page reload goes through."""
    state = _run_state()
    _stamp_last_ai_message(state, elapsed=3.0)

    restored = _deserialize_message(_serialize_message(state["messages"][-1]))

    run = restored.additional_kwargs[_RUN_KEY]
    states = _build_task_states(run["plan"], run["results"])
    assert len(states) == 1
    assert states[0].state == "completed"
    assert states[0].artifact == "findings"
    assert states[0].elapsed_seconds == 2.5
    assert states[0].token_usage == {"total_tokens": 42}
    # The activity log replays from these, so they must survive too.
    assert [tool.name for tool in states[0].tools] == ["web_search"]


def test_a_turn_that_was_not_orchestrated_stamps_no_run():
    """An ordinary single-agent reply must not grow an empty diagram."""
    state = {
        "messages": [HumanMessage(content="hi"), AIMessage(content="hello")],
        "plan": [],
        "results": [],
    }

    _stamp_last_ai_message(state, elapsed=1.0)

    assert _RUN_KEY not in state["messages"][-1].additional_kwargs


def test_build_task_states_accepts_a_cancelled_task():
    """Stopping a run mid-plan used to make history fail schema validation."""
    plan = [{"id": "T1", "skill": "web.research", "goal": "x", "depends_on": []}]
    results = [{"id": "T1", "state": "canceled", "error": "cancelled before it finished"}]

    states = _build_task_states(plan, results)

    assert states[0].state == "canceled"


@pytest.mark.asyncio
async def test_history_attaches_each_run_to_its_own_message(monkeypatch, tmp_path):
    """Two orchestrated turns must keep two separate diagrams."""
    import api.routes as routes

    monkeypatch.setattr(routes, "_SESSIONS_DIR", tmp_path)

    first = AIMessage(content="first answer")
    first.additional_kwargs[_RUN_KEY] = {
        "run_id": "run-1",
        "plan": [{"id": "A1", "skill": "web.research", "goal": "one", "depends_on": []}],
        "results": [{"id": "A1", "state": "completed"}],
    }
    second = AIMessage(content="second answer")
    second.additional_kwargs[_RUN_KEY] = {
        "run_id": "run-2",
        "plan": [{"id": "B1", "skill": "docs.write", "goal": "two", "depends_on": []}],
        "results": [{"id": "B1", "state": "failed", "error": "nope"}],
    }

    routes._sessions["persist-test"] = {
        "messages": [HumanMessage(content="a"), first, HumanMessage(content="b"), second],
        "plan": [],
        "results": [],
    }

    history = await routes.get_history("persist-test")
    replies = [m for m in history.messages if m.role == "assistant"]

    assert [m.run_id for m in replies] == ["run-1", "run-2"]
    assert [m.plan[0].id for m in replies] == ["A1", "B1"]
    assert replies[1].plan[0].state == "failed"
