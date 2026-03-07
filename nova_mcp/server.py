"""NOVA MCP Server.

Exposes NOVA's built-in tools through the Model Context Protocol so that
external clients (other agents, IDEs, etc.) can discover and call them.

Run standalone::

    python -m nova_mcp.server          # stdio transport (default)
    MCP_TRANSPORT=http python -m nova_mcp.server   # HTTP/SSE transport
"""

import logging
import os

from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="nova-tools",
    instructions="NOVA agent tools: calculator, datetime utilities, and file readers.",
)


# ── Re-expose NOVA tools as MCP tools ───────────────────────────────

@mcp.tool()
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression safely.

    Supports +, -, *, /, //, %, ** and functions like sqrt, sin, cos,
    log, abs. Constants pi and e are available.
    """
    from tools.calculator import calculator as _calc

    return _calc.invoke({"expression": expression})


@mcp.tool()
def get_current_datetime(timezone_name: str = "UTC") -> str:
    """Return the current date/time in the given IANA time zone."""
    from tools.datetime_tool import get_current_datetime as _dt

    return _dt.invoke({"timezone_name": timezone_name})


@mcp.tool()
def convert_timezone(time_str: str, from_tz: str = "UTC", to_tz: str = "Europe/Madrid") -> str:
    """Convert a time string between time zones."""
    from tools.datetime_tool import convert_timezone as _conv

    return _conv.invoke({"time_str": time_str, "from_tz": from_tz, "to_tz": to_tz})


@mcp.tool()
def read_csv(file_path: str, max_rows: int = 20) -> str:
    """Read a CSV file and return a summary with preview rows."""
    from tools.files import read_csv as _csv

    return _csv.invoke({"file_path": file_path, "max_rows": max_rows})


@mcp.tool()
def read_excel(file_path: str, sheet_name: str = "", max_rows: int = 20) -> str:
    """Read an Excel (.xlsx) file and return a summary with preview rows."""
    from tools.files import read_excel as _xl

    return _xl.invoke({"file_path": file_path, "sheet_name": sheet_name, "max_rows": max_rows})


@mcp.tool()
def read_text_file(file_path: str, max_lines: int = 100) -> str:
    """Read a plain text file and return its contents."""
    from tools.files import read_text_file as _txt

    return _txt.invoke({"file_path": file_path, "max_lines": max_lines})


# ── Entrypoint ───────────────────────────────────────────────────────

if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    logger.info("Starting NOVA MCP server (transport=%s)", transport)

    if transport == "http":
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")
