"""In-process execution of an internal agent.

The counterpart of :mod:`nova_mcp.builtin`, and for the same reason: NOVA's
workers live in this process, so putting an HTTP transport between the
orchestrator and them would add serialisation and a round trip to every step
while buying nothing. The A2A *model* — tasks, states, artifacts — is honoured
in full; only the wire is skipped.

That is a deliberate seam. When the transport lands, an agent moves out of the
process by swapping this executor for an A2A client call: the orchestrator
still hands over a :class:`~nova_a2a.models.Task` and still gets an
:class:`~nova_a2a.models.Artifact` back.
"""

from __future__ import annotations

import time
import uuid
from typing import Dict, List, Sequence

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agent.state import NOVAState
from nova_a2a._content import content_to_text
from nova_a2a.agents import AgentSpec
from nova_a2a.models import Artifact, Task, TaskState

logger = structlog.stdlib.get_logger(__name__)

#: Tool-loop iterations a single worker may take before the graph is cut off.
#: Each ReAct step is one LLM call, so this bounds a task's cost. Two nodes run
#: per iteration, hence the doubling.
MAX_WORKER_STEPS = 6
_RECURSION_LIMIT = MAX_WORKER_STEPS * 2 + 1

_WORKER_PROMPT = (
    "You are the {name} inside NOVA, a multi-agent system.\n\n"
    "## Your role\n"
    "{description}\n"
    "You have been given exactly one task. Carry it out and report the result. "
    "Do not attempt work outside your role — other agents are handling the rest "
    "of the user's request in parallel, and duplicating their work causes "
    "conflicting results.\n\n"
    "## Operating brief\n"
    "{instructions}\n\n"
    "## Reporting\n"
    "- Only ever call a tool from your own tool belt. If none fits, say so and stop.\n"
    "- When you are done, reply with the result itself, not a description of what "
    "you did. Be concise: your answer is consumed by another agent, not shown "
    "directly to the user.\n"
    "- If you could not complete the task, start your reply with 'FAILED:' and "
    "state what blocked you. A clear failure is more useful than an invented "
    "success."
)

_TASK_TEMPLATE = "## Your task\n{goal}"

_CONTEXT_TEMPLATE = (
    "\n\n## Results from the agents you depend on\n"
    "{artifacts}\n"
    "Use this material directly. Do not go and gather it again."
)

#: Cache of compiled worker graphs, keyed by agent id *and* the tools that were
#: bound. Connecting an account changes the belt, and a stale graph would keep
#: running without the new tools.
_graph_cache: Dict[tuple, object] = {}


def resolve_tools(spec: AgentSpec) -> List[BaseTool]:
    """Return the bound tools this agent is allowed to use.

    Names that are not currently bound — a Google tool while only Microsoft is
    connected — are silently dropped rather than raising: the agent stays
    useful with whatever half of its belt exists.
    """
    from agent.graph import get_tools

    bound = {tool.name: tool for tool in get_tools()}
    return [bound[name] for name in spec.tool_names if name in bound]


def _build_system_prompt(spec: AgentSpec) -> str:
    """Assemble the worker's system prompt, date table included."""
    from agent.nodes import now_block

    prompt = _WORKER_PROMPT.format(
        name=spec.name,
        description=spec.description,
        instructions=spec.instructions or "Carry out the task as asked.",
    )
    return prompt + now_block()


def _build_graph(spec: AgentSpec, tools: Sequence[BaseTool]):
    """Compile a ReAct graph scoped to one agent's tools.

    Structurally the same loop as :mod:`agent.graph`, minus the memory and
    knowledge-base injection: a worker is handed its context by the
    orchestrator rather than retrieving it, so every task starts from a clean,
    small prompt.
    """
    from agent.llm import get_llm

    async def worker_node(state: NOVAState) -> Dict[str, object]:
        llm = get_llm()
        if llm is None:
            return {"messages": [AIMessage(content="FAILED: no LLM configured.")]}

        model = llm.bind_tools(list(tools)) if tools else llm
        system = SystemMessage(content=_build_system_prompt(spec))
        response = await model.ainvoke([system] + list(state.get("messages", [])))
        return {"messages": [response]}

    def route(state: NOVAState) -> str:
        messages = state.get("messages", [])
        last = messages[-1] if messages else None
        if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    graph = StateGraph(NOVAState)
    graph.add_node("worker", worker_node)
    graph.add_edge(START, "worker")

    if tools:
        graph.add_node("tools", ToolNode(list(tools), handle_tool_errors=True))
        graph.add_conditional_edges("worker", route, {"tools": "tools", "__end__": END})
        graph.add_edge("tools", "worker")
    else:
        # A reasoning-only agent has nothing to loop over.
        graph.add_edge("worker", END)

    return graph.compile()


def get_worker_graph(spec: AgentSpec):
    """Return the compiled graph for ``spec``, rebuilding it if its belt changed."""
    tools = resolve_tools(spec)
    key = (spec.id, tuple(tool.name for tool in tools))
    if key not in _graph_cache:
        _graph_cache[key] = _build_graph(spec, tools)
        logger.info("worker graph compiled", agent=spec.id, tools=len(tools))
    return _graph_cache[key]


def reset_graph_cache() -> None:
    """Drop every compiled worker graph.

    Called when the agent's tool set is rebuilt, so a newly connected account
    reaches the workers on the next task rather than the next restart.
    """
    _graph_cache.clear()


def _format_context(artifacts: Sequence[Artifact]) -> str:
    """Render the artifacts a task depends on for its prompt."""
    blocks = []
    for artifact in artifacts:
        body = artifact.text.strip() or str(artifact.data)
        blocks.append(f"### {artifact.name} (from {artifact.produced_by})\n{body}")
    return "\n\n".join(blocks)


def _safe_int(value: object, default: int = 0) -> int:
    """Coerce token-numeric payloads into an int without raising."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _collect_token_usage(messages: Sequence[object]) -> Dict[str, int] | None:
    """Accumulate token usage from every AIMessage the worker produced."""
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    found = False

    for message in messages:
        if not isinstance(message, AIMessage):
            continue
        metadata = getattr(message, "response_metadata", {}) or {}
        usage = metadata.get("usage") or metadata.get("token_usage") or {}
        if not isinstance(usage, dict):
            continue
        found = True
        prompt = _safe_int(
            usage.get("prompt_tokens", usage.get("input_tokens", 0)),
            0,
        )
        completion = _safe_int(
            usage.get("completion_tokens", usage.get("output_tokens", 0)),
            0,
        )
        total = _safe_int(usage.get("total_tokens", prompt + completion), 0)
        totals["prompt_tokens"] += prompt
        totals["completion_tokens"] += completion
        totals["total_tokens"] += total

    return totals if found else None


async def _emit_event(event_sink, event: Dict[str, object]) -> None:
    """Send a lifecycle or tool notification to the stream callback, if any."""
    if event_sink is None:
        return
    try:
        await event_sink.put(event)
    except Exception:
        logger.warning("failed to emit task event", event=event, exc_info=True)


async def run_task(
    spec: AgentSpec,
    task: Task,
    context: Sequence[Artifact] = (),
    on_event=None,
) -> Task:
    """Execute one task with one agent and return it in a terminal state.

    Never raises: a worker that blows up must fail its own task and let the
    orchestrator decide what that means for the plan, rather than taking the
    whole run down with it.

    Args:
        spec: The agent carrying out the task.
        task: The task to execute.
        context: Artifacts produced by the tasks this one depends on.
        on_event: Optional async callback for lifecycle/tool events.

    Returns:
        A copy of ``task`` in ``COMPLETED`` or ``FAILED`` state, with its
        artifact attached on success.
    """
    result = task.model_copy(deep=True)
    result.assigned_to = spec.id
    result.state = TaskState.WORKING

    prompt = _TASK_TEMPLATE.format(goal=task.goal)
    if context:
        prompt += _CONTEXT_TEMPLATE.format(artifacts=_format_context(context))

    log = logger.bind(task=task.id, agent=spec.id, skill=task.skill)
    log.info("task dispatched")
    await _emit_event(
        on_event,
        {
            "type": "task_start",
            "id": task.id,
            "agent": spec.id,
            "skill": task.skill,
            "goal": task.goal,
        },
    )

    started = time.monotonic()
    try:
        state = await get_worker_graph(spec).ainvoke(
            {"messages": [HumanMessage(content=prompt)]},
            config={"recursion_limit": _RECURSION_LIMIT},
        )
    except Exception as exc:
        elapsed = round(time.monotonic() - started, 1)
        log.warning("task raised", error=str(exc), exc_info=True)
        result.state = TaskState.FAILED
        result.error = str(exc)
        result.elapsed_seconds = elapsed
        await _emit_event(
            on_event,
            {
                "type": "task_end",
                "id": result.id,
                "agent": spec.id,
                "state": "failed",
                "error": result.error,
                "elapsed_seconds": elapsed,
            },
        )
        return result

    messages = state.get("messages", [])
    for message in messages:
        if isinstance(message, AIMessage) and getattr(message, "tool_calls", None):
            for call in (message.tool_calls or []):
                name = str(call.get("name", "unknown"))
                await _emit_event(
                    on_event,
                    {"type": "tool_start", "name": name, "task_id": task.id},
                )
        elif isinstance(message, ToolMessage):
            name = getattr(message, "name", "unknown") or "unknown"
            result_text = content_to_text(message.content)[:200]
            await _emit_event(
                on_event,
                {
                    "type": "tool_end",
                    "name": name,
                    "result": result_text,
                    "task_id": task.id,
                },
            )

    answer = ""
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.content:
            text = content_to_text(message.content).strip()
            if text:
                answer = text
                break

    if not answer:
        result.state = TaskState.FAILED
        result.error = "the agent produced no answer"
        log.warning("task produced no answer")
        result.token_usage = _collect_token_usage(messages)
        result.elapsed_seconds = round(time.monotonic() - started, 1)
        await _emit_event(
            on_event,
            {
                "type": "task_end",
                "id": result.id,
                "agent": spec.id,
                "state": "failed",
                "error": result.error,
                "elapsed_seconds": result.elapsed_seconds,
            },
        )
        return result

    # The worker was told to flag its own failures; honouring that keeps a
    # "FAILED: no calendar connected" out of the final answer as if it were a
    # result the user asked for.
    if answer.upper().startswith("FAILED:"):
        result.state = TaskState.FAILED
        result.error = answer[len("FAILED:"):].strip()
        result.token_usage = _collect_token_usage(messages)
        result.elapsed_seconds = round(time.monotonic() - started, 1)
        log.info("task reported failure", error=result.error)
        await _emit_event(
            on_event,
            {
                "type": "task_end",
                "id": result.id,
                "agent": spec.id,
                "state": "failed",
                "error": result.error,
                "elapsed_seconds": result.elapsed_seconds,
            },
        )
        return result

    result.state = TaskState.COMPLETED
    result.artifact = Artifact(
        artifact_id=str(uuid.uuid4()),
        name=task.skill,
        text=answer,
        produced_by=spec.id,
    )
    result.token_usage = _collect_token_usage(messages)
    result.elapsed_seconds = round(time.monotonic() - started, 1)
    log.info("task completed", chars=len(answer))
    await _emit_event(
        on_event,
        {
            "type": "task_end",
            "id": result.id,
            "agent": spec.id,
            "state": "completed",
            "artifact": answer,
            "elapsed_seconds": result.elapsed_seconds,
        },
    )
    return result
