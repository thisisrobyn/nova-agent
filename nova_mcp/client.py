"""NOVA MCP Client.

Loads tools from external MCP servers and converts them into LangChain
tools that can be added to the NOVA agent graph.

Servers are configured via a ``mcp_servers.json`` file at the project root.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from langchain_core.tools import BaseTool

load_dotenv()

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "mcp_servers.json"


def load_mcp_config() -> Dict[str, Dict[str, Any]]:
    """Load MCP server definitions from ``mcp_servers.json``.

    Returns an empty dict if the file does not exist or is empty.
    """
    if not _CONFIG_PATH.exists():
        logger.debug("No mcp_servers.json found – skipping MCP tools")
        return {}
    try:
        data = json.loads(_CONFIG_PATH.read_text())
        if not isinstance(data, dict):
            return {}
        return data
    except Exception as exc:
        logger.warning("Failed to read mcp_servers.json: %s", exc)
        return {}


async def load_mcp_tools(
    servers: Dict[str, Dict[str, Any]] | None = None,
) -> List[BaseTool]:
    """Connect to MCP servers and return their tools as LangChain tools.

    Args:
        servers: Mapping of server name to connection config.  If ``None``,
            reads from ``mcp_servers.json``.

    Returns:
        A (possibly empty) list of LangChain BaseTool instances.
    """
    if servers is None:
        servers = load_mcp_config()

    if not servers:
        logger.debug("No MCP servers configured — returning empty list")
        return []

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        client = MultiServerMCPClient(servers)
        tools = await client.get_tools()
        logger.info(
            "Loaded %d MCP tool(s) from %d server(s)",
            len(tools),
            len(servers),
        )
        return tools
    except Exception as e:
        logger.error("Failed to load MCP tools: %s", e)
        return []
