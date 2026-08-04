"""Task decomposition — the supervisor's only job.

Turns one user message into a small dependency graph of tasks. The supervisor
never calls a tool itself: separating *deciding* from *doing* is what keeps
each worker's prompt small, and it means a bad plan fails before anything has
touched the user's calendar.

An empty plan is a valid, common answer. "What time is it?" does not need four
agents, and neither does a follow-up question about the previous reply — the
orchestrator falls back to the ordinary single-agent graph in that case, which
is both cheaper and the behaviour NOVA already had.
"""

from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Sequence

import structlog

from nova_a2a.agents import AgentSpec
from nova_a2a.models import Plan, Task, TaskSpec, TaskState

logger = structlog.stdlib.get_logger(__name__)

#: Upper bound on plan size. A request that genuinely needs more than this is
#: better served by asking the user to split it than by a run nobody can follow.
MAX_TASKS = 8

_PLANNER_PROMPT = """You are the orchestrator of NOVA, a multi-agent system.

Break the user's request into the smallest set of independent tasks that
covers it, and assign each one a skill from the catalogue below.

## Skill catalogue
{catalogue}

## Rules
- Use ONLY skill ids from the catalogue. Never invent one.
- One task per distinct job. Do not split a single job into steps.
- Set `depends_on` only when a task genuinely needs another task's OUTPUT.
  Tasks that merely happen to be related must stay independent so they can run
  in parallel.
- Return an EMPTY task list if the request is conversational, trivial, a
  follow-up to the previous reply, or if no catalogue skill fits it.
- Never invent work the user did not ask for.
- The conversation so far is context, not work. Plan only what the LATEST
  request asks for — but resolve it against that context: "do the same for
  Friday" means repeating the previous request with a new date.

## Example
Request: "Book a meeting with Ana on Thursday, and find out what our main
competitors announced this month so I can prepare."
Tasks:
  T1 calendar.schedule  "Book a meeting with Ana on Thursday"          depends_on: []
  T2 web.research       "Find competitor announcements from this month" depends_on: []
  T3 advice.generate    "Prepare talking points for the meeting"        depends_on: [T2]
{conversation}
## User request
{request}
"""

_CONVERSATION_TEMPLATE = "\n## The conversation so far\n{conversation}\n"


_REPAIR_PROMPT = """You are the orchestrator of NOVA, a multi-agent system.

Some tasks in the plan you built have FAILED. Decide whether any of them can be
retried differently — a narrower goal, a different skill — and emit ONLY the
replacement tasks.

## Skill catalogue
{catalogue}

## What failed
{failures}

## What already succeeded (do not repeat this work)
{succeeded}

## Rules
- Emit a replacement ONLY when a different approach could plausibly work. If a
  failure is permanent — no account connected, no skill fits, the information
  does not exist — emit NOTHING for it. A wrong second attempt costs the user
  the same time as the first and ends the same way.
- Never re-emit work listed as already succeeded.
- Give every replacement a NEW id, and set `depends_on` to [] unless it truly
  needs another replacement's output.
- Returning an empty list is the correct answer whenever nothing is worth
  retrying differently.

## The user's original request
{request}
"""


def _catalogue(agents: Sequence[AgentSpec]) -> str:
    """Render the available skills for the planner prompt."""
    lines: List[str] = []
    for spec in agents:
        for skill in spec.skills:
            line = f"- {skill.id}: {skill.description}"
            if skill.examples:
                line += f' (e.g. "{skill.examples[0]}")'
            lines.append(line)
    return "\n".join(lines)


def _sanitise(specs: Iterable[TaskSpec], is_valid_skill: Callable[[str], bool]) -> List[Task]:
    """Turn raw model output into a plan that is safe to execute.

    Small models produce plausible-looking graphs with real defects: repeated
    ids, dependencies on tasks that were never emitted, and — the one that
    actually hangs the executor — cycles. Everything is repaired or dropped
    here so the wave executor downstream can assume a well-formed DAG.
    """
    # Pass 1: unique ids, known skills, plan size cap.
    kept: List[TaskSpec] = []
    seen: set[str] = set()
    for spec in specs:
        task_id = (spec.id or "").strip()
        if not task_id or task_id in seen:
            logger.warning("planner emitted a duplicate or empty task id", task=spec.id)
            continue
        if not is_valid_skill(spec.skill):
            logger.warning("planner emitted an unknown skill", skill=spec.skill, task=task_id)
            continue
        if not (spec.goal or "").strip():
            logger.warning("planner emitted a task with no goal", task=task_id)
            continue
        seen.add(task_id)
        kept.append(spec)
        if len(kept) >= MAX_TASKS:
            logger.warning("plan truncated", limit=MAX_TASKS)
            break

    # Pass 2: drop dependencies on tasks that did not survive.
    for spec in kept:
        spec.depends_on = [dep for dep in spec.depends_on if dep in seen and dep != spec.id]

    # Pass 3: break cycles. Repeatedly take whatever is schedulable; if a round
    # produces nothing, the remainder is cyclic, so the cheapest correct repair
    # is to cut its dependencies and let those tasks run first.
    ordered: List[TaskSpec] = []
    resolved: set[str] = set()
    pending = list(kept)
    while pending:
        ready = [s for s in pending if all(dep in resolved for dep in s.depends_on)]
        if not ready:
            logger.warning(
                "planner produced a dependency cycle, cutting it",
                tasks=[s.id for s in pending],
            )
            for spec in pending:
                spec.depends_on = []
            ready = pending
        for spec in ready:
            ordered.append(spec)
            resolved.add(spec.id)
        pending = [s for s in pending if s.id not in resolved]

    return [
        Task(id=s.id, skill=s.skill, goal=s.goal.strip(), depends_on=list(s.depends_on))
        for s in ordered
    ]


async def build_plan(
    request: str,
    agents: Sequence[AgentSpec],
    conversation: str = "",
) -> List[Task]:
    """Decompose ``request`` into tasks the available agents can carry out.

    Args:
        request: The user's message.
        agents: The agents that can actually act right now.
        conversation: Compact transcript of the previous turns. Without it a
            follow-up ("and the same for Friday") names no skill and no
            subject, so it could only ever be planned as nothing.

    Returns:
        A validated, acyclic list of tasks in dependency order. Empty when the
        request does not warrant orchestration, when no agent is available, or
        when the model could not produce usable structured output — all three
        mean "fall back to the single-agent graph".
    """
    if not agents:
        logger.info("no agents available, skipping planning")
        return []

    from agent.llm import get_llm

    llm = get_llm()
    if llm is None:
        logger.warning("no LLM configured, skipping planning")
        return []

    valid_skills = {skill_id for spec in agents for skill_id in spec.skill_ids}
    namespaces = {skill_id.split(".", 1)[0] for skill_id in valid_skills}

    def is_valid_skill(skill_id: str) -> bool:
        # Accept a namespace match too — the registry resolves those, and
        # rejecting `calendar.create` when `calendar.schedule` exists throws
        # away a plan that was essentially right.
        skill_id = (skill_id or "").strip()
        return skill_id in valid_skills or skill_id.split(".", 1)[0] in namespaces

    prompt = _PLANNER_PROMPT.format(
        catalogue=_catalogue(agents),
        request=request,
        conversation=(
            _CONVERSATION_TEMPLATE.format(conversation=conversation) if conversation.strip() else ""
        ),
    )

    try:
        planner = llm.with_structured_output(Plan)
        plan = await planner.ainvoke(prompt)
    except Exception as exc:
        # Structured output is the fragile step on a small local model. Falling
        # back to the single-agent graph keeps NOVA working exactly as before
        # rather than failing the user's request outright.
        logger.warning("planning failed, falling back to single agent", error=str(exc))
        return []

    if plan is None or not getattr(plan, "tasks", None):
        logger.info("planner returned no tasks")
        return []

    tasks = _sanitise(plan.tasks, is_valid_skill)
    logger.info(
        "plan built",
        tasks=len(tasks),
        skills=[task.skill for task in tasks],
    )
    return tasks


async def repair_plan(
    request: str,
    results: Sequence[Task],
    agents: Sequence[AgentSpec],
) -> List[Task]:
    """Propose replacement tasks for the ones that failed.

    The counterpart to a blind retry: the executor re-runs a task *as written*
    when the failure looks like a flake, and this is what handles the other
    kind — the task that failed because it was the wrong task. The planner sees
    the error text and can narrow the goal or route it to a different skill.

    Args:
        request: The user's original message.
        results: Every task from the round that just ran, in terminal states.
        agents: The agents that can act right now.

    Returns:
        New tasks to execute, each tagged with the task it repairs. Empty
        whenever nothing is worth another approach — the common, correct
        answer, and the one that keeps a failing run from looping.
    """
    # Skipped work counts as unachieved: repairing the task that broke is only
    # half a repair if the tasks waiting on it stay unattempted forever.
    failed = [
        task
        for task in results
        if task.state in (TaskState.FAILED, TaskState.SKIPPED)
    ]
    succeeded = [task for task in results if task.state is TaskState.COMPLETED]
    if not failed or not agents:
        return []

    from agent.llm import get_llm

    llm = get_llm()
    if llm is None:
        return []

    valid_skills = {skill_id for spec in agents for skill_id in spec.skill_ids}
    namespaces = {skill_id.split(".", 1)[0] for skill_id in valid_skills}
    used_ids = {task.id for task in results}

    def is_valid_skill(skill_id: str) -> bool:
        skill_id = (skill_id or "").strip()
        return skill_id in valid_skills or skill_id.split(".", 1)[0] in namespaces

    prompt = _REPAIR_PROMPT.format(
        catalogue=_catalogue(agents),
        failures="\n".join(
            f"- {t.id} ({t.skill}) “{t.goal}” — "
            f"{'NEVER RAN: ' if t.state is TaskState.SKIPPED else ''}{t.error}"
            for t in failed
        ),
        succeeded="\n".join(f"- {t.goal}" for t in succeeded) or "(nothing)",
        request=request,
    )

    try:
        planner = llm.with_structured_output(Plan)
        plan = await planner.ainvoke(prompt)
    except Exception as exc:
        logger.warning("replanning failed, keeping the original failures", error=str(exc))
        return []

    if plan is None or not getattr(plan, "tasks", None):
        logger.info("planner had nothing worth retrying")
        return []

    repairs = _sanitise(plan.tasks, is_valid_skill)

    # A replacement that reuses an id would overwrite the very result it is
    # meant to replace, so ids are rewritten and dependencies follow them.
    remapped: Dict[str, str] = {}
    for task in repairs:
        if task.id in used_ids:
            remapped[task.id] = f"{task.id}r"
        used_ids.add(remapped.get(task.id, task.id))
    for task in repairs:
        task.id = remapped.get(task.id, task.id)
        task.depends_on = [remapped.get(dep, dep) for dep in task.depends_on]

    # Attribute each replacement to something that actually failed, so the UI
    # can show "retrying T2 differently" rather than a task appearing from
    # nowhere halfway through a run.
    for index, task in enumerate(repairs):
        task.repairs = failed[min(index, len(failed) - 1)].id

    logger.info("repair plan built", tasks=len(repairs), replacing=[t.repairs for t in repairs])
    return repairs
