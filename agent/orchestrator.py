"""NOVA orchestrator graph — the supervisor over the A2A workers.

Builds and compiles a ``StateGraph`` that decomposes a request, runs the
resulting tasks across specialised agents, and merges the results::

                          START
                            │
                            ▼
                        ┌────────┐
                        │ planner│
                        └───┬────┘
                  plan?     │      no plan
              ┌─────────────┴─────────────┐
              ▼                           ▼
         ┌─────────┐                 ┌──────────┐
         │ executor│                 │ fallback │  (single-agent graph)
         └────┬────┘                 └────┬─────┘
              ▼                           │
        ┌────────────┐                    │
        │ aggregator │                    │
        └─────┬──────┘                    │
              └───────────► END ◄─────────┘

The fallback branch is the important one. Orchestration is worth its cost for
a request with several independent jobs in it and is pure overhead for "what
time is it?" — so the planner is allowed to decline, and when it does, the run
goes through exactly the graph NOVA used before this module existed.

Public API
----------
- ``get_orchestrator_graph()`` — the compiled runnable.
- ``run_orchestrated_once()``  — one turn, for the CLI and tests.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

import structlog
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from nova_a2a._tokens import merge_usage
from nova_a2a.aggregator import synthesise
from nova_a2a.executor import execute_plan
from nova_a2a.models import Task, TaskState
from nova_a2a.planner import build_plan, repair_plan
from nova_a2a.registry import available_agents
from nova_a2a.state import OrchestratorState

logger = structlog.stdlib.get_logger(__name__)

_compiled_graph = None


#: How many previous turns the orchestrator carries into planning and into the
#: workers. Two exchanges is enough to resolve "do the same for Friday" without
#: spending a small model's context window on history it will not use.
_CONTEXT_TURNS = 4
_CONTEXT_CHARS = 1200

#: Rounds of repair the orchestrator may attempt before answering with whatever
#: it has. One is deliberate: a second failure of the same work is evidence the
#: approach is wrong, not that it needs another go.
MAX_REPAIR_ROUNDS = 1


def _last_user_message(state: OrchestratorState) -> str:
    """The text of the most recent human turn, or an empty string."""
    for message in reversed(state.get("messages", []) or []):
        if isinstance(message, HumanMessage):
            return str(message.content or "").strip()
    return ""


def _conversation_context(state: OrchestratorState) -> str:
    """A compact transcript of the turns before this one.

    Orchestration used to start from a single message with no history at all,
    which made every follow-up unplannable: "and now the same for Friday" names
    no skill, no subject and no date. The planner and the workers both get this
    — bounded hard, because a worker's whole advantage is a small prompt.
    """
    messages = list(state.get("messages", []) or [])
    if len(messages) <= 1:
        return ""

    lines: List[str] = []
    for message in reversed(messages[:-1]):  # the current turn is passed separately
        if isinstance(message, HumanMessage):
            speaker = "User"
        elif isinstance(message, AIMessage):
            speaker = "NOVA"
        else:
            continue  # tool traffic is noise at this altitude
        text = str(message.content or "").strip()
        if not text:
            continue
        lines.append(f"{speaker}: {text}")
        if len(lines) >= _CONTEXT_TURNS:
            break

    transcript = "\n".join(reversed(lines))
    if len(transcript) > _CONTEXT_CHARS:
        transcript = "…" + transcript[-_CONTEXT_CHARS:]
    return transcript


# ── Nodes ────────────────────────────────────────────────────────────
#
# Every node below annotates its second parameter as ``Optional[RunnableConfig]``
# and nothing else. LangGraph decides whether to inject the runtime config by
# matching that annotation against a fixed list of accepted spellings, and this
# module has ``from __future__ import annotations``, so the match is done on the
# literal source text. Any other spelling — ``Dict[str, Any] | None``, or even
# ``RunnableConfig | None`` — silently passes ``None`` instead, which is not a
# cosmetic difference: ``config`` is how the SSE event sink and the token
# handler reach these nodes. Without it the live agent diagram never receives a
# `plan` event and the final answer arrives in one block instead of streaming.


async def planner_node(state: OrchestratorState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Decompose the user's request into a task plan.

    Returns an empty plan whenever orchestration does not apply, which routes
    the run to the single-agent fallback.
    """
    request = _last_user_message(state)
    if not request:
        return {"request": "", "plan": []}

    conversation = _conversation_context(state)
    agents = await available_agents()
    plan = await build_plan(request, agents, conversation=conversation)

    # One task is not orchestration, it is a detour: the single-agent graph
    # does the same work with memory and knowledge-base context the workers
    # deliberately do not carry.
    if len(plan) < 2:
        logger.info("plan too small to orchestrate", tasks=len(plan))
        return {"request": request, "plan": [], "conversation": conversation}

    # One identifier for the whole turn, stamped on every event it emits. What
    # makes a run inspectable after the fact: without it the only way to group
    # a conversation's events is to infer where one turn ended.
    run_id = uuid.uuid4().hex[:12]
    logger.info("orchestrated run starting", run_id=run_id, tasks=len(plan))
    return {
        "request": request,
        "plan": plan,
        "conversation": conversation,
        "run_id": run_id,
        "repair_rounds": 0,
        "results": [],
    }


async def executor_node(state: OrchestratorState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Run the plan across the workers, honouring dependencies.

    Re-entered after a repair round, in which case the tasks that already
    succeeded are carried in rather than re-run.
    """
    event_sink = None
    if config:
        event_sink = (config.get("configurable") or {}).get("event_sink")

    plan = state.get("plan", []) or []
    settled = list(state.get("results", []) or [])
    # A repair round only re-executes the replacements; everything that already
    # worked keeps its artifact, and stays available to the new tasks.
    pending = [task for task in plan if task.id not in {done.id for done in settled}]

    fresh = await execute_plan(
        pending,
        on_event=event_sink.put if event_sink is not None else None,
        request=state.get("request", ""),
        conversation=state.get("conversation", ""),
        run_id=state.get("run_id", ""),
        done_already=settled,
    )

    results = settled + fresh
    token_usage = merge_usage(*(task.token_usage for task in results)) or {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
    return {
        # `results` is overwritten, not appended: it already contains `settled`.
        "results": results,
        "token_usage": token_usage,
        "total_tokens": token_usage["total_tokens"],
    }


async def repair_node(state: OrchestratorState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Ask the planner for a different approach to whatever failed.

    Emits the repaired plan through the event sink so the diagram grows the new
    tasks live, instead of them appearing only in the final answer.
    """
    event_sink = None
    if config:
        event_sink = (config.get("configurable") or {}).get("event_sink")

    results: List[Task] = state.get("results", []) or []
    agents = await available_agents()
    repairs = await repair_plan(state.get("request", ""), results, agents)
    rounds = int(state.get("repair_rounds", 0)) + 1

    if not repairs:
        return {"repair_rounds": rounds}

    # The results of the tasks being replaced stay in `results` — the user
    # asked what happened, and "it failed, then this worked" is the honest
    # account of a repaired run.
    plan = list(state.get("plan", []) or []) + repairs
    logger.info("repairing plan", run_id=state.get("run_id", ""), round=rounds, tasks=len(repairs))
    if event_sink is not None:
        await event_sink.put(
            {
                "type": "replan",
                "run_id": state.get("run_id", ""),
                "round": rounds,
                "tasks": [
                    {
                        "id": task.id,
                        "skill": task.skill,
                        "goal": task.goal,
                        "depends_on": list(task.depends_on),
                        "repairs": task.repairs,
                    }
                    for task in repairs
                ],
            }
        )
    return {"plan": plan, "repair_rounds": rounds}


def _route_after_execution(state: OrchestratorState) -> str:
    """Repair a failed round once, then answer with whatever there is."""
    results: List[Task] = state.get("results", []) or []
    if int(state.get("repair_rounds", 0)) >= MAX_REPAIR_ROUNDS:
        return "aggregator"
    unachieved = (TaskState.FAILED, TaskState.SKIPPED)
    if not any(task.state in unachieved for task in results):
        return "aggregator"
    return "repair"


def _route_after_repair(state: OrchestratorState) -> str:
    """Re-execute only if the planner actually produced replacements."""
    settled = {task.id for task in state.get("results", []) or []}
    has_new = any(task.id not in settled for task in state.get("plan", []) or [])
    return "executor" if has_new else "aggregator"


def _llm_streaming_config(config: Optional[RunnableConfig]) -> Dict[str, Any] | None:
    """Build a config that streams tokens, for the one call site that should.

    The token handler is threaded through ``configurable`` rather than
    attached as a top-level ``callbacks`` entry on the graph invocation: a
    callback registered on the whole run fires for *every* LLM call it makes
    — the planner's structured-output JSON and each worker's answer included
    — and those would land in the chat as raw text ahead of, or mixed into,
    the real reply. Only the node that actually produces the user-facing
    answer (the aggregator, or the fallback's single-agent graph) opts back
    in by building its own scoped config from this helper.
    """
    token_handler = (config or {}).get("configurable", {}).get("token_handler")
    return {"callbacks": [token_handler]} if token_handler is not None else None


async def aggregator_node(state: OrchestratorState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Merge the workers' artifacts into the reply the user sees."""
    results: List[Task] = state.get("results", []) or []
    merge_tokens: Dict[str, int] = {}
    answer = await synthesise(
        state.get("request", ""),
        results,
        config=_llm_streaming_config(config),
        on_usage=merge_tokens.update,
    )

    # The turn's cost is the workers' plus this merge call — the executor
    # already stored the former, so fold this one in on the way out.
    token_usage = merge_usage(state.get("token_usage"), merge_tokens or None)
    update: Dict[str, Any] = {"messages": [AIMessage(content=answer)]}
    if token_usage:
        update["token_usage"] = token_usage
        update["total_tokens"] = token_usage["total_tokens"]
    return update


async def fallback_node(state: OrchestratorState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    """Hand the turn to the ordinary single-agent graph.

    Invoked as a subgraph rather than reimplemented: memory injection,
    knowledge-base retrieval and the invented-tool recovery all live there,
    and a request that skipped planning deserves every one of them.
    """
    from agent.graph import get_compiled_graph

    result = await get_compiled_graph().ainvoke(dict(state), config=_llm_streaming_config(config))
    # Only the keys the single-agent graph owns are propagated; `add_messages`
    # would duplicate the history if the whole message list were returned.
    messages = result.get("messages", [])
    new_messages = messages[len(state.get("messages", []) or []):]
    return {
        "messages": list(new_messages),
        "memory_context": result.get("memory_context", ""),
        "knowledge_context": result.get("knowledge_context", ""),
        "token_usage": result.get("token_usage"),
        "total_tokens": result.get("total_tokens", 0),
        "iteration_count": result.get("iteration_count", 0),
    }


def _route_plan(state: OrchestratorState) -> str:
    """Send the run down the orchestrated path only if there is a plan."""
    return "executor" if state.get("plan") else "fallback"


# ── Graph construction ───────────────────────────────────────────────


def _build_and_compile():
    """Build and compile the orchestrator graph."""
    graph = StateGraph(OrchestratorState)
    graph.add_node("planner", planner_node)
    graph.add_node("executor", executor_node)
    graph.add_node("repair", repair_node)
    graph.add_node("aggregator", aggregator_node)
    graph.add_node("fallback", fallback_node)

    graph.add_edge(START, "planner")
    graph.add_conditional_edges(
        "planner",
        _route_plan,
        {"executor": "executor", "fallback": "fallback"},
    )
    # executor → repair → executor is the only cycle in the graph, and
    # `MAX_REPAIR_ROUNDS` is what terminates it: the router sends the run to
    # the aggregator once the budget of repair rounds is spent, whether or not
    # anything is still failing.
    graph.add_conditional_edges(
        "executor",
        _route_after_execution,
        {"repair": "repair", "aggregator": "aggregator"},
    )
    graph.add_conditional_edges(
        "repair",
        _route_after_repair,
        {"executor": "executor", "aggregator": "aggregator"},
    )
    graph.add_edge("aggregator", END)
    graph.add_edge("fallback", END)

    compiled = graph.compile()
    logger.info("NOVA orchestrator graph compiled")
    return compiled


def get_orchestrator_graph():
    """Return the compiled orchestrator graph, building it on first call."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_and_compile()
    return _compiled_graph


def reset_orchestrator_graph() -> None:
    """Drop the compiled graph and every cached worker graph.

    Called when the agent's tool set changes, so a newly connected account
    reaches the workers without a restart.
    """
    global _compiled_graph
    from nova_a2a.worker import reset_graph_cache

    _compiled_graph = None
    reset_graph_cache()


# ── Convenience helper ───────────────────────────────────────────────


async def run_orchestrated_once(
    user_input: str,
    state: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Run one orchestrated turn and return the updated state.

    Mirrors :func:`agent.graph.run_agent_once` so the two are interchangeable
    at the call site.

    Args:
        user_input: The user's message.
        state: Previous conversation state, or ``None`` for a new session.

    Returns:
        The full updated state dictionary.
    """
    if state is None:
        state = {
            "messages": [],
            "memory_context": "",
            "knowledge_context": "",
            "tool_results": [],
            "iteration_count": 0,
            "total_tokens": 0,
            "token_usage": None,
            "request": "",
            "plan": [],
            "results": [],
        }

    input_state = dict(state)
    input_state["messages"] = list(state.get("messages", [])) + [
        HumanMessage(content=user_input)
    ]

    return await get_orchestrator_graph().ainvoke(input_state)
