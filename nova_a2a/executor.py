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

from nova_a2a.models import Artifact, Task, TaskState
from nova_a2a.registry import resolve_skill
from nova_a2a.worker import run_task

logger = structlog.stdlib.get_logger(__name__)

#: Ceiling on concurrent workers. Every task is at least one LLM call, and a
#: local Ollama server serialises requests anyway — letting eight fan out at
#: once would only build a queue and blow the memory budget.
MAX_CONCURRENCY = 4


def _dependency_artifacts(task: Task, done: Dict[str, Task]) -> List[Artifact]:
    """Collect the artifacts this task's dependencies produced."""
    artifacts = []
    for dep_id in task.depends_on:
        finished = done.get(dep_id)
        if finished and finished.artifact:
            artifacts.append(finished.artifact)
    return artifacts


def _blocking_dependencies(task: Task, done: Dict[str, Task]) -> List[str]:
    """Ids of this task's dependencies that did not complete successfully."""
    return [
        dep_id
        for dep_id in task.depends_on
        if dep_id in done and done[dep_id].state is not TaskState.COMPLETED
    ]


async def execute_plan(tasks: Sequence[Task], on_event=None) -> List[Task]:
    """Run every task in ``tasks``, honouring dependencies.

    Args:
        tasks: A validated, acyclic plan as produced by
            :func:`nova_a2a.planner.build_plan`.
        on_event: Optional async callback that receives plan/task lifecycle events.

    Returns:
        The tasks in completion order, each in a terminal state. Never raises.
    """
    if not tasks:
        return []

    async def emit(event: Dict[str, object]) -> None:
        if on_event is None:
            return
        try:
            await on_event(event)
        except Exception:
            logger.warning("failed to emit executor event", event=event, exc_info=True)

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
    done: Dict[str, Task] = {}
    pending: List[Task] = [task.model_copy(deep=True) for task in tasks]
    order: List[Task] = []
    wave_number = 0

    async def run_one(task: Task) -> Task:
        """Resolve the task's agent and execute it, under the concurrency cap."""
        spec = await resolve_skill(task.skill)
        if spec is None:
            failed = task.model_copy(deep=True)
            failed.state = TaskState.FAILED
            failed.error = f"no agent provides the skill '{task.skill}'"
            return failed

        async with semaphore:
            kwargs = {
                "spec": spec,
                "task": task,
                "context": _dependency_artifacts(task, done),
            }
            if on_event is not None:
                kwargs["on_event"] = on_event
            return await run_task(**kwargs)

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

        # Tasks whose dependencies failed never run: their input does not
        # exist, and a worker asked to write a document from missing research
        # will confabulate one.
        blocked = []
        runnable = []
        for task in ready:
            blockers = _blocking_dependencies(task, done)
            if blockers:
                task.state = TaskState.FAILED
                task.error = f"skipped: {', '.join(blockers)} did not complete"
                blocked.append(task)
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
            results.extend(await asyncio.gather(*(run_one(task) for task in runnable)))

        for result in results:
            done[result.id] = result
            order.append(result)
        pending = [task for task in pending if task.id not in done]

    completed = sum(1 for task in order if task.state is TaskState.COMPLETED)
    logger.info("plan executed", total=len(order), completed=completed, waves=wave_number)
    return order
