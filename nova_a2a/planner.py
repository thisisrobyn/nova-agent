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

from typing import Callable, Iterable, List, Sequence

import structlog

from nova_a2a.agents import AgentSpec
from nova_a2a.models import Plan, Task, TaskSpec

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

## Example
Request: "Book a meeting with Ana on Thursday, and find out what our main
competitors announced this month so I can prepare."
Tasks:
  T1 calendar.schedule  "Book a meeting with Ana on Thursday"          depends_on: []
  T2 web.research       "Find competitor announcements from this month" depends_on: []
  T3 advice.generate    "Prepare talking points for the meeting"        depends_on: [T2]

## User request
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


async def build_plan(request: str, agents: Sequence[AgentSpec]) -> List[Task]:
    """Decompose ``request`` into tasks the available agents can carry out.

    Args:
        request: The user's message.
        agents: The agents that can actually act right now.

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

    prompt = _PLANNER_PROMPT.format(catalogue=_catalogue(agents), request=request)

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
