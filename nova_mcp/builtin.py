"""Bridge between the provider MCP servers and NOVA's own agent.

The servers in :mod:`nova_mcp.servers` are real MCP servers — any MCP client
can run them over stdio. NOVA's agent, however, lives in the same process, so
routing its own calls through an MCP transport would only add process spawns
and serialisation to every tool call.

This module therefore wraps *the same functions* the MCP servers expose as
LangChain tools. There is a single definition per capability: the MCP server
registers it for external clients, and this bridge binds it for the local
agent.

Only providers the user is actually **signed into** contribute tools. Tool
schemas are expensive: two dozen of them are enough to push the conversation
history out of a local model's context window. A service that is not connected
is instead reported through the CONNECTED SERVICES block that
:mod:`connections.prompt` injects into the system prompt, which is what makes
the agent refuse rather than improvise.
"""

from __future__ import annotations

from typing import Awaitable, Callable, List

import structlog
from langchain_core.tools import BaseTool, StructuredTool

from connections.credentials import get_credentials
from connections.store import list_connected_providers
from nova_mcp.servers import github, google, microsoft

logger = structlog.stdlib.get_logger(__name__)

#: Provider id → the tool functions its MCP server exposes.
_PROVIDER_TOOLS: dict[str, List[Callable[..., Awaitable[str]]]] = {
    "google": google.TOOLS,
    "microsoft": microsoft.TOOLS,
    "github": github.TOOLS,
}


def _to_langchain_tool(fn: Callable[..., Awaitable[str]]) -> BaseTool:
    """Wrap an async provider function as a LangChain structured tool.

    The argument schema is inferred from the type hints, and the Google-style
    docstring supplies both the tool description and per-argument help.
    """
    try:
        return StructuredTool.from_function(
            coroutine=fn, name=fn.__name__, parse_docstring=True
        )
    except ValueError:
        # The docstring parser is strict — a colon in a wrapped argument
        # description is enough to trip it. Losing the per-argument help is a
        # far smaller problem than losing the tool, so fall back to using the
        # whole docstring as the description.
        logger.warning("docstring not parseable, using it verbatim", tool=fn.__name__)
        return StructuredTool.from_function(
            coroutine=fn, name=fn.__name__, description=fn.__doc__ or fn.__name__
        )


async def get_service_tools() -> List[BaseTool]:
    """Return LangChain tools for every service somebody is signed into.

    The graph is shared by all sessions, so a provider's tools are bound when
    *any* user has connected it; each individual call then resolves the token
    of the user behind the current request (``connections.context``), and a
    user without their own connection gets a NOT_CONNECTED answer rather than
    someone else's account.

    Returns an empty list when nothing is connected, the normal state of a
    fresh install.
    """
    tools: List[BaseTool] = []

    try:
        connected = set(await list_connected_providers())
    except Exception:
        logger.warning("could not list connected providers", exc_info=True)
        return []

    for provider_id, functions in _PROVIDER_TOOLS.items():
        try:
            # Credentials gate the provider existing at all; a connection
            # gates anyone being able to act through it.
            if provider_id not in connected:
                continue
            if await get_credentials(provider_id) is None:
                continue
        except Exception:
            logger.warning("could not read credentials", provider=provider_id, exc_info=True)
            continue

        for fn in functions:
            try:
                tools.append(_to_langchain_tool(fn))
            except Exception:
                logger.warning("could not bind service tool", tool=fn.__name__, exc_info=True)

    logger.info("service tools bound", count=len(tools))
    return tools
