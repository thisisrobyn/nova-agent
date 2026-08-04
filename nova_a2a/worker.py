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

import asyncio
import time
import uuid
from copy import copy
from typing import Dict, List, Sequence

import structlog
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import BaseTool
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from agent.state import NOVAState
from nova_a2a._content import content_to_text
from nova_a2a._tokens import collect_usage
from nova_a2a.agents import AgentSpec
from nova_a2a.budget import Budget, BudgetTracker
from nova_a2a.models import Artifact, Task, TaskState, ToolCall

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

#: The planner's goal is a one-sentence summary of one slice of the user's
#: request — it names material ("using the job description below") without
#: containing it, since the description itself lives in the original message,
#: not in the goal string. Without this, a task whose goal references
#: something "provided" or "below" has nothing to actually read.
_REQUEST_TEMPLATE = (
    "\n\n## Full request the user sent (for reference)\n{request}\n"
    "Your task above is only your slice of this. If it references material "
    "included here — a pasted description, a list, specific details — use it "
    "directly instead of treating it as missing."
)

#: A compound request can run to several thousand characters — job
#: descriptions, pasted specs. Handing all of it to a worker that only needs
#: one paragraph bloats a small local model's context and has been observed
#: to make it loop on tool calls instead of converging, ending in a
#: recursion-limit failure instead of an answer. Cut at a paragraph boundary
#: near the cap rather than mid-sentence.
_MAX_REQUEST_CHARS = 4000


def _cap_request(request: str) -> str:
    if len(request) <= _MAX_REQUEST_CHARS:
        return request
    truncated = request[:_MAX_REQUEST_CHARS]
    cut = truncated.rfind("\n\n")
    if cut > _MAX_REQUEST_CHARS // 2:
        truncated = truncated[:cut]
    return truncated + "\n\n[…truncated — this is only the first part of the user's message]"

_CONTEXT_TEMPLATE = (
    "\n\n## Results from the agents you depend on\n"
    "{artifacts}\n"
    "Use this material directly. Do not go and gather it again."
)

#: Workers deliberately carry no long-term memory — they are handed their
#: context rather than retrieving it. Recent turns are the exception: without
#: them a task whose goal says "the same document as before" refers to nothing.
_CONVERSATION_TEMPLATE = (
    "\n\n## Recent conversation (context only)\n{conversation}\n"
    "This is background. Your task above is the only thing you must carry out."
)

#: Cache of compiled worker graphs, keyed by agent id *and* the tools that were
#: bound. Connecting an account changes the belt, and a stale graph would keep
#: running without the new tools.
_graph_cache: Dict[tuple, object] = {}


def resolve_tools(spec: AgentSpec) -> List[BaseTool]:
    """Return the bound tools this agent is allowed to use, exactly as bound.

    Names that are not currently bound — a Google tool while only Microsoft is
    connected — are silently dropped rather than raising: the agent stays
    useful with whatever half of its belt exists.

    The tools are handed over untouched, deliberately. A per-tool timeout used
    to be applied here by wrapping each one, and it broke every tool call in
    the system: LangChain introspects ``_arun``'s signature to decide whether
    to inject ``config``, and a wrapper that does not reproduce that signature
    exactly makes it withhold the argument, so each call died with a
    ``TypeError`` that the agent dutifully reported as "this tool is
    unavailable due to a configuration error".

    Nothing is lost by dropping it. A hung tool is already bounded by the
    task's own budget — :func:`run_task` runs the whole worker under
    ``asyncio.wait_for(..., budget.max_seconds)`` — so it cannot stall the
    run; it costs that task its time budget, and the agent then answers with
    whatever it had gathered. A genuine per-tool ceiling belongs inside each
    tool, next to the client that makes the call, not bolted on from here.
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
    """Render the artifacts a task depends on for its prompt.

    Partial material is labelled as such. The alternative — passing it silently
    — invites the worker to present half a result as a whole one, which is
    exactly the confabulation that skipping dependents was meant to prevent.
    """
    blocks = []
    for artifact in artifacts:
        body = artifact.text.strip() or str(artifact.data)
        header = f"### {artifact.name} (from {artifact.produced_by})"
        if artifact.partial:
            header += "\n[INCOMPLETE — the agent that produced this did not finish. Use what is "
            header += "here, and state plainly what is missing rather than filling the gap.]"
        blocks.append(f"{header}\n{body}")
    return "\n\n".join(blocks)


def _collect_token_usage(messages: Sequence[object]) -> Dict[str, int] | None:
    """Accumulate token usage from every AIMessage the worker produced."""
    return collect_usage(messages)


async def _emit_tool_events(
    event_sink, messages: Sequence[object], task_id: str, record: List[ToolCall]
) -> None:
    """Announce the tool activity contained in *messages*.

    Called with only the messages a worker produced since the last graph step,
    so each call reports what just happened rather than replaying the run. The
    same activity is appended to *record*, which rides along on the task so it
    outlives the stream.
    """
    for message in messages:
        if isinstance(message, AIMessage) and getattr(message, "tool_calls", None):
            for call in (message.tool_calls or []):
                name = str(call.get("name", "unknown"))
                record.append(ToolCall(name=name))
                await _emit_event(
                    event_sink,
                    {"type": "tool_start", "name": name, "task_id": task_id},
                )
        elif isinstance(message, ToolMessage):
            name = getattr(message, "name", "unknown") or "unknown"
            result = content_to_text(message.content)[:200]
            for call in record:
                if call.name == name and not call.result:
                    call.result = result
                    break
            await _emit_event(
                event_sink,
                {
                    "type": "tool_end",
                    "name": name,
                    "result": result,
                    "task_id": task_id,
                },
            )


def _task_end_payload(result: Task, agent_id: str) -> Dict[str, object]:
    """The terminal event for a task, in whichever state it ended.

    Built in one place so every exit path reports the same fields — the token
    usage and the budget note included, which is what lets the UI show the cost
    and the reason a task stopped without waiting for the run to finish.
    """
    payload: Dict[str, object] = {
        "type": "task_end",
        "id": result.id,
        "agent": agent_id,
        "state": result.state.value,
        "elapsed_seconds": result.elapsed_seconds,
    }
    if result.artifact is not None:
        payload["artifact"] = result.artifact.text
    if result.error:
        payload["error"] = result.error
    if result.token_usage:
        payload["token_usage"] = result.token_usage
    if result.budget_note:
        payload["note"] = result.budget_note
    return payload


async def _emit_event(event_sink, event: Dict[str, object]) -> None:
    """Send a lifecycle or tool notification to the stream callback, if any.

    The sink is an async callback — the executor documents it that way and the
    orchestrator hands down ``queue.put``. A queue itself is accepted too, so
    that calling this with the raw buffer is not a silent no-op: every event
    the worker emits used to be swallowed by the ``except`` below because the
    callback was being treated as a queue, which left the UI with a plan that
    never progressed until the whole run finished.
    """
    if event_sink is None:
        return
    emit = getattr(event_sink, "put", event_sink)
    try:
        await emit(event)
    except Exception:
        logger.warning("failed to emit task event", event=event, exc_info=True)


async def _stream_worker(
    spec: AgentSpec,
    prompt: str,
    task_id: str,
    on_event,
    tools_record: List[ToolCall],
    tracker: BudgetTracker,
    state: Dict[str, object],
) -> None:
    """Drive one worker's ReAct loop, reporting and policing it as it runs.

    Streamed rather than invoked: ``ainvoke`` only hands back the messages once
    the whole loop has finished, which is what made the UI sit silent and then
    show every step at once. ``stream_mode="values"`` yields the state after
    each node, so each tool call is announced as it happens — and can be
    stopped *before* the tools in it run, which is what makes the budget a
    ceiling rather than a post-mortem.

    Writes the last state it saw into *state* so the caller still has the
    partial conversation if this coroutine is cancelled on timeout.
    """
    emitted = 0
    async for chunk in get_worker_graph(spec).astream(
        {"messages": [HumanMessage(content=prompt)]},
        config={"recursion_limit": _RECURSION_LIMIT},
        stream_mode="values",
    ):
        state.clear()
        state.update(chunk)
        messages = chunk.get("messages", [])
        fresh = messages[emitted:]
        emitted = len(messages)
        await _emit_tool_events(on_event, fresh, task_id, tools_record)
        if tracker.observe(fresh):
            logger.info(
                "task stopped by its execution budget",
                task=task_id,
                agent=spec.id,
                reason=tracker.reason,
                steps=tracker.steps,
                tool_calls=tracker.tool_calls,
            )
            break


#: Cap on salvaged material. It exists to unblock the next task, not to become
#: the answer, and a dependent's prompt still has to fit in a small model.
_MAX_SALVAGE_CHARS = 1500


def _salvage(messages: Sequence[object], exclude: str = "") -> str:
    """Recover the usable material from a task that ended up failing.

    A worker that says "FAILED: the calendar is unavailable" has usually still
    run two or three tools successfully before hitting the one that broke. The
    tool results are sitting in its message list; throwing them away with the
    task is what turned one unavailable service into a dead plan.
    """
    chunks: List[str] = []
    for message in messages:
        if isinstance(message, ToolMessage):
            text = content_to_text(message.content).strip()
            name = getattr(message, "name", "") or "tool"
        elif isinstance(message, AIMessage):
            text = content_to_text(message.content).strip()
            name = ""
        else:
            continue
        # The failure report itself is the error, not material.
        if not text or text == exclude or text.upper().startswith("FAILED:"):
            continue
        if text.upper().startswith("ERROR:"):
            continue
        chunks.append(f"{name}: {text}" if name else text)

    salvaged = "\n\n".join(chunks).strip()
    return salvaged[:_MAX_SALVAGE_CHARS]


async def _conclude_from_context(
    spec: AgentSpec, messages: Sequence[object], reason: str
) -> str:
    """Ask the model for an answer built only from what it already gathered.

    The "finish early when there is enough information" policy. A task that
    exhausted its budget has usually done most of the work — the tool results
    are sitting right there in its message list — so throwing that away and
    reporting a bare failure destroys real value. No tools are bound here on
    purpose: the whole point is that the searching has stopped.
    """
    from agent.llm import get_llm

    llm = get_llm()
    if llm is None:
        return ""

    directive = HumanMessage(
        content=(
            "Stop here: you have used up the budget for this task "
            f"({reason}). Answer the task now using only what you have already "
            "gathered above. Do not ask for more searches or tool calls. If what "
            "you have is genuinely not enough to answer, start your reply with "
            "'FAILED:' and say what is missing."
        )
    )
    try:
        response = await llm.ainvoke(
            [SystemMessage(content=_build_system_prompt(spec))]
            + [m for m in messages if isinstance(m, BaseMessage)]
            + [directive]
        )
    except Exception as exc:
        logger.warning("could not conclude after budget exhaustion", error=str(exc))
        return ""
    return content_to_text(getattr(response, "content", "")).strip()


async def _run_remote_task(
    spec: AgentSpec,
    task: Task,
    result: Task,
    prompt: str,
    on_event,
    started: float,
    log,
) -> Task:
    """Execute a task by handing it to an agent in another process.

    Deliberately thin. The peer owns its own budget, tools and retries — this
    side's job is to ask, wait, and translate the answer back into the same
    terminal :class:`Task` a local worker would have produced.
    """
    from nova_a2a.client import send_message

    log.info("dispatching to remote agent", endpoint=spec.endpoint)
    answer = await send_message(spec.endpoint, prompt, context_id=task.id)
    result.elapsed_seconds = round(time.monotonic() - started, 1)

    if not answer:
        result.state = TaskState.FAILED
        result.error = f"the remote agent at {spec.endpoint} did not answer"
    elif answer.upper().startswith("FAILED:"):
        result.state = TaskState.FAILED
        result.error = answer[len("FAILED:"):].strip()
    else:
        result.state = TaskState.COMPLETED
        result.artifact = Artifact(
            artifact_id=str(uuid.uuid4()),
            name=task.skill,
            text=answer,
            produced_by=spec.id,
        )

    await _emit_event(on_event, _task_end_payload(result, spec.id))
    return result


async def run_task(
    spec: AgentSpec,
    task: Task,
    context: Sequence[Artifact] = (),
    on_event=None,
    request: str = "",
    conversation: str = "",
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
        request: The user's full original message, for tasks whose goal
            references material — a pasted description, specifics — that
            only exists in that original text, not in the goal summary.

    Returns:
        A copy of ``task`` in ``COMPLETED`` or ``FAILED`` state, with its
        artifact attached on success.
    """
    result = task.model_copy(deep=True)
    result.assigned_to = spec.id
    result.state = TaskState.WORKING

    prompt = _TASK_TEMPLATE.format(goal=task.goal)
    if request.strip() and request.strip() != task.goal.strip():
        prompt += _REQUEST_TEMPLATE.format(request=_cap_request(request.strip()))
    if conversation.strip():
        prompt += _CONVERSATION_TEMPLATE.format(conversation=conversation.strip())
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

    budget = Budget.from_env().merge(spec.budget)
    tracker = BudgetTracker(budget)
    started = time.monotonic()

    # A remote agent runs its own loop on its own machine; there is no graph to
    # stream and no tool belt to police here. Everything after this point —
    # states, artifacts, events — is identical either way, which is the seam
    # that lets an agent move out of the process without the orchestrator
    # noticing.
    if spec.is_remote:
        return await _run_remote_task(spec, task, result, prompt, on_event, started, log)

    state: Dict[str, object] = {}
    try:
        await asyncio.wait_for(
            _stream_worker(spec, prompt, task.id, on_event, result.tools, tracker, state),
            # A tool that hangs on a network call would otherwise sit past the
            # budget forever: the in-loop check only fires between graph steps.
            timeout=budget.max_seconds,
        )
    except asyncio.TimeoutError:
        tracker.reason = (
            f"was stopped at its {budget.max_seconds:.0f}s time budget, "
            "mid-step"
        )
        log.warning("task hit its time budget", elapsed=round(tracker.elapsed, 1))
    except GraphRecursionError:
        # The worker kept calling tools without ever producing a final
        # answer — a small model looping rather than converging, usually on
        # a broad or under-specified task. LangGraph's own message names its
        # internal step budget, which means nothing to the person reading it.
        elapsed = round(time.monotonic() - started, 1)
        log.warning("task hit its step budget without converging")
        result.state = TaskState.FAILED
        result.error = (
            "gave up after too many steps without reaching an answer — "
            "try narrowing the request"
        )
        result.elapsed_seconds = elapsed
        await _emit_event(on_event, _task_end_payload(result, spec.id))
        return result
    except Exception as exc:
        elapsed = round(time.monotonic() - started, 1)
        log.warning("task raised", error=str(exc), exc_info=True)
        result.state = TaskState.FAILED
        result.error = str(exc)
        result.elapsed_seconds = elapsed
        await _emit_event(on_event, _task_end_payload(result, spec.id))
        return result

    messages = list(state.get("messages", []))

    answer = ""
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.content:
            text = content_to_text(message.content).strip()
            if text:
                answer = text
                break

    # A task cut short was mid-tool-call when it stopped, so its last message
    # is a tool request, not an answer. One final tool-less call turns the
    # material it already gathered into the result it never got to write.
    if tracker.reason:
        result.budget_note = tracker.reason
        concluded = await _conclude_from_context(spec, messages, tracker.reason)
        if concluded:
            answer = concluded
        log.info("task concluded under budget pressure", recovered=bool(concluded))

    if not answer:
        result.state = TaskState.FAILED
        result.error = "the agent produced no answer"
        log.warning("task produced no answer")
        result.token_usage = _collect_token_usage(messages)
        result.elapsed_seconds = round(time.monotonic() - started, 1)
        await _emit_event(on_event, _task_end_payload(result, spec.id))
        return result

    # The worker was told to flag its own failures; honouring that keeps a
    # "FAILED: no calendar connected" out of the final answer as if it were a
    # result the user asked for.
    if answer.upper().startswith("FAILED:"):
        result.state = TaskState.FAILED
        result.error = answer[len("FAILED:"):].strip()
        result.token_usage = _collect_token_usage(messages)
        result.elapsed_seconds = round(time.monotonic() - started, 1)

        # Whatever it did manage to gather before giving up is still real, and
        # is attached as a partial artifact. One unavailable service used to
        # take every downstream task with it; now the tasks that depend on this
        # one get the material that exists, labelled as incomplete.
        salvaged = _salvage(messages, exclude=answer)
        if salvaged:
            result.artifact = Artifact(
                artifact_id=str(uuid.uuid4()),
                name=task.skill,
                text=salvaged,
                produced_by=spec.id,
                partial=True,
            )
        log.info("task reported failure", error=result.error, salvaged=bool(salvaged))
        await _emit_event(on_event, _task_end_payload(result, spec.id))
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
    await _emit_event(on_event, _task_end_payload(result, spec.id))
    return result
