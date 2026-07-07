# Architecture

## Overview

NOVA follows a **ReAct** (Reasoning + Acting) pattern powered by **LangGraph**. The system has three layers:

1. **Frontend** -- React 19 + Vite 7 + Tailwind CSS 4 web app where the user interacts via chat
2. **Backend** -- FastAPI server (uvicorn) that manages sessions, streams responses, and exposes 22 REST endpoints
3. **Agent** -- LangGraph state machine that reasons, calls tools, and uses Ollama as the local LLM backend

## Message Flow

```
Browser (React 19)                 Server (FastAPI)                  Agent (LangGraph)
──────────────────                 ────────────────                  ─────────────────
User types message
        |
        v
  POST /chat/stream ----------->  SSE streaming endpoint
                                        |
                                        v
                                 Create input state
                                        |
                                 Inject memory_context ---+
                                 (facts + episodes)       |
                                        |                 |
                                        v                 |
                                 Pass to agent  <---------+
                                        |
                                        v
                                                       agent_node
                                                          |
                                                    LLM decides:
                                                    needs tool?
                                                    /         \
                                                  Yes          No
                                                   |            |
                                              tools node     respond
                                              (execute)        |
                                                   |            |
                                              back to       <--+
                                              agent_node
                                                          |
                                 <--- SSE tokens ---------+
        |
  Render tokens
  word by word
                                 Fire-and-forget:
                                 asyncio.create_task()
                                 -> extract facts
                                 -> summarize episode
```

## Agent State (`NOVAState`)

The agent keeps a state dictionary (`NOVAState`) that travels through every node:

| Field | Type | Purpose |
|-------|------|---------|
| `messages` | `list[BaseMessage]` | Full conversation history (human, AI, tool) |
| `memory_context` | `str` | Injected context from long-term memory (facts + recent episodes) |
| `tool_results` | `list[str]` | Raw tool outputs |
| `iteration_count` | `int` | How many times the agent has looped |
| `total_tokens` | `int` | Cumulative token usage |
| `token_usage` | `dict` | Last turn's prompt/completion/total tokens |

## Graph Nodes

### `agent_node` (in `agent/nodes.py`)

1. Gets the LLM singleton from `agent/llm.py`
2. Calls `get_tools()` which returns 11 local tools + any loaded MCP tools
3. Binds tools to the LLM (`llm.bind_tools(tools)`)
4. Sends `SYSTEM_PROMPT` + `memory_context` + full message history to the LLM
5. Returns the AI response + token usage

### `should_use_tools` (router)

Looks at the last message. If it has `tool_calls` -> go to `tools` node. Otherwise -> end.

### `tools` node (LangGraph `ToolNode`)

Executes whatever tool the LLM requested and returns the result as a `ToolMessage`. Control goes back to `agent_node` so the LLM can use the result.

### Graph rebuild on MCP tool changes

The graph is compiled lazily. When `set_mcp_tools()` is called (at API startup), the graph recompiles with the new tools so the `ToolNode` can execute them. A `_GraphProxy` object ensures existing references always point to the latest compiled graph.

## Tool Registry

NOVA ships with 11 local tools plus dynamically loaded MCP tools:

| Tool | Module | Description |
|------|--------|-------------|
| `get_current_datetime` | `tools/datetime_tool.py` | Current date/time in any timezone |
| `convert_timezone` | `tools/datetime_tool.py` | Convert datetime between timezones |
| `calculator` | `tools/calculator.py` | Evaluate math expressions safely |
| `list_directory` | `tools/files.py` | List files in a directory |
| `read_csv` | `tools/files.py` | Read CSV files into text |
| `read_excel` | `tools/files.py` | Read Excel files into text |
| `read_text_file` | `tools/files.py` | Read plain text / code files |
| `count_conversation_tokens` | `tools/conversation_tokens.py` | Count tokens in current conversation |
| `rag_search` | `tools/rag_tool.py` | Query ChromaDB for relevant document chunks |
| `web_search` | `tools/web_search.py` | Search the web (Tavily + DuckDuckGo fallback) |
| `execute_python` | `tools/code_executor.py` | Run Python code in a sandboxed subprocess (conditional on `CODE_EXEC_MODE`) |

MCP tools are loaded at startup from configured MCP servers via `nova_mcp/client.py` and merged into the tool registry.

## Memory System

The memory module (`memory/`) provides long-term context that persists across conversations.

### Storage

All memory is stored in SQLite (`data/nova_memory.db`) via `aiosqlite`.

### Memory Types

- **Semantic memory** -- Facts extracted by the LLM from conversations (e.g., "User prefers dark mode"). Stored as key-value facts in SQLite.
- **Episodic memory** -- Conversation summaries generated after each chat. Stored with timestamps for recency-based retrieval.

### Memory Context Injection

Before the agent processes a message, the system:

1. Retrieves relevant semantic facts
2. Retrieves recent episodic summaries
3. Formats them into a `memory_context` string
4. Passes `memory_context` as part of the agent state

### Fire-and-Forget Extraction

After each chat response is sent, an `asyncio.create_task()` fires off background work to:

- Extract new semantic facts from the conversation
- Generate an episodic summary of the exchange

This avoids blocking the response stream.

### Memory Modules

| Module | Responsibility |
|--------|---------------|
| `memory/__init__.py` | Singleton facade for the memory subsystem |
| `memory/database.py` | SQLite connection and schema management via aiosqlite |
| `memory/episodic.py` | Episodic memory storage and retrieval |
| `memory/conversation.py` | Conversation-level memory operations and context formatting |

## RAG Pipeline

NOVA includes a fully offline Retrieval-Augmented Generation pipeline.

```
Upload document
      |
      v
  PyMuPDF (PDF) / text loader
      |
      v
  RecursiveCharacterTextSplitter
  (chunk_size=1000, overlap=200)
      |
      v
  OllamaEmbeddings (nomic-embed-text)
      |
      v
  ChromaDB (persistent at data/chroma/)
      |
      v
  rag_search tool
      |
      v
  Similarity search with score threshold
      |
      v
  Top chunks returned to agent
```

- **Vector store**: ChromaDB, in-process, persistent at `data/chroma/`
- **Embeddings**: `nomic-embed-text` via `OllamaEmbeddings` (fully offline, no API keys)
- **Ingestion**: PyMuPDF for PDFs, `RecursiveCharacterTextSplitter` with chunk size 1000 and overlap 200
- **Retrieval**: Similarity search with score threshold filtering

### RAG Modules

| Module | Responsibility |
|--------|---------------|
| `memory/rag/store.py` | ChromaDB vector store initialization and management |
| `memory/rag/ingestion.py` | Document loading, splitting, and embedding |
| `memory/rag/retriever.py` | Similarity search and chunk retrieval |

## Web Search

- **Primary**: Tavily search (requires `TAVILY_API_KEY` env var)
- **Fallback**: DuckDuckGo search (no API key required)
- The `web_search` tool tries Tavily first; if the key is missing or the call fails, it falls back to DuckDuckGo
- Returns formatted search results with titles, snippets, and URLs

Module: `tools/web_search.py`

## Code Execution

Sandboxed Python code execution with security restrictions:

- Runs in a **subprocess** with `python -I` (isolated mode -- no user site packages, no env vars)
- **Import blocklist**: `os`, `subprocess`, `sys`, `shutil`, and other dangerous modules are rejected
- **Timeout**: Default 30 seconds, configurable
- **Temp CWD**: Each execution runs in a temporary working directory
- **Configuration**: Controlled by `CODE_EXEC_MODE` env var:
  - `"subprocess"` -- enabled (default)
  - `"disabled"` -- tool is not registered

Module: `tools/code_executor.py`

## Scheduled Tasks

NOVA supports recurring and one-off scheduled tasks via APScheduler.

- **Scheduler**: `AsyncIOScheduler` with `SQLAlchemyJobStore`
- **Storage**: SQLite at `data/nova_scheduler.db`
- **Triggers**: Cron expressions and interval-based triggers
- **Execution**: Each scheduled task calls `run_agent_once()` with the task's prompt, running through the full agent pipeline
- **Logging**: Execution logs record duration, status (success/failure), and result text
- **Lifespan**: Scheduler is started during FastAPI app startup and shut down on app shutdown (managed in `api/main.py`)

### Scheduler Modules

| Module | Responsibility |
|--------|---------------|
| `scheduler/__init__.py` | Singleton scheduler instance |
| `scheduler/models.py` | Pydantic models for tasks, triggers, and execution logs |
| `scheduler/store.py` | SQLite persistence for task definitions and execution logs |
| `scheduler/manager.py` | APScheduler lifecycle, job registration, and execution |

## Data Storage Layout

NOVA does **not** use a single database. Each kind of data lives in the store
best suited to it, and everything is local to the machine (no cloud database).

| Data | Where | Technology | Path | Env override |
|------|-------|------------|------|--------------|
| **Chat message history** | JSON file per session (also cached in RAM) | Plain files | `data/sessions/<session_id>.json` | — |
| **User facts** (name, preferences…) | `facts` table | SQLite (`aiosqlite`) | `data/nova_memory.db` | `MEMORY_DB_PATH` |
| **Episodic memory** (session summaries) | `episodes` table | SQLite (`aiosqlite`) | `data/nova_memory.db` | `MEMORY_DB_PATH` |
| **Document metadata** (name, status, chunk count) | `documents` table | SQLite (`aiosqlite`) | `data/nova_memory.db` | `MEMORY_DB_PATH` |
| **Knowledge base** (RAG chunks + embeddings) | `nova_documents` collection | ChromaDB vector store | `data/chroma/` | `CHROMA_PERSIST_DIR` |
| **Uploaded source documents** | Raw files | Plain files | `data/uploads/` | — |
| **Scheduled tasks + run logs** | `scheduled_tasks`, `task_executions` tables | SQLite (`aiosqlite`) | `data/nova_scheduler.db` | `SCHEDULER_DB_PATH` |

```
data/
  sessions/           # Chat message history — one JSON file per session
  nova_memory.db      # SQLite: facts + episodes + document metadata
  chroma/             # ChromaDB vector store (RAG embeddings)
  uploads/            # Uploaded documents for RAG ingestion
  nova_scheduler.db   # SQLite: scheduler tasks + execution logs
```

**Notes**

- The **chat history sidebar list** (titles, folders) is kept in the browser's
  `localStorage`; the full message content of each session is what lives in
  `data/sessions/`. Selecting a session in the UI fetches it via
  `GET /chat/history/{session_id}`.
- **Authentication** (production only) is handled by AWS Cognito — NOVA keeps
  no local user/account database.

## API Layer

- **App factory**: `create_app()` in `api/main.py` with async lifespan managing:
  - Memory subsystem initialization
  - MCP tool loading from configured servers
  - Scheduler start and shutdown
- **Middleware**: `CorrelationIdMiddleware` for request tracing
- **Logging**: `structlog` for structured, correlation-aware logging
- **Health**: Enhanced `/health` endpoint reporting subsystem status (scheduler, memory, Ollama connectivity)

### REST Routes (22 endpoints under `/api/v1`)

| Group | Endpoints |
|-------|-----------|
| Chat | `POST /chat`, `POST /chat/stream` |
| History | `GET /history`, `GET /history/{id}`, `DELETE /history/{id}`, `PUT /history/{id}/title` |
| Settings | `GET /settings`, `PUT /settings` |
| Ollama | `GET /ollama/models` |
| Memory | `GET /memory/facts`, `DELETE /memory/facts/{id}`, `GET /memory/episodes`, `DELETE /memory/episodes/{id}` |
| Documents | `POST /documents/upload`, `GET /documents`, `GET /documents/{id}`, `DELETE /documents/{id}` |
| Scheduler | `POST /scheduler/tasks`, `GET /scheduler/tasks`, `PUT /scheduler/tasks/{id}`, `DELETE /scheduler/tasks/{id}`, `GET /scheduler/tasks/{id}/logs` |
| Health | `GET /health` |

## Key Modules

| Module | Responsibility |
|--------|---------------|
| `agent/graph.py` | Build LangGraph, manage tool registry, lazy graph compilation |
| `agent/nodes.py` | LLM reasoning node, tool routing, memory context injection |
| `agent/state.py` | `NOVAState` TypedDict with `add_messages` reducer |
| `agent/llm.py` | LLM singleton (Ollama via OpenAI-compatible API) + runtime reconfiguration |
| `agent/logging_config.py` | structlog configuration and correlation ID propagation |
| `api/main.py` | FastAPI app factory, CORS, lifespan (memory, MCP, scheduler) |
| `api/routes.py` | 22 REST endpoints: chat, stream, history, settings, memory, documents, scheduler |
| `api/schemas.py` | Pydantic request/response models |
| `api/middleware.py` | CorrelationIdMiddleware for request tracing |
| `memory/__init__.py` | Singleton facade for the memory subsystem |
| `memory/database.py` | SQLite connection and schema management via aiosqlite |
| `memory/episodic.py` | Episodic memory (conversation summaries) |
| `memory/conversation.py` | Conversation-level memory ops and context formatting |
| `memory/rag/store.py` | ChromaDB vector store initialization |
| `memory/rag/ingestion.py` | Document loading, chunking, and embedding |
| `memory/rag/retriever.py` | Similarity search and retrieval |
| `tools/calculator.py` | Safe math expression evaluation |
| `tools/datetime_tool.py` | Current datetime and timezone conversion |
| `tools/files.py` | Directory listing, CSV/Excel/text file reading |
| `tools/conversation_tokens.py` | Token counting for conversations |
| `tools/rag_tool.py` | RAG search tool (queries ChromaDB) |
| `tools/web_search.py` | Web search (Tavily + DuckDuckGo fallback) |
| `tools/code_executor.py` | Sandboxed Python execution via subprocess |
| `scheduler/__init__.py` | Singleton scheduler instance |
| `scheduler/models.py` | Task and execution log Pydantic models |
| `scheduler/store.py` | SQLite persistence for scheduler |
| `scheduler/manager.py` | APScheduler lifecycle and job management |
| `nova_mcp/client.py` | Load tools from external MCP servers |
| `nova_mcp/server.py` | Expose NOVA tools via MCP protocol |
