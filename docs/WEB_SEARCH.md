# Web Search Integration

## Architecture

NOVA uses a dual-provider web search system with automatic fallback:

- **Primary: Tavily** -- High-quality results with summaries. Requires `TAVILY_API_KEY` environment variable.
- **Fallback: DuckDuckGo** -- Free, no API key needed. Uses the `duckduckgo-search` package. Activated when the Tavily key is not set or when a Tavily request fails.

## Tool

```
web_search(query: str) -> str
```

Located in `tools/web_search.py`.

## Agent Behavior

The `SYSTEM_PROMPT` instructs the agent to use `web_search` when it needs current or real-time information that it does not already have. The agent autonomously decides when to invoke the tool based on the user's query.

## Result Format

Returns formatted text with the following fields for each result (top 5):

- Title
- URL
- Snippet

## Setup

**DuckDuckGo (default)**

No setup needed. Works out of the box with no API key.

**Tavily (recommended for better results)**

1. Get an API key at https://tavily.com
2. Set `TAVILY_API_KEY` in your `.env` file

## Usage Examples

- "What's the weather in Madrid?"
- "Latest news about Python 3.13"
- "Who won the Champions League?"
