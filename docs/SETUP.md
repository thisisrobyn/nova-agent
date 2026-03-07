# Installation and Usage Guide

## Prerequisites

- Python ≥ 3.10
- [uv](https://docs.astral.sh/uv/) (package manager)
- An OpenAI API key

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd nova-agent

# Create the configuration file
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Install dependencies
uv sync
```

## Running

### Interactive CLI

```bash
# Activate the virtual environment
source .venv/bin/activate

# Run the agent
nova
```

The `nova` command opens an interactive REPL. Type your message and press Enter. The agent can automatically use tools to respond. Type `exit` or `quit` to exit.

### Web Interface (Streamlit)

```bash
source .venv/bin/activate
streamlit run ui/app.py
```

A chat interface will open in the browser with:
- Persistent conversation history.
- Tool usage indicator for each response.
- Token metrics in the sidebar.
- Button to clear the conversation.

### MCP Server

```bash
source .venv/bin/activate

# stdio transport (default)
python -m nova_mcp.server

# HTTP transport
MCP_TRANSPORT=http python -m nova_mcp.server
```

## File Structure

```
nova-agent/
├── agent/          # Agent logic (graph, nodes, state, LLM)
├── tools/          # Tools (LangChain @tool)
├── nova_mcp/       # MCP server and client
├── ui/             # Streamlit web interface
├── memory/         # Long-term memory (Phase 2)
├── api/            # REST API with FastAPI (Phase 2)
├── tests/          # Tests
├── docs/           # Documentation
├── .env.example    # Environment variables template
├── pyproject.toml  # Project configuration
└── README.md       # Project overview
```

## Configuration

All variables are defined in `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `NOVA_MODEL_NAME` | No | `gpt-4.1-mini` | Model to use |
| `NOVA_TEMPERATURE` | No | `0.7` | LLM temperature (0.0 = deterministic, 1.0 = creative) |
| `MCP_TRANSPORT` | No | `stdio` | MCP transport: `stdio` or `http` |

## Troubleshooting

### `Command 'nova' not found`

The `nova` command is only available with the virtualenv activated:

```bash
source .venv/bin/activate
nova
```

If it still does not work, reinstall the package:

```bash
uv pip install -e .
```

### `OPENAI_API_KEY not set`

Make sure `.env` contains your key:

```
OPENAI_API_KEY=sk-...
```

### Timeout or no response error

Check your internet connection and that the API key is valid. You can test with:

```bash
python -c "from agent.llm import llm; print(llm)"
```

If it prints `None`, review the configuration in `.env`.
