"""Web search tool for the NOVA agent.

Uses Tavily as the primary search provider (requires TAVILY_API_KEY)
and falls back to DuckDuckGo when Tavily is unavailable.
"""

from __future__ import annotations

import asyncio
import os

import structlog
from langchain_core.tools import tool

logger = structlog.stdlib.get_logger(__name__)


async def _search_tavily(query: str, max_results: int = 5) -> str | None:
    """Search using Tavily API.  Returns formatted results or None on failure."""
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        from tavily import AsyncTavilyClient

        client = AsyncTavilyClient(api_key=api_key)
        response = await client.search(
            query=query,
            max_results=max_results,
            include_answer=True,
        )

        parts: list[str] = []

        # Include Tavily's direct answer if available
        answer = response.get("answer")
        if answer:
            parts.append(f"**Summary:** {answer}\n")

        results = response.get("results", [])
        for i, r in enumerate(results, 1):
            title = r.get("title", "No title")
            url = r.get("url", "")
            snippet = r.get("content", "")[:300]
            parts.append(f"{i}. **{title}**\n   {snippet}\n   Source: {url}")

        if not parts:
            return None

        return "\n\n".join(parts)

    except Exception as exc:
        logger.warning("Tavily search failed, falling back to DuckDuckGo", error=str(exc))
        return None


def _ddgs_text(query: str, max_results: int) -> list[dict]:
    """Blocking DuckDuckGo call — ``duckduckgo_search`` >=8 dropped its async client."""
    from duckduckgo_search import DDGS

    with DDGS() as ddgs:
        return ddgs.text(query, max_results=max_results)


async def _search_duckduckgo(query: str, max_results: int = 5) -> str:
    """Search using DuckDuckGo (no API key required)."""
    try:
        results = await asyncio.to_thread(_ddgs_text, query, max_results)

        if not results:
            return "No results found."

        parts: list[str] = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "No title")
            url = r.get("href", "")
            snippet = r.get("body", "")[:300]
            parts.append(f"{i}. **{title}**\n   {snippet}\n   Source: {url}")

        return "\n\n".join(parts)

    except Exception as exc:
        return f"Search failed: {str(exc)}"


@tool
async def web_search(query: str) -> str:
    """Search the internet for current information.

    Use this tool when:
    - The user asks about current events, recent news, or time-sensitive topics
    - You need up-to-date information that may not be in your training data
    - The user explicitly asks you to search the web
    - You need to verify or fact-check recent claims

    Always cite sources with URLs in your response when using search results.

    Args:
        query: The search query describing what to find.

    Returns:
        Search results with titles, snippets, and source URLs.
    """
    # Try Tavily first (better quality, AI-optimized)
    result = await _search_tavily(query)
    if result:
        return result

    # Fall back to DuckDuckGo
    return await _search_duckduckgo(query)
