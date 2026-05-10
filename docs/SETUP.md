# NOVA Setup Guide

## Prerequisites

- **Python 3.11+** -- check with `python3 --version`
- **Node.js 18+** -- check with `node --version`
- **uv** (Python package manager):
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Ollama** -- install from https://ollama.com, then pull the required models (see below)

## Step-by-step installation

### 1. Clone the project

```bash
git clone https://github.com/thisisrober/nova-agent.git
cd nova-agent
```

### 2. Pull Ollama models

```bash
ollama pull gemma3:4b          # Default chat model
ollama pull nomic-embed-text   # Required for RAG embeddings
```

Verify the models are available:

```bash
ollama list
```

### 3. Configuration

```bash
cp .env.example .env
```

Key `.env` variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `NOVA_MODEL_NAME` | `gemma3:4b` | Chat model |
| `NOVA_TEMPERATURE` | `0.7` | Creativity (0-2) |
| `TAVILY_API_KEY` | _(none)_ | Optional: Tavily web search API key |
| `CODE_EXEC_MODE` | `subprocess` | Code execution: `subprocess` or `disabled` |
| `SCHEDULER_DB_PATH` | `data/nova_scheduler.db` | Scheduler database path |
| `LANGCHAIN_TRACING_V2` | `false` | Enable LangSmith tracing |
| `MCP_TRANSPORT` | `http` | MCP transport mode |

### 4. Install dependencies

```bash
make install   # or: uv sync && cd ui && npm install
```

This installs all Python packages via `uv sync` and all JavaScript packages for the web UI via `npm install`.

### 5. Create data directories

```bash
mkdir -p data/chroma data/uploads data/sessions
```

These directories are created automatically on first run, but you can create them manually if needed.

### 6. Start the app

```bash
make dev       # Starts API (port 8000) + UI (port 5173)
```

Open http://localhost:5173 in your browser and start chatting.

## Other run modes

| Command | Description |
|---------|-------------|
| `make dev` | Full stack (API + UI) |
| `make api` | API only (port 8000) |
| `make ui` | Frontend only (port 5173) |
| `uv run nova` | CLI mode |
| `make test` | Run tests |

## Optional: Web Search

NOVA supports web search through two providers:

- **Tavily** (better results) -- get a key at https://tavily.com and set `TAVILY_API_KEY` in `.env`.
- **DuckDuckGo** -- used as a free fallback when no Tavily key is configured.

## Optional: LangSmith Observability

To enable LangSmith tracing, set the following in `.env`:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-key
```

## Connecting MCP servers

Edit `mcp_servers.json` in the project root to add external tool servers. Restart the API server after editing this file.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Ollama not found | Install from https://ollama.com, verify with `ollama list` |
| Model not available | Run `ollama pull gemma3:4b` |
| Port in use | Stop other services on 8000/5173 |
| ChromaDB errors | Delete `data/chroma/` and re-upload documents |
| Scheduler not starting | Check `data/` directory is writable |
