"""Tests for GitHub Projects V2 roadmap parsing."""

from __future__ import annotations

from typing import Any, Dict

from api.github_roadmap import iteration_end_date, parse_project


def _iteration_field(*iterations: Dict[str, Any], completed: Any = None) -> Dict[str, Any]:
    return {
        "configuration": {
            "iterations": list(iterations),
            "completedIterations": list(completed or []),
        }
    }


def _item(title: str, number: int, field_values: list[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "fieldValues": {"nodes": field_values},
        "content": {
            "title": title,
            "number": number,
            "url": f"https://github.com/o/r/issues/{number}",
            "state": "OPEN",
            "labels": {"nodes": []},
        },
    }


def _project(fields: list[Dict[str, Any]], items: list[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "title": "NOVA",
        "shortDescription": None,
        "url": "https://github.com/users/o/projects/3",
        "fields": {"nodes": fields},
        "items": {"nodes": items},
    }


class TestIterationEndDate:
    """The end date is inclusive: start + duration - 1."""

    def test_quarter_ends_on_last_day(self) -> None:
        assert iteration_end_date("2026-07-01", 92) == "2026-09-30"

    def test_partial_quarter(self) -> None:
        assert iteration_end_date("2026-05-10", 52) == "2026-06-30"

    def test_missing_inputs_return_none(self) -> None:
        assert iteration_end_date(None, 92) is None
        assert iteration_end_date("2026-07-01", None) is None

    def test_invalid_date_returns_none(self) -> None:
        assert iteration_end_date("not-a-date", 92) is None


class TestParseProject:
    """Items carrying an iteration value must never land in the backlog."""

    def test_items_are_grouped_into_their_iteration(self) -> None:
        project = _project(
            fields=[
                _iteration_field({"id": "q3", "title": "Q3", "startDate": "2026-07-01", "duration": 92})
            ],
            items=[
                _item(
                    "Voice",
                    11,
                    [
                        {"name": "Ready", "field": {"name": "Status"}},
                        {
                            "title": "Q3",
                            "startDate": "2026-07-01",
                            "duration": 92,
                            "iterationId": "q3",
                            "field": {"name": "Iteration"},
                        },
                    ],
                )
            ],
        )

        roadmap = parse_project(project)

        assert roadmap.backlog == []
        assert len(roadmap.iterations) == 1
        assert roadmap.iterations[0].title == "Q3"
        assert roadmap.iterations[0].end_date == "2026-09-30"
        assert [i.number for i in roadmap.iterations[0].items] == [11]
        assert roadmap.iterations[0].items[0].status == "Ready"

    def test_renamed_iteration_field_is_still_detected(self) -> None:
        """Boards may rename "Iteration" to "Sprint", "Quarter", etc."""
        project = _project(
            fields=[
                _iteration_field({"id": "q3", "title": "Q3", "startDate": "2026-07-01", "duration": 92})
            ],
            items=[
                _item(
                    "MCP",
                    9,
                    [
                        {
                            "title": "Q3",
                            "startDate": "2026-07-01",
                            "duration": 92,
                            "iterationId": "q3",
                            "field": {"name": "Quarter"},
                        }
                    ],
                )
            ],
        )

        roadmap = parse_project(project)

        assert roadmap.backlog == []
        assert [i.number for i in roadmap.iterations[0].items] == [9]

    def test_unknown_iteration_id_is_rebuilt_from_the_item(self) -> None:
        """An iteration missing from the field config must not lose its items."""
        project = _project(
            fields=[_iteration_field()],
            items=[
                _item(
                    "Landing",
                    5,
                    [
                        {
                            "title": "Q2",
                            "startDate": "2026-05-10",
                            "duration": 52,
                            "iterationId": "q2",
                            "field": {"name": "Iteration"},
                        }
                    ],
                )
            ],
        )

        roadmap = parse_project(project)

        assert roadmap.backlog == []
        assert len(roadmap.iterations) == 1
        assert roadmap.iterations[0].title == "Q2"
        assert roadmap.iterations[0].end_date == "2026-06-30"

    def test_completed_iterations_are_included(self) -> None:
        project = _project(
            fields=[
                _iteration_field(
                    {"id": "q3", "title": "Q3", "startDate": "2026-07-01", "duration": 92},
                    completed=[
                        {"id": "q2", "title": "Q2", "startDate": "2026-05-10", "duration": 52}
                    ],
                )
            ],
            items=[],
        )

        roadmap = parse_project(project)

        # Sorted by start date: the completed Q2 comes first.
        assert [it.title for it in roadmap.iterations] == ["Q2", "Q3"]

    def test_item_without_iteration_goes_to_backlog(self) -> None:
        project = _project(
            fields=[_iteration_field()],
            items=[_item("Loose", 42, [{"name": "Backlog", "field": {"name": "Status"}}])],
        )

        roadmap = parse_project(project)

        assert roadmap.iterations == []
        assert [i.number for i in roadmap.backlog] == [42]

    def test_null_nodes_are_ignored(self) -> None:
        """GraphQL returns empty objects for unmatched union members."""
        project = _project(
            fields=[{}, None, _iteration_field()],
            items=[None, _item("Loose", 1, [None, {}])],
        )

        roadmap = parse_project(project)

        assert [i.number for i in roadmap.backlog] == [1]
