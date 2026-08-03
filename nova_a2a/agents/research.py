"""Research agent — gathers information and returns it structured.

The one worker that needs no connected account, which makes it the natural
first agent to exercise when bringing the orchestrator up.
"""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="research",
    name="Research agent",
    description="Searches the web and the user's knowledge base, and returns findings with sources.",
    skills=(
        skill(
            "web.research",
            "Research a topic",
            "Search the web for current information and summarise the findings with sources.",
            tags=("search", "web"),
            examples=(
                "Key points of the Agentic Engineer role",
                "What changed in the latest LangGraph release?",
            ),
        ),
        skill(
            "knowledge.search",
            "Search uploaded documents",
            "Retrieve relevant passages from the user's own uploaded documents.",
            tags=("rag", "documents"),
            examples=("What does my thesis draft say about orchestration?",),
        ),
    ),
    tool_names=("web_search", "rag_search"),
    instructions=(
        "Return findings as a short list of concrete points, each with its source "
        "URL where one exists. Do not write an essay: the agents downstream consume "
        "this output directly, so structure beats prose. If a search returns nothing "
        "usable, say so plainly instead of filling the gap from memory."
    ),
)
