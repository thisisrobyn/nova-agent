"""Wave-based execution of a task plan.

The plan is a DAG discovered at runtime, so it cannot be expressed as static
LangGraph edges. Instead the executor repeatedly takes every task whose
dependencies are satisfied and runs that whole wave concurrently with
``asyncio.gather``. Independent work therefore overlaps — booking a meeting
while the web is being searched — which is the actual latency win over the
single-agent loop, where those two would queue behind each other.

Failure is contained per task. A worker that fails does not abort the run: its
dependents are marked failed with an explanation, everything unrelated still
completes, and the aggregator decides what to tell the user.
"""

from __future__ import annotations

import asyncio
from typing import Dict, List, Sequence

import structlog

from nova_a2a.budget import RetryPolicy
from nova_a2a.models import Artifact, Task, TaskState
from nova_a2a.registry import resolve_skill
from nova_a2a.worker import run_task

logger = structlog.stdlib.get_logger(__name__)

#: Ceiling on concurrent workers. Every task is at least one LLM call, and a
#: local Ollama server serialises requests anyway — letting eight fan out at
#: once would only build a queue and blow the memory budget.
MAX_CONCURRENCY = 4


def _is_transient(task: Task) -> bool:
    """Whether *task*'s failure is worth another attempt.

    Deterministic failures are the common case and must not be retried: the
    plan named a skill nobody provides, the agent reported a missing
    connection, or its own budget stopped it. Each would fail identically on a
    second run, so retrying only makes the user wait twice for the same answer.
    """
    # SKIPPED never reaches here — a task that was not attempted has nothing
    # to retry — and neither does CANCELED, which was the user's decision.
    if task.state is not TaskState.FAILED:
        return False
    if task.budget_note:
        return False
    error = (task.error or "").lower()
    permanent = (
        "no agent provides",
        "not connected",
        "no calendar",
        "skipped:",
        "dependencies could not be satisfied",
        "no llm configured",
    )
    return not any(marker in error for marker in permanent)


def _dependency_artifacts(task: Task, done: Dict[str, Task]) -> List[Artifact]:
    """Collect the artifacts this task's dependencies produced.

    Includes the artifacts of dependencies that *failed but produced
    something* — a research task that timed out after two of its four searches
    still has two searches' worth of material, and the task waiting on it can
    do useful work with that. The artifact carries its own health, so the
    worker prompt can tell it the input is partial.
    """
    artifacts = []
    for dep_id in task.depends_on:
        finished = done.get(dep_id)
        if finished and finished.artifact:
            artifacts.append(finished.artifact)
    return artifacts


def _blocking_dependencies(task: Task, done: Dict[str, Task]) -> List[str]:
    """Ids of this task's dependencies that left it with nothing to work from.

    Only a dependency that produced *no artifact at all* blocks: there is
    genuinely no input, and a worker asked to write a document from missing
    research will invent one. A dependency that failed while still producing
    partial material does not block — refusing to run on imperfect input is
    how one unavailable service used to take a whole plan down with it.
    """
    return [
        dep_id
        for dep_id in task.depends_on
        if dep_id in done and done[dep_id].artifact is None
    ]


async def execute_plan(
    tasks: Sequence[Task],
    on_event=None,
    request: str = "",
    conversation: str = "",
    run_id: str = "",
    done_already: Sequence[Task] = (),
) -> List[Task]:
    """Run every task in ``tasks``, honouring dependencies.

    Args:
        tasks: A validated, acyclic plan as produced by
            :func:`nova_a2a.planner.build_plan`.
        on_event: Optional async callback that receives plan/task lifecycle events.
        request: The user's full original message — forwarded to every task so
            a goal that references pasted material ("using the description
            below") has something to actually read. See
            :func:`nova_a2a.worker.run_task`.
        conversation: Recent turns of the chat, so a task phrased as a
            follow-up ("do the same for Friday") can be understood at all.
        run_id: Identifier of the orchestrated turn, stamped on every event so
            a consumer can group them without inferring the boundaries.
        done_already: Tasks completed by an earlier round of this same run.
            Passed when re-executing a repaired plan, so a replanned task can
            still consume the artifacts its dependencies produced first time.

    Returns:
        The tasks in completion order, each in a terminal state. Never raises,
        except for :class:`asyncio.CancelledError`: a stopped run must stop.
    """
    if not tasks:
        return []

    retries = RetryPolicy.from_env()

    async def emit(event: Dict[str, object]) -> None:
        if on_event is None:
            return
        try:
            await on_event({**event, "run_id": run_id} if run_id else event)
        except Exception:
            logger.warning("failed to emit executor event", event=event, exc_info=True)

    # Only the first round announces a plan. A repair round re-enters here with
    # just the replacement tasks, and emitting those as a `plan` would replace
    # the diagram's whole graph with the two tasks being retried — the `replan`
    # event is what announces those, additively.
    if not done_already:
        plan_snapshot = []
        for task in tasks:
            spec = await resolve_skill(task.skill)
            plan_snapshot.append(
                {
                    "id": task.id,
                    "skill": task.skill,
                    "goal": task.goal,
                    "depends_on": list(task.depends_on),
                    "agent": spec.id if spec else None,
                }
            )
        await emit({"type": "plan", "tasks": plan_snapshot})

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    done: Dict[str, Task] = {task.id: task for task in done_already}
    pending: List[Task] = [task.model_copy(deep=True) for task in tasks]
    order: List[Task] = []
    wave_number = 0

    async def run_one(task: Task) -> Task:
        """Resolve the task's agent and execute it, under the concurrency cap.

        Retries only what is worth retrying (see :func:`_is_transient`), and
        announces each retry so the diagram shows a second attempt rather than
        a task that inexplicably restarts.
        """
        spec = await resolve_skill(task.skill)
        if spec is None:
            failed = task.model_copy(deep=True)
            failed.state = TaskState.FAILED
            failed.error = f"no agent provides the skill '{task.skill}'"
            await emit(
                {
                    "type": "task_end",
                    "id": failed.id,
                    "agent": "",
                    "state": "failed",
                    "error": failed.error,
                }
            )
            return failed

        result = task
        for attempt in range(1, retries.max_attempts + 1):
            if attempt > 1:
                delay = retries.delay_for(attempt)
                logger.info(
                    "retrying task",
                    task=task.id,
                    attempt=attempt,
                    of=retries.max_attempts,
                    error=result.error,
                )
                await emit(
                    {
                        "type": "task_retry",
                        "id": task.id,
                        "agent": spec.id,
                        "attempt": attempt,
                        "of": retries.max_attempts,
                        "error": result.error,
                    }
                )
                await asyncio.sleep(delay)

            async with semaphore:
                kwargs = {
                    "spec": spec,
                    "task": task,
                    "context": _dependency_artifacts(task, done),
                    "request": request,
                    "conversation": conversation,
                }
                if on_event is not None:
                    kwargs["on_event"] = on_event
                result = await run_task(**kwargs)

            result.attempts = attempt
            if not _is_transient(result):
                break

        return result

    while pending:
        ready = [
            task
            for task in pending
            if all(dep in done for dep in task.depends_on)
        ]
        if not ready:
            # The planner guarantees an acyclic plan, so this is unreachable in
            # practice — but a silent infinite loop is the one failure mode that
            # would be genuinely hard to diagnose in production.
            logger.error(
                "plan deadlocked, abandoning remaining tasks",
                tasks=[task.id for task in pending],
            )
            for task in pending:
                task.state = TaskState.FAILED
                task.error = "dependencies could not be satisfied"
                order.append(task)
            break

        # Only a task left with no input at all is skipped, and it is marked
        # SKIPPED rather than FAILED: nothing about it is broken, it was never
        # attempted. Anything with partial input still runs.
        blocked = []
        runnable = []
        for task in ready:
            blockers = _blocking_dependencies(task, done)
            if blockers:
                task.state = TaskState.SKIPPED
                task.error = (
                    f"not attempted: {', '.join(blockers)} produced no result to work from"
                )
                blocked.append(task)
                await emit(
                    {
                        "type": "task_end",
                        "id": task.id,
                        "agent": task.assigned_to or "",
                        "state": TaskState.SKIPPED.value,
                        "error": task.error,
                    }
                )
            else:
                runnable.append(task)

        wave_number += 1
        logger.info(
            "executing wave",
            wave=wave_number,
            running=[task.id for task in runnable],
            skipped=[task.id for task in blocked],
        )

        results = list(blocked)
        if runnable:
            try:
                results.extend(await asyncio.gather(*(run_one(task) for task in runnable)))
            except asyncio.CancelledError:
                # The user pressed stop. Everything still in flight or queued
                # is genuinely cancelled, and saying so beats leaving those
                # tasks stuck on "working" in the diagram forever.
                await _cancel_remaining(runnable + pending, done, order, emit)
                logger.info("run cancelled", cancelled=len(pending))
                raise

        for result in results:
            done[result.id] = result
            order.append(result)
        pending = [task for task in pending if task.id not in done]

    completed = sum(1 for task in order if task.state is TaskState.COMPLETED)
    logger.info("plan executed", total=len(order), completed=completed, waves=wave_number)
    return order


async def _cancel_remaining(
    tasks: Sequence[Task],
    done: Dict[str, Task],
    order: List[Task],
    emit,
) -> None:
    """Put every unfinished task into ``CANCELED`` and announce it.

    ``CANCELED`` is the one lifecycle state the protocol defines that NOVA had
    no way of reaching: stopping a run used to cancel the asyncio task and
    leave the UI showing agents that would never report back.
    """
    for task in tasks:
        if task.id in done:
            continue
        task.state = TaskState.CANCELED
        task.error = "cancelled before it finished"
        done[task.id] = task
        order.append(task)
        await emit(
            {
                "type": "task_end",
                "id": task.id,
                "agent": task.assigned_to or "",
                "state": TaskState.CANCELED.value,
                "error": task.error,
            }
        )
