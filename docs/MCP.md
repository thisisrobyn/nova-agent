# MCP — Model Context Protocol

## What is MCP?

MCP is an open standard (created by Anthropic) that lets AI tools talk to each other. Think of it like USB for AI tools — one standard plug that works everywhere.

NOVA uses MCP in two ways:

1. **As a server** — NOVA exposes its tools (calculator, file reader, etc.) so _other_ apps can use them
2. **As a client** — NOVA connects to _external_ MCP servers to get _more_ tools (like searching LangChain docs)

## NOVA as MCP Client (connecting to external tools)

### How it works

When the API server starts, it:

1. Reads `mcp_servers.json` from the project root
2. Connects to each server listed there
3. Downloads the available tools
4. Adds them to the agent's tool belt (alongside calculator, file reader, etc.)

### Configuration

Edit `mcp_servers.json`:

```json
{
  "langchain-docs": {
    "url": "https://docs.langchain.com/mcp",
    "transport": "streamable_http"
  }
}
```

Each entry has:
- **key** — a name you choose (e.g. `"langchain-docs"`)
- **url** — the MCP server URL
- **transport** — how to connect: `"streamable_http"` for web servers, `"stdio"` for local commands

### Local command-based servers

You can also connect to MCP servers that run as local commands:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
    "transport": "stdio"
  }
}
```

### Code

- `nova_mcp/client.py` — `load_mcp_tools()` reads the config and returns LangChain tools
- `api/main.py` — calls `load_mcp_tools()` at startup and registers them in the agent graph

## NOVA as MCP Server (exposing tools to others)

### What it exposes

| Tool | Description |
|------|-------------|
| `calculator` | Evaluate math expressions |
| `get_current_datetime` | Get current date/time in any timezone |
| `convert_timezone` | Convert time between timezones |
| `read_csv` | Read CSV files |
| `read_excel` | Read Excel files |
| `read_text_file` | Read text/code files |

### Running the server

```bash
# For local integrations (IDE plugins, etc.)
make mcp

# For remote access (other machines, web apps)
make mcp-http
```

### Code

- `nova_mcp/server.py` — uses FastMCP to expose tools
- Transport controlled by `MCP_TRANSPORT` env var (`stdio` or `http`)
