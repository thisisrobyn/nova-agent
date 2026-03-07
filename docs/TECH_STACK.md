# NOVA Technology Stack

## Language and Environment

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Language | Python | ≥ 3.10 | Main project language |
| Package manager | uv | — | Dependency resolution and virtualenvs |
| Build system | Hatchling | — | Project packaging and `nova` command generation |

## Orchestration and LLM

| Component | Package | Purpose |
|-----------|---------|---------|
| **LangGraph** | `langgraph` | Graph engine for the agent. Defines the `agent → tools → agent` flow as a `StateGraph` with conditional edges. |
| **LangGraph Prebuilt** | `langgraph-prebuilt` | Provides `ToolNode` — a node that automatically executes the tools called by the LLM. |
| **LangChain** | `langchain` | Base framework: message abstractions (`BaseMessage`, `HumanMessage`, `AIMessage`), `@tool` decorator, and utilities. |
| **LangChain OpenAI** | `langchain-openai` | Integration with the OpenAI API. Provides `ChatOpenAI` with `bind_tools()` support. |
| **OpenAI** | `openai` | Official OpenAI Python client (dependency of `langchain-openai`). |

### Why LangGraph instead of plain LangChain?

LangChain provides abstractions for LLMs, prompts, and tools, but it does not manage complex flows with cycles. LangGraph adds:

- **Stateful graphs**: each node receives and returns partial state, and LangGraph merges it.
- **Conditional edges**: the router decides whether to go to the tool node or finish.
- **Cycles**: the agent can call tools multiple times before responding.
- **Reducers**: `add_messages` automatically merges message lists.

### How do they connect?

```
LangChain (messages, @tool, ChatOpenAI)
    ↓
LangGraph (StateGraph, ToolNode, edges)
    ↓
NOVA (graph.py, nodes.py, state.py)
```

LangChain provides the building blocks (LLM, messages, tools). LangGraph orchestrates them in a stateful graph. NOVA defines the agent-specific logic.

## Model Context Protocol (MCP)

| Component | Package | Purpose |
|-----------|---------|---------|
| **FastMCP** | `fastmcp` | Framework for creating MCP servers. NOVA exposes its tools as an MCP server in `nova_mcp/server.py`. |
| **MCP** | `mcp` | Base implementation of the MCP protocol (FastMCP dependency). |
| **LangChain MCP Adapters** | `langchain-mcp-adapters` | MCP client that converts tools from external MCP servers into LangChain `BaseTool` objects. Used in `nova_mcp/client.py`. |

### What is MCP?

The Model Context Protocol (MCP) is an open standard that allows agents and applications to expose and consume tools in an interoperable way. NOVA implements both sides:

- **MCP Server** (`nova_mcp/server.py`): allows external applications (other agents, IDEs) to use NOVA's tools.
- **MCP Client** (`nova_mcp/client.py`): allows NOVA to load tools from external MCP servers and integrate them into its graph.

Supported transports: `stdio` (default) and `http` (SSE). Configurable via the `MCP_TRANSPORT` variable.

## Tools

All tools use the LangChain `@tool` decorator, which converts them into `BaseTool` objects with an automatic JSON schema so the LLM can invoke them.

| Tool | Module | Description |
|------|--------|-------------|
| `calculator` | `tools/calculator.py` | Safe AST-based math evaluator. Supports +, -, *, /, **, sqrt, sin, cos, log, pi, e. Does not use `eval()`. |
| `get_current_datetime` | `tools/datetime_tool.py` | Returns the current date/time in any IANA timezone. |
| `convert_timezone` | `tools/datetime_tool.py` | Converts a time between two timezones. |
| `list_directory` | `tools/files.py` | Lists files and folders in a directory with sizes. |
| `read_csv` | `tools/files.py` | Reads a CSV file with Pandas and returns a preview. |
| `read_excel` | `tools/files.py` | Reads an Excel file (.xlsx) with OpenPyXL and returns a preview. |
| `read_text_file` | `tools/files.py` | Reads plain text files. |

### Tool Security

- The calculator uses `ast.parse()` + recursive evaluation — it does not execute arbitrary code.
- File tools validate existence, type, and maximum size (10 MB).
- All tools catch exceptions internally and return error messages instead of propagating them.

## Interfaces

| Interface | Module | Technology | Description |
|-----------|--------|-----------|-------------|
| **CLI** | `agent/cli.py` | Python REPL | Interactive terminal with ANSI colors, token tracking, and session statistics. Command: `nova` |
| **Web UI** | `ui/app.py` | Streamlit | Web chat with history, tool usage indicator, and metrics in the sidebar. Command: `streamlit run ui/app.py` |
| **MCP Server** | `nova_mcp/server.py` | FastMCP | Exposes tools for external consumption. Command: `python -m nova_mcp.server` |

## Token Tracking

| Module | Purpose |
|--------|---------|
| `tools/token_counter.py` | Token counting with `tiktoken`. Extracts actual usage from `response_metadata` or estimates using a chars/tokens ratio. |
| `tools/token_visualizer.py` | Cumulative tracking, statistical reports, cost estimation, and progress bars. |

## Data Dependencies

| Package | Purpose |
|---------|---------|
| `pandas` | CSV and Excel reading and analysis |
| `openpyxl` | Reading engine for .xlsx files |
| `tiktoken` | Tokenization compatible with OpenAI models |
| `python-dotenv` | Loading environment variables from `.env` |

## Environment Variables

Documented in `.env.example`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `NOVA_MODEL_NAME` | No | `gpt-4.1-mini` | LLM model to use |
| `NOVA_TEMPERATURE` | No | `0.7` | LLM temperature |
| `MCP_TRANSPORT` | No | `stdio` | MCP transport: `stdio` or `http` |
| `LANGCHAIN_TRACING_V2` | No | `true` | Enable tracing with LangSmith |
| `LANGCHAIN_API_KEY` | No | — | LangSmith API key |
| `LANGCHAIN_PROJECT` | No | `nova-tfm` | Project name in LangSmith |
