# MCP Integration in NOVA

## What is MCP?

The **Model Context Protocol** (MCP) is an open standard proposed by Anthropic that defines how AI applications expose and consume tools, resources, and prompts in an interoperable way. It works with a client-server model:

- **MCP Server**: exposes tools that any compatible client can discover and execute.
- **MCP Client**: connects to MCP servers, discovers their tools, and integrates them into its flow.

NOVA implements both roles.

## NOVA as an MCP Server

**Module**: `nova_mcp/server.py`

NOVA's MCP server exposes the same tools that the agent uses internally (calculator, datetime, files), allowing external applications to use them.

**Implementation**: uses **FastMCP**, a framework that simplifies the creation of MCP servers. Each tool is registered with the `@mcp.tool()` decorator and delegates execution to the corresponding LangChain tool.

### Running the Server

```bash
# stdio transport (default) — for integration with IDEs and other agents
python -m nova_mcp.server

# HTTP/SSE transport — for remote access
MCP_TRANSPORT=http python -m nova_mcp.server
```

### Exposed Tools

| Tool | Description |
|------|-------------|
| `calculator` | Safe math evaluator |
| `get_current_datetime` | Current date/time |
| `convert_timezone` | Timezone conversion |
| `read_csv` | CSV file reading |
| `read_excel` | Excel file reading |
| `read_text_file` | Text file reading |

## NOVA as an MCP Client

**Module**: `nova_mcp/client.py`

The MCP client allows NOVA to connect to external MCP servers and load their tools as LangChain `BaseTool` objects, which can then be integrated into the agent's graph.

**Implementation**: uses `MultiServerMCPClient` from `langchain-mcp-adapters`, which handles the connection, tool discovery, and automatic conversion to LangChain.

### Usage

```python
from nova_mcp.client import load_mcp_tools

# External MCP server configuration
servers = {
    "my-server": {
        "command": "python",
        "args": ["-m", "my_mcp_server"],
    }
}

tools = await load_mcp_tools(servers)
# tools is a list of LangChain BaseTool objects
```

### Supported Transports

| Transport | Environment Variable | Usage |
|-----------|---------------------|-------|
| **stdio** | `MCP_TRANSPORT=stdio` | Communication via stdin/stdout. Ideal for local integration with IDEs and processes. |
| **HTTP/SSE** | `MCP_TRANSPORT=http` | Server-Sent Events over HTTP. For remote or cross-machine access. |

## MCP Architecture in NOVA

```
┌─────────────────────────────────────────────────┐
│                  NOVA Agent                     │
│                                                 │
│  Local tools             External tools         │
│  (tools/@tool)           (MCP client)           │
│       │                       │                 │
│       └───────────┬───────────┘                 │
│                   ▼                             │
│            get_tools() + MCP tools              │
│                   │                             │
│                   ▼                             │
│            LangGraph StateGraph                 │
│            (agent ↔ tools loop)                 │
└─────────────────────────────────────────────────┘
                    │
                    ▼ (MCP server)
        ┌───────────────────────┐
        │  External applications│
        │  (IDEs, other agents) │
        └───────────────────────┘
```
