"""NOVA MCP Client.

Loads tools from external MCP servers and converts them into LangChain
tools that can be added to the NOVA agent graph.
"""

import logging
from typing import Any, Dict, List

from dotenv import load_dotenv
from langchain_core.tools import BaseTool

load_dotenv()

logger = logging.getLogger(__name__)


async def load_mcp_tools(
    servers: Dict[str, Dict[str, Any]],
) -> List[BaseTool]:
    """Connect to MCP servers and return their tools as LangChain tools.

    Args:
        servers: Mapping of server name to connection config.
            Each value must contain the keys expected by
            MultiServerMCPClient (e.g. command, args for stdio transport).

    Returns:
        A (possibly empty) list of LangChain BaseTool instances.
    """
    if not servers:
        logger.debug("No MCP servers configured — returning empty list")
        return []

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        async with MultiServerMCPClient(servers) as client:
            tools = client.get_tools()
            logger.info(
                "Loaded %d MCP tool(s) from %d server(s)",
                len(tools),
                len(servers),
            )
            return tools
    except Exception as e:
        logger.error("Failed to load MCP tools: %s", e)
        return []
