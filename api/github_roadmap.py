"""GitHub Projects V2 roadmap fetching and parsing.

Shared by the REST endpoint (``api.routes``) and the build-time snapshot
script (``scripts/fetch_roadmap.py``) so both produce byte-identical payloads.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import httpx
import structlog

from api.schemas import (
    RoadmapIssue,
    RoadmapIteration,
    RoadmapLabel,
    RoadmapResponse,
)

logger = structlog.get_logger(__name__)

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

# ``fieldValues`` must be large enough to cover every configured field on the
# board: GitHub returns them in an arbitrary order, so a low page size can
# silently truncate the Iteration value and drop items into the backlog.
PROJECT_QUERY = """
query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      title
      shortDescription
      url
      fields(first: 50) {
        nodes {
          ... on ProjectV2IterationField {
            id
            name
            configuration {
              iterations { id title startDate duration }
              completedIterations { id title startDate duration }
            }
          }
        }
      }
      items(first: 100) {
        nodes {
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
              ... on ProjectV2ItemFieldIterationValue {
                title
                startDate
                duration
                iterationId
                field { ... on ProjectV2IterationField { name } }
              }
            }
          }
          content {
            ... on Issue {
              title
              number
              url
              state
              labels(first: 10) {
                nodes { name color }
              }
            }
            ... on DraftIssue {
              title
            }
          }
        }
      }
    }
  }
}
"""


class RoadmapError(RuntimeError):
    """Raised when the roadmap cannot be fetched from GitHub."""


def get_roadmap_config() -> tuple[str, str, int]:
    """Read roadmap settings from the environment.

    Returns:
        Tuple of ``(token, owner, project_number)``.
    """
    token = os.getenv("GITHUB_TOKEN", "")
    owner = os.getenv("GITHUB_PROJECT_OWNER", "thisisrobyn")
    number = int(os.getenv("GITHUB_PROJECT_NUMBER", "3"))
    return token, owner, number


def iteration_end_date(start_date: Optional[str], duration: Optional[int]) -> Optional[str]:
    """Compute the inclusive last day of an iteration.

    GitHub models an iteration as a start day plus a duration in days, so an
    iteration starting 2026-07-01 with duration 92 ends on 2026-09-30 — not
    2026-10-01, which is the first day of the next one.

    Args:
        start_date: ISO ``YYYY-MM-DD`` start day, or ``None``.
        duration: Length in days, or ``None``.

    Returns:
        ISO ``YYYY-MM-DD`` end day, or ``None`` if it cannot be computed.
    """
    if not start_date or not duration:
        return None
    try:
        start = date.fromisoformat(start_date)
    except ValueError:
        logger.warning("roadmap.invalid_start_date", start_date=start_date)
        return None
    return (start + timedelta(days=duration - 1)).isoformat()


def _build_iteration(
    iteration_id: str,
    title: str,
    start_date: Optional[str],
    duration: Optional[int],
) -> RoadmapIteration:
    """Create a :class:`RoadmapIteration` with its end date resolved."""
    return RoadmapIteration(
        id=iteration_id,
        title=title,
        start_date=start_date,
        duration=duration,
        end_date=iteration_end_date(start_date, duration),
    )


def parse_project(project: Dict[str, Any]) -> RoadmapResponse:
    """Turn a raw ``projectV2`` GraphQL payload into a :class:`RoadmapResponse`.

    Args:
        project: The ``data.user.projectV2`` object from the GraphQL response.

    Returns:
        The parsed roadmap, with items grouped into their iterations.
    """
    iteration_map: Dict[str, RoadmapIteration] = {}

    for field in project.get("fields", {}).get("nodes") or []:
        if not field:
            continue
        cfg = field.get("configuration")
        if not cfg:
            continue
        for it in (cfg.get("iterations") or []) + (cfg.get("completedIterations") or []):
            iteration_map[it["id"]] = _build_iteration(
                it["id"], it.get("title", ""), it.get("startDate"), it.get("duration")
            )

    backlog: List[RoadmapIssue] = []

    for item in project.get("items", {}).get("nodes") or []:
        if not item:
            continue
        content = item.get("content") or {}
        if not content.get("title"):
            continue

        labels = [
            RoadmapLabel(name=label["name"], color=label["color"])
            for label in ((content.get("labels") or {}).get("nodes") or [])
        ]

        status: Optional[str] = None
        priority: Optional[str] = None
        size: Optional[str] = None
        iteration_value: Optional[Dict[str, Any]] = None

        for value in (item.get("fieldValues") or {}).get("nodes") or []:
            if not value:
                continue
            # Iteration values are identified by their payload rather than by
            # the field's name: boards are free to rename "Iteration" to
            # "Sprint", "Quarter", etc.
            if value.get("iterationId"):
                iteration_value = value
                continue
            field_name = (value.get("field") or {}).get("name", "")
            if field_name == "Status":
                status = value.get("name")
            elif field_name == "Priority":
                priority = value.get("name")
            elif field_name == "Size":
                size = value.get("name")

        issue = RoadmapIssue(
            title=content.get("title", ""),
            number=content.get("number"),
            url=content.get("url"),
            state=content.get("state"),
            status=status,
            priority=priority,
            size=size,
            labels=labels,
        )

        if not iteration_value:
            backlog.append(issue)
            continue

        iteration_id = iteration_value["iterationId"]
        if iteration_id not in iteration_map:
            # The item references an iteration the field configuration no
            # longer lists. Rebuild it from the value itself instead of
            # silently demoting the item to the backlog.
            iteration_map[iteration_id] = _build_iteration(
                iteration_id,
                iteration_value.get("title", ""),
                iteration_value.get("startDate"),
                iteration_value.get("duration"),
            )
            logger.info("roadmap.orphan_iteration", iteration_id=iteration_id)

        iteration_map[iteration_id].items.append(issue)

    sorted_iterations = sorted(
        iteration_map.values(), key=lambda it: (it.start_date or "", it.title)
    )

    return RoadmapResponse(
        project_title=project.get("title", ""),
        project_description=project.get("shortDescription"),
        project_url=project.get("url", ""),
        iterations=sorted_iterations,
        backlog=backlog,
    )


async def fetch_roadmap(token: str, owner: str, number: int) -> RoadmapResponse:
    """Fetch and parse the roadmap from the GitHub GraphQL API.

    Args:
        token: GitHub token with the ``read:project`` scope.
        owner: Login of the user owning the project.
        number: Project number.

    Returns:
        The parsed roadmap.

    Raises:
        RoadmapError: If GitHub rejects the request or returns GraphQL errors.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            GITHUB_GRAPHQL_URL,
            json={"query": PROJECT_QUERY, "variables": {"owner": owner, "number": number}},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        logger.error("roadmap.http_error", status_code=resp.status_code)
        raise RoadmapError(f"GitHub API request failed ({resp.status_code})")

    data = resp.json()
    if "errors" in data:
        message = data["errors"][0].get("message", "GitHub GraphQL error")
        logger.error("roadmap.graphql_error", message=message)
        raise RoadmapError(message)

    project = ((data.get("data") or {}).get("user") or {}).get("projectV2")
    if not project:
        raise RoadmapError(f"Project {owner}/{number} not found or not accessible")

    return parse_project(project)
