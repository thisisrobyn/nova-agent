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

from typing import Any, Dict, List

import structlog
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph

from nova_a2a.aggregator import synthesise
from nova_a2a.executor import execute_plan
from nova_a2a.models import Task
from nova_a2a.planner import build_plan
from nova_a2a.registry import available_agents
from nova_a2a.state import OrchestratorState

logger = structlog.stdlib.get_logger(__name__)

_compiled_graph = None


def _last_user_message(state: OrchestratorState) -> str:
    """The text of the most recent human turn, or an empty string."""
    for message in reversed(state.get("messages", []) or []):
        if isinstance(message, HumanMessage):
            return str(message.content or "").strip()
    return ""


# ── Nodes ────────────────────────────────────────────────────────────


async def planner_node(state: OrchestratorState, config: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Decompose the user's request into a task plan.

    Returns an empty plan whenever orchestration does not apply, which routes
    the run to the single-agent fallback.
    """
    request = _last_user_message(state)
    if not request:
        return {"request": "", "plan": []}

    agents = await available_agents()
    plan = await build_plan(request, agents)

    # One task is not orchestration, it is a detour: the single-agent graph
    # does the same work with memory and knowledge-base context the workers
    # deliberately do not carry.
    if len(plan) < 2:
        logger.info("plan too small to orchestrate", tasks=len(plan))
        return {"request": request, "plan": []}

    return {"request": request, "plan": plan}


async def executor_node(state: OrchestratorState, config: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Run the plan across the workers, honouring dependencies."""
    event_sink = None
    if config:
        event_sink = (config.get("configurable") or {}).get("event_sink")

    plan = state.get("plan", []) or []
    results = await execute_plan(plan, on_event=event_sink.put if event_sink is not None else None)
    token_usage = {
        "prompt_tokens": sum(
            int((task.token_usage or {}).get("prompt_tokens", 0))
            for task in results
        ),
        "completion_tokens": sum(
            int((task.token_usage or {}).get("completion_tokens", 0))
            for task in results
        ),
        "total_tokens": sum(
            int((task.token_usage or {}).get("total_tokens", 0))
            for task in results
        ),
    }
    return {"results": results, "token_usage": token_usage, "total_tokens": token_usage["total_tokens"]}


def _llm_streaming_config(config: Dict[str, Any] | None) -> Dict[str, Any] | None:
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


async def aggregator_node(state: OrchestratorState, config: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Merge the workers' artifacts into the reply the user sees."""
    results: List[Task] = state.get("results", []) or []
    answer = await synthesise(
        state.get("request", ""), results, config=_llm_streaming_config(config)
    )
    return {"messages": [AIMessage(content=answer)]}


async def fallback_node(state: OrchestratorState, config: Dict[str, Any] | None = None) -> Dict[str, Any]:
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
    graph.add_node("aggregator", aggregator_node)
    graph.add_node("fallback", fallback_node)

    graph.add_edge(START, "planner")
    graph.add_conditional_edges(
        "planner",
        _route_plan,
        {"executor": "executor", "fallback": "fallback"},
    )
    graph.add_edge("executor", "aggregator")
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
