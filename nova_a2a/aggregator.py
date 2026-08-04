"""Synthesis — merging the workers' artifacts into one answer.

The last hop of the orchestrator. It reconciles what the agents produced and
decides whether the original request was actually satisfied; a task that failed
is reported as such, in the user's own language, rather than papered over.

This node has no tools on purpose. Everything that could act has already acted,
and giving the merger the ability to act again is how duplicate calendar events
get created.
"""

from __future__ import annotations

from typing import Callable, Dict, Optional, Sequence

import structlog

from nova_a2a._content import content_to_text
from nova_a2a._tokens import usage_from_message
from nova_a2a.models import Task, TaskState

logger = structlog.stdlib.get_logger(__name__)

_AGGREGATOR_PROMPT = (
    "You are NOVA. Several specialised agents have just worked on the user's "
    "request in parallel. Write the single reply the user will read.\n\n"
    "## Rules\n"
    "- Reply in the same language as the user's request. This overrides "
    "everything else, including the language the agents reported in.\n"
    "- Present the results in the order the user asked for them, not the order "
    "the agents finished in.\n"
    "- Report the results themselves. Never mention agents, tasks, skills, "
    "orchestration or any internal machinery — from the user's side, you did "
    "this.\n"
    "- If something failed, say plainly what could not be done and why, in one "
    "short sentence. Never invent a result to fill the gap, and never claim "
    "something was done when it failed.\n"
    "- Answer with everything that DID work, even when part of the request "
    "failed. A partial answer plus an honest note about the gap is far more "
    "useful than refusing to answer at all.\n"
    "- Material marked PARTIAL is real and worth reporting; say that it is "
    "incomplete. Something marked NOT ATTEMPTED never ran — do not describe it "
    "as having failed.\n"
    "- Keep links and identifiers exactly as the agents returned them.\n"
    "- Be concise. Do not restate the request back at the user.\n\n"
    "## The user's request\n{request}\n\n"
    "## What the agents produced\n{results}"
)


def _render(tasks: Sequence[Task]) -> str:
    """Render every task's outcome for the merge prompt.

    Three outcomes, not two. A task that failed while producing partial
    material is not the same as one that produced nothing, and neither is the
    same as one that was never attempted — collapsing them into "FAILED" threw
    away usable results and told the user a task had broken when it had simply
    never run.
    """
    blocks = []
    for task in tasks:
        if task.state is TaskState.COMPLETED and task.artifact:
            blocks.append(f"### {task.goal}\nRESULT:\n{task.artifact.text}")
        elif task.artifact and task.artifact.partial:
            blocks.append(
                f"### {task.goal}\nPARTIAL — did not finish ({task.error or 'unknown reason'}), "
                f"but produced:\n{task.artifact.text}"
            )
        elif task.state is TaskState.SKIPPED:
            blocks.append(f"### {task.goal}\nNOT ATTEMPTED: {task.error or 'no input available'}")
        else:
            reason = task.error or "no result"
            blocks.append(f"### {task.goal}\nFAILED: {reason}")
    return "\n\n".join(blocks)


def _fallback_answer(tasks: Sequence[Task]) -> str:
    """Assemble an answer without the LLM.

    Used when the merge call itself fails. The work is already done and its
    results are in hand — losing them to a failed synthesis call would be the
    worst possible outcome, so they are concatenated verbatim instead.
    """
    parts = []
    for task in tasks:
        if task.artifact and task.artifact.text.strip():
            parts.append(task.artifact.text.strip())
    if not parts:
        return (
            "I could not complete the request. None of the steps I attempted "
            "finished successfully."
        )
    return "\n\n".join(parts)


async def synthesise(
    request: str,
    tasks: Sequence[Task],
    config: dict | None = None,
    on_usage: Optional[Callable[[Dict[str, int]], None]] = None,
) -> str:
    """Merge the executed plan into the reply the user sees.

    Args:
        request: The user's original message.
        tasks: Every task from the executed plan, in terminal states.
        config: LangGraph runtime config, forwarded to the LLM for token streaming.
        on_usage: Called with this call's token usage, when the provider
            reports any. The merge is a full LLM call on top of the workers',
            so leaving it out under-reports the turn.

    Returns:
        The final answer. Never raises and never returns an empty string.
    """
    if not tasks:
        return _fallback_answer(tasks)

    completed = sum(1 for task in tasks if task.state is TaskState.COMPLETED)
    logger.info("synthesising answer", tasks=len(tasks), completed=completed)

    from agent.llm import get_llm

    llm = get_llm()
    if llm is None:
        return _fallback_answer(tasks)

    prompt = _AGGREGATOR_PROMPT.format(request=request, results=_render(tasks))
    try:
        response = await llm.ainvoke(prompt, config=config)
        answer = content_to_text(getattr(response, "content", "")).strip()
        if on_usage is not None:
            usage = usage_from_message(response)
            if usage:
                on_usage(usage)
    except Exception as exc:
        logger.warning("synthesis failed, returning raw results", error=str(exc))
        return _fallback_answer(tasks)

    return answer or _fallback_answer(tasks)
