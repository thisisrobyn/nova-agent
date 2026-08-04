"""GitHub agent — repositories, issues and pull requests.

The tools existed long before this agent did: they are bound into the
single-agent graph by :mod:`nova_mcp.builtin`. What was missing was a spec
listing them, and without one the orchestrator could never reach them — a
worker only ever sees the tools its own :attr:`~AgentSpec.tool_names` names,
and the planner is only offered skills that some agent advertises.
"""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="github",
    name="GitHub agent",
    description="Reads and acts on the repositories, issues and pull requests of the user's GitHub account.",
    skills=(
        skill(
            "github.repos",
            "Browse repositories",
            "List the user's repositories, read a file from one, or create a new repository.",
            tags=("github", "code", "repositories"),
            examples=(
                "What repositories did I touch most recently?",
                "Show me the README of nova-agent",
            ),
        ),
        skill(
            "github.issues",
            "Work with issues",
            "List, read, open or comment on issues in a repository.",
            tags=("github", "issues"),
            examples=(
                "Open an issue in nova-agent about the failing A2A tests",
                "What issues are still open on my thesis repo?",
            ),
        ),
        skill(
            "github.activity",
            "Review activity",
            "Read recent commits and the open pull requests of a repository.",
            tags=("github", "commits", "pull-requests"),
            examples=(
                "Summarise this week's commits on the main branch",
                "Which pull requests are waiting on me?",
            ),
        ),
    ),
    tool_names=(
        "github_list_repositories",
        "github_create_repository",
        "github_get_file",
        "github_list_commits",
        "github_list_issues",
        "github_get_issue",
        "github_create_issue",
        "github_comment_issue",
        "github_list_pull_requests",
    ),
    requires_any=("github",),
    instructions=(
        "Every tool takes the repository as 'owner/name'. If the task names a "
        "repository without its owner, look it up with github_list_repositories "
        "first rather than guessing an owner. Read before you write: check the "
        "existing issues before opening one, so you comment on the issue that is "
        "already there instead of filing a duplicate. Never create a repository "
        "or an issue that the task did not explicitly ask for — those are visible "
        "to other people and cannot be quietly undone. Report the links the tools "
        "return so the user reaches the result in one click."
    ),
)
