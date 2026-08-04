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
| `NOVA_PROVIDER` | `ollama` | LLM provider: `ollama`, `openai` or `anthropic` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `NOVA_MODEL_NAME` | `gemma3:4b` | Chat model |
| `NOVA_TEMPERATURE` | `0.7` | Creativity (0-2) |
| `NOVA_NUM_CTX` | `16384` | Ollama context window — smaller values truncate tool schemas |
| `NOVA_REASONING` | _(model default)_ | Force thinking mode on/off (`qwen3`, `deepseek-r1`…) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | _(none)_ | Only for the matching cloud provider |
| `NOVA_PUBLIC_URL` | `http://localhost:5173` | Base URL every OAuth redirect URI is built from |
| `NOVA_ENCRYPTION_KEY` | _(auto-generated)_ | Fernet key encrypting connection tokens at rest |
| `TAVILY_API_KEY` | _(none)_ | Optional: Tavily web search API key |
| `CODE_EXEC_MODE` | `subprocess` | Code execution: `subprocess` or `disabled` |
| `SCHEDULER_DB_PATH` | `data/nova_scheduler.db` | Scheduler database path |
| `LANGCHAIN_TRACING_V2` | `false` | Enable LangSmith tracing |
| `MCP_TRANSPORT` | `http` | MCP transport mode |

OAuth client ids and secrets are **not** set here — enter them in the connections
setup wizard, which stores them encrypted in the database. See
[CONNECTIONS.md](CONNECTIONS.md).

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

## Optional: tuning the multi-agent runs

When NOVA splits a request across several agents, each task runs under an
execution budget. Hitting a limit does not fail the task — the agent stops
calling tools and answers with what it already gathered. The defaults suit a
local model on a normal machine; raise them on a fast one, lower them if runs
feel long.

```env
NOVA_TASK_MAX_STEPS=6          # LLM calls per task
NOVA_TASK_MAX_TOOL_CALLS=8     # tool invocations per task
NOVA_TASK_MAX_SECONDS=180      # wall clock per task
NOVA_TASK_MAX_REPEATS=1        # repeats of the same call before it counts as circling
NOVA_TASK_MAX_ATTEMPTS=2       # attempts per task, retries included
```

The knob to reach for first is `NOVA_TASK_MAX_TOOL_CALLS`: a research agent
that feels like it is searching forever is searching within its budget, and
lowering it trades thoroughness for speed directly.

## Optional: other A2A agents

Point NOVA at other agents that publish an Agent Card, and their skills join
the planner's catalogue:

```env
NOVA_A2A_PEERS=https://acme.example,https://research.internal
```

An unreachable peer is simply left out, and a peer can never shadow a built-in
skill. NOVA itself answers on `{NOVA_PUBLIC_URL}/a2a`, so two instances can
peer with each other. Details in [MULTI_AGENT.md](MULTI_AGENT.md).

## Connecting MCP servers

Edit `mcp_servers.json` in the project root to add external tool servers. Restart the API server after editing this file.

## Optional: Google, Microsoft and GitHub accounts

To let NOVA work inside your own mail, calendar, files and repositories, register
the OAuth applications once and then sign in from the sidebar → `connections`.
The full walkthrough — including the one-click GitHub App and the Microsoft
script — is in [CONNECTIONS.md](CONNECTIONS.md).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Ollama not found | Install from https://ollama.com, verify with `ollama list` |
| Model not available | Run `ollama pull gemma3:4b` |
| Port in use | Stop other services on 8000/5173 |
| ChromaDB errors | Delete `data/chroma/` and re-upload documents |
| Scheduler not starting | Check `data/` directory is writable |
| Agent invents tool names / wrong dates | Context window too small — raise `NOVA_NUM_CTX` |
| `redirect_uri_mismatch` on sign-in | `NOVA_PUBLIC_URL` must match the URI registered with the provider |

More answers in the [FAQ](FAQ.md).
