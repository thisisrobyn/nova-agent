"""Advisor agent — reasoning only, no external side effects.

Deliberately toolless. It reads the artifacts its dependencies produced plus
whatever memory the prompt carries, and returns judgement. Having a worker
that cannot touch the outside world is what lets the orchestrator retry it
freely: re-running it can never double-book a meeting or duplicate a file.
"""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="advisor",
    name="Advisor agent",
    description="Turns gathered material into advice, tailored with what NOVA remembers about the user.",
    skills=(
        skill(
            "advice.generate",
            "Give advice",
            "Produce concrete, prioritised recommendations from the material gathered so far.",
            tags=("reasoning", "advice"),
            examples=(
                "Give me advice to walk into this interview prepared",
                "What should I focus on before Thursday's review?",
            ),
        ),
        skill(
            "text.summarise",
            "Summarise",
            "Condense gathered material into a short, ordered summary.",
            tags=("reasoning",),
            examples=("Summarise what you found in three bullets",),
        ),
    ),
    instructions=(
        "You have no tools: work only from the task context and the conversation. "
        "Be specific and prioritised — three things the user can act on beat ten "
        "generalities. If the context does not support a recommendation, leave it out "
        "rather than padding the list."
    ),
)
