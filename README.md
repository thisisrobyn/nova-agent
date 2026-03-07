# 🤖 NOVA — Neural Orchestration & Virtual Agent

An advanced conversational AI agent built with **LangGraph**, **LangChain** and **OpenAI**.

## Features

- **LangGraph ReAct agent** — reasoning loop with automatic tool calling
- **Built-in tools** — calculator, date/time, CSV/Excel/text file reader
- **MCP server** — expose tools via the Model Context Protocol (FastMCP)
- **Streamlit UI** — web chat interface with token tracking
- **CLI** — rich terminal interface with colored output and session stats
- **Token tracking** — per-message and cumulative token usage with cost estimation

## Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd nova-agent

# 2. Create .env from the template
cp .env.example .env

# 3. Install dependencies and set up the nova command
make setup

# 4. Reload your shell (or open a new terminal)
source ~/.bashrc

# 5. Run the agent from anywhere
nova
```

## How to Use

### Environment setup

Copy the template and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env` and set at least the required variable:

```env
OPENAI_API_KEY=sk-proj-...       # Required — get one at https://platform.openai.com/api-keys
NOVA_MODEL_NAME=gpt-4.1-mini    # Optional — LLM model to use
NOVA_TEMPERATURE=0.7             # Optional — 0.0 = deterministic, 1.0 = creative
```

### Available commands

All commands are defined in the `Makefile`:

```bash
make setup       # Install dependencies + add 'nova' alias to ~/.bashrc
make run         # Run the CLI agent
make ui          # Launch the Streamlit web interface
make mcp         # Start the MCP server (stdio transport)
make mcp-http    # Start the MCP server (HTTP/SSE transport)
make test        # Run the test suite
make clean       # Remove caches and build artifacts
```

### Running the CLI agent

After `make setup`, the `nova` command is available globally (no need to activate the venv):

```bash
nova
```

The agent starts an interactive REPL. Type your message and press Enter. It can use tools automatically (calculator, file reading, date/time). Type `exit` to quit.

The agent is aware of your current working directory — it can list files, read CSVs, Excel files and source code from wherever you run it.

### Running the web interface

```bash
make ui
```

Opens a Streamlit chat in the browser with conversation history, tool usage indicators and token metrics in the sidebar.

### Running the MCP server

```bash
make mcp         # stdio transport (for IDE integrations)
make mcp-http    # HTTP/SSE transport (for remote access)
```

Exposes NOVA's tools via the Model Context Protocol so external applications can discover and call them.

## Project Structure

```
nova-agent/
├── agent/
│   ├── graph.py          # LangGraph StateGraph (agent ↔ tools loop)
│   ├── nodes.py          # Agent node (LLM + bind_tools) & router
│   ├── state.py          # NOVAState with add_messages reducer
│   ├── llm.py            # ChatOpenAI singleton
│   ├── llm_client.py     # Low-level LLM generate helper
│   ├── cli.py            # Interactive terminal interface
│   └── ui_formatter.py   # ANSI colored output
├── tools/
│   ├── calculator.py     # Safe math expression evaluator
│   ├── datetime_tool.py  # Current time & timezone conversion
│   ├── files.py          # CSV, Excel & text file reader
│   ├── token_counter.py  # tiktoken-based token counting
│   └── token_visualizer.py
├── nova_mcp/
│   ├── server.py         # FastMCP server (stdio / HTTP)
│   └── client.py         # MCP client (load external tools)
├── ui/
│   └── app.py            # Streamlit chat interface
├── memory/               # (Phase 2 — RAG + Redis)
├── api/                  # (Phase 2 — FastAPI)
├── tests/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── TOOLS.md
│   ├── MCP.md
│   ├── SETUP.md
│   ├── CLI_GUIDE.md
│   └── TOKEN_TRACKING.md
├── pyproject.toml
├── .env.example
└── README.md
```

## Configuration

All settings are via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | **Required.** OpenAI API key |
| `NOVA_MODEL_NAME` | `gpt-4.1-mini` | Model to use |
| `NOVA_TEMPERATURE` | `0.7` | LLM temperature |
| `MCP_TRANSPORT` | `stdio` | MCP transport (`stdio` or `http`) |

## Tools

| Tool | Description |
|------|-------------|
| `calculator` | Evaluate math expressions (safe `ast`-based eval) |
| `get_current_datetime` | Get current date/time in any IANA timezone |
| `convert_timezone` | Convert time between timezones |
| `read_csv` | Read and preview CSV files |
| `read_excel` | Read and preview Excel files |
| `read_text_file` | Read plain text files |

## Architecture

```
User → [HumanMessage] → Agent Node (LLM + bound tools)
                              │
                    ┌─────────┴──────────┐
                    │                    │
              has tool_calls?        no tool calls
                    │                    │
              Tool Node              → END
              (execute)
                    │
              → back to Agent
```

## License

MIT