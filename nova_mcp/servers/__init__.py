"""Provider-specific MCP servers backed by the user's OAuth connections.

Each module here is a standalone `FastMCP` server that can be run on its own
for any MCP client::

    uv run python -m nova_mcp.servers.google      # stdio
    uv run python -m nova_mcp.servers.microsoft
    uv run python -m nova_mcp.servers.github

The same tool functions are also exposed directly to NOVA's own agent by
:mod:`nova_mcp.builtin`, so the local agent does not pay for inter-process
round trips while external clients still get a real MCP server.

Every tool resolves the access token through :func:`connections.get_access_token`
at call time, which means tokens are refreshed transparently and a
disconnected service produces a clear "not signed in" answer rather than an
exception.
"""

from __future__ import annotations
