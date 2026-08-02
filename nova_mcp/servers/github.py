"""MCP server exposing the user's GitHub account to the agent.

Covers repositories, issues, pull requests and file contents through the
GitHub App connection established from NOVA's connections panel.

Run standalone::

    uv run python -m nova_mcp.servers.github
"""

from __future__ import annotations

import base64
import os
from typing import Any, Dict

import structlog
from fastmcp import FastMCP

from nova_mcp.servers._common import (
    ServiceError,
    bullet_list,
    call_api,
    truncate,
)

logger = structlog.stdlib.get_logger(__name__)

PROVIDER = "github"

_API = "https://api.github.com"
_HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


async def _install_hint() -> str:
    """Explain that the NOVA GitHub App must be installed to see repositories.

    A GitHub App user token only reaches repositories that both the user and
    an *installation* of the app can access — authorizing alone is not enough.
    """
    try:
        from connections.credentials import get_credentials
        from connections.github_app import install_url

        creds = await get_credentials(PROVIDER)
        slug = (creds.extra or {}).get("app_slug") if creds else None
    except Exception:
        slug = None

    location = install_url(str(slug)) if slug else "GitHub → Settings → Applications"
    return (
        "APP_NOT_INSTALLED: The GitHub account is connected, but the NOVA app "
        "is not installed on it, so no repositories are visible. Tell the "
        "user — in their own language — to install the app on their account "
        f"(choosing which repositories to share) at: {location} , and then "
        "try again."
    )


async def _get(url: str, params: Dict[str, Any] | None = None) -> Any:
    return await call_api(PROVIDER, "GET", url, params=params, extra_headers=_HEADERS)


async def _post(url: str, json: Any) -> Any:
    return await call_api(PROVIDER, "POST", url, json=json, extra_headers=_HEADERS)


# ── Repositories ─────────────────────────────────────────────

async def github_list_repositories(max_results: int = 20, sort: str = "updated") -> str:
    """List repositories the connected GitHub account can access.

    Args:
        max_results: How many repositories to return (1-50).
        sort: One of "updated", "created", "pushed" or "full_name".
    """
    try:
        repos = await _get(
            f"{_API}/user/repos",
            params={"per_page": max(1, min(max_results, 50)), "sort": sort},
        )
    except ServiceError as exc:
        # A 403 here almost always means the app has no installation.
        if "PERMISSION_DENIED" in str(exc):
            return await _install_hint()
        return str(exc)

    if not repos:
        # Empty for a real GitHub account usually means the same thing.
        return await _install_hint()

    lines = [
        f"{r.get('full_name', '?')} ({'private' if r.get('private') else 'public'}) — "
        f"{truncate(r.get('description'), 90) or 'no description'} — "
        f"{r.get('language') or 'n/a'} — updated {r.get('updated_at', '?')}"
        for r in (repos or [])
    ]
    return bullet_list(lines, "No repositories found.")


async def github_create_repository(
    name: str, description: str = "", private: bool = True, auto_init: bool = True
) -> str:
    """Create a new repository on the connected GitHub account.

    Args:
        name: Repository name.
        description: Short description.
        private: Whether the repository is private. Defaults to private.
        auto_init: Create an initial commit with a README.
    """
    try:
        repo = await _post(
            f"{_API}/user/repos",
            {
                "name": name,
                "description": description,
                "private": private,
                "auto_init": auto_init,
            },
        )
    except ServiceError as exc:
        return str(exc)

    return f"Repository created: {repo.get('html_url', name)}"


async def github_get_file(repo: str, path: str, ref: str = "") -> str:
    """Read a file from a GitHub repository.

    Args:
        repo: Repository in "owner/name" form.
        path: Path to the file within the repository.
        ref: Optional branch, tag or commit SHA. Defaults to the default branch.
    """
    params = {"ref": ref} if ref else None
    try:
        data = await _get(f"{_API}/repos/{repo}/contents/{path}", params=params)
    except ServiceError as exc:
        return str(exc)

    if isinstance(data, list):
        names = [f"{item.get('name')} ({item.get('type')})" for item in data]
        return bullet_list(names, "Empty directory.")

    content = data.get("content", "")
    if data.get("encoding") == "base64":
        try:
            content = base64.b64decode(content).decode("utf-8", "replace")
        except ValueError:
            return f"'{path}' is not a text file."

    return f"{repo}/{path}:\n\n{truncate(content, 6000)}"


async def github_list_commits(
    repo: str, max_results: int = 10, branch: str = "", path: str = ""
) -> str:
    """List the most recent commits in a GitHub repository.

    Args:
        repo: Repository in "owner/name" form.
        max_results: How many commits to return (1-50).
        branch: Optional branch, tag or SHA. Defaults to the default branch.
        path: Optional file or directory path to filter commits by.
    """
    params: Dict[str, Any] = {"per_page": max(1, min(max_results, 50))}
    if branch:
        params["sha"] = branch
    if path:
        params["path"] = path

    try:
        commits = await _get(f"{_API}/repos/{repo}/commits", params=params)
    except ServiceError as exc:
        return str(exc)

    lines = []
    for item in commits or []:
        commit = item.get("commit", {})
        author = (commit.get("author") or {}).get("name", "?")
        date = (commit.get("author") or {}).get("date", "?")
        message = truncate((commit.get("message") or "").splitlines()[0], 90)
        lines.append(f"{item.get('sha', '')[:7]} {date} — {author} — {message}")

    return bullet_list(lines, f"No commits found in {repo}.")


# ── Issues ───────────────────────────────────────────────────

async def github_list_issues(
    repo: str, state: str = "open", max_results: int = 20, labels: str = ""
) -> str:
    """List issues in a GitHub repository.

    Args:
        repo: Repository in "owner/name" form.
        state: "open", "closed" or "all".
        max_results: How many issues to return (1-50).
        labels: Optional comma-separated label filter.
    """
    params: Dict[str, Any] = {
        "state": state,
        "per_page": max(1, min(max_results, 50)),
    }
    if labels:
        params["labels"] = labels

    try:
        issues = await _get(f"{_API}/repos/{repo}/issues", params=params)
    except ServiceError as exc:
        return str(exc)

    lines = []
    for issue in issues or []:
        # The issues endpoint also returns pull requests; keep them apart.
        if "pull_request" in issue:
            continue
        label_names = ", ".join(label["name"] for label in issue.get("labels", []))
        suffix = f" [{label_names}]" if label_names else ""
        lines.append(
            f"#{issue.get('number')} {issue.get('title', '?')} "
            f"({issue.get('state')}){suffix} — {issue.get('html_url', '')}"
        )
    return bullet_list(lines, f"No {state} issues in {repo}.")


async def github_get_issue(repo: str, issue_number: int) -> str:
    """Read one issue in full, including its description and comments.

    Useful before proposing a plan of action for an issue.

    Args:
        repo: Repository in "owner/name" form.
        issue_number: The issue number (without the leading '#').
    """
    try:
        issue = await _get(f"{_API}/repos/{repo}/issues/{issue_number}")
        comments = await _get(
            f"{_API}/repos/{repo}/issues/{issue_number}/comments",
            params={"per_page": 20},
        )
    except ServiceError as exc:
        return str(exc)

    label_names = ", ".join(label["name"] for label in issue.get("labels", []))
    parts = [
        f"#{issue.get('number')} — {issue.get('title', '?')}",
        f"State: {issue.get('state')} | Author: {(issue.get('user') or {}).get('login', '?')}"
        + (f" | Labels: {label_names}" if label_names else ""),
        f"URL: {issue.get('html_url', '')}",
        "",
        truncate(issue.get("body") or "(no description)", 4000),
    ]

    if comments:
        parts.append("\n--- Comments ---")
        for comment in comments:
            author = (comment.get("user") or {}).get("login", "?")
            parts.append(f"[{author}] {truncate(comment.get('body'), 600)}")

    return "\n".join(parts)


async def github_create_issue(
    repo: str, title: str, body: str = "", labels: str = ""
) -> str:
    """Open a new issue in a GitHub repository.

    Args:
        repo: Repository in "owner/name" form.
        title: Issue title.
        body: Issue description, Markdown allowed.
        labels: Optional comma-separated labels to apply.
    """
    payload: Dict[str, Any] = {"title": title, "body": body}
    if labels:
        payload["labels"] = [label.strip() for label in labels.split(",") if label.strip()]

    try:
        issue = await _post(f"{_API}/repos/{repo}/issues", payload)
    except ServiceError as exc:
        return str(exc)

    return f"Issue #{issue.get('number')} created: {issue.get('html_url', '')}"


async def github_comment_issue(repo: str, issue_number: int, body: str) -> str:
    """Add a comment to an existing issue or pull request.

    Args:
        repo: Repository in "owner/name" form.
        issue_number: Issue or pull request number.
        body: Comment text, Markdown allowed.
    """
    try:
        comment = await _post(
            f"{_API}/repos/{repo}/issues/{issue_number}/comments", {"body": body}
        )
    except ServiceError as exc:
        return str(exc)

    return f"Comment posted: {comment.get('html_url', '')}"


# ── Pull requests ────────────────────────────────────────────

async def github_list_pull_requests(
    repo: str, state: str = "open", max_results: int = 20
) -> str:
    """List pull requests in a GitHub repository.

    Args:
        repo: Repository in "owner/name" form.
        state: "open", "closed" or "all".
        max_results: How many pull requests to return (1-50).
    """
    try:
        pulls = await _get(
            f"{_API}/repos/{repo}/pulls",
            params={"state": state, "per_page": max(1, min(max_results, 50))},
        )
    except ServiceError as exc:
        return str(exc)

    lines = [
        f"#{p.get('number')} {p.get('title', '?')} "
        f"({p.get('head', {}).get('ref', '?')} → {p.get('base', {}).get('ref', '?')}) "
        f"by {(p.get('user') or {}).get('login', '?')} — {p.get('html_url', '')}"
        for p in (pulls or [])
    ]
    return bullet_list(lines, f"No {state} pull requests in {repo}.")


# ── MCP server ───────────────────────────────────────────────

TOOLS = [
    github_list_repositories,
    github_create_repository,
    github_get_file,
    github_list_commits,
    github_list_issues,
    github_get_issue,
    github_create_issue,
    github_comment_issue,
    github_list_pull_requests,
]

mcp = FastMCP(
    name="nova-github",
    instructions=(
        "Repositories, issues and pull requests for the GitHub account "
        "connected to NOVA."
    ),
)

for _fn in TOOLS:
    mcp.tool()(_fn)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    logger.info("starting NOVA GitHub MCP server", transport=transport)
    mcp.run(transport="sse" if transport == "http" else "stdio")
