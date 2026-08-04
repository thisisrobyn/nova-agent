"""Tests for the DuckDuckGo fallback in tools/web_search.py.

Regression coverage for a real break: ``duckduckgo_search`` 8.x dropped its
``AsyncDDGS`` client, and the tool's async wrapper called it unconditionally,
so every search failed with an ImportError once the dependency updated — with
no API key for Tavily, that took down web search entirely.
"""

from __future__ import annotations

import pytest

from tools import web_search


@pytest.mark.asyncio
async def test_duckduckgo_search_returns_formatted_results(monkeypatch):
    def fake_ddgs_text(query, max_results):
        assert query == "agentic engineer"
        return [{"title": "A", "href": "https://a.example", "body": "about agentic engineers"}]

    monkeypatch.setattr(web_search, "_ddgs_text", fake_ddgs_text)

    result = await web_search._search_duckduckgo("agentic engineer", max_results=3)

    assert "A" in result
    assert "https://a.example" in result


@pytest.mark.asyncio
async def test_duckduckgo_search_reports_failure_without_raising(monkeypatch):
    def broken(query, max_results):
        raise ImportError("cannot import name 'AsyncDDGS'")

    monkeypatch.setattr(web_search, "_ddgs_text", broken)

    result = await web_search._search_duckduckgo("anything")

    assert "Search failed" in result


@pytest.mark.asyncio
async def test_duckduckgo_search_handles_no_results(monkeypatch):
    monkeypatch.setattr(web_search, "_ddgs_text", lambda query, max_results: [])

    result = await web_search._search_duckduckgo("nothing findable")

    assert "No results" in result


@pytest.mark.asyncio
async def test_web_search_falls_back_to_duckduckgo_without_a_tavily_key(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.setattr(
        web_search, "_ddgs_text", lambda query, max_results: [{"title": "T", "href": "u", "body": "b"}]
    )

    result = await web_search.web_search.ainvoke({"query": "test"})

    assert "T" in result
