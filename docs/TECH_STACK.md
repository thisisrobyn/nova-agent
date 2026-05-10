# Tech Stack

## Backend (Python)

| Package | Version | What it does |
|---------|---------|-------------|
| `langchain` | >= 1.1.3 | Framework for building LLM apps |
| `langgraph` | >= 1.0.4 | State machine for the agent loop |
| `langchain-ollama` | >= 0.3.0 | Connect to local Ollama models |
| `fastapi` | >= 0.115.0 | REST API framework (async) |
| `uvicorn` | >= 0.34.0 | ASGI server to run FastAPI |
| `langchain-mcp-adapters` | >= 0.1.0 | Connect to external MCP tool servers |
| `fastmcp` | >= 3.0.2 | Expose NOVA's tools via MCP |
| `mcp` | >= 1.0 | MCP protocol implementation |
| `tiktoken` | >= 0.9.0 | Count tokens (for cost tracking) |
| `pandas` | >= 2.2.0 | Read CSV files |
| `openpyxl` | >= 3.1.0 | Read Excel files |
| `python-dotenv` | >= 1.1.0 | Load `.env` configuration |
| `chromadb` | >= 0.6.0 | Vector database for RAG |
| `pymupdf` | >= 1.25.0 | PDF parsing for document ingestion |
| `aiosqlite` | >= 0.20.0 | Async SQLite for memory and scheduler |
| `apscheduler` | >= 3.10.0 | Task scheduling (cron + interval) |
| `structlog` | >= 24.0.0 | Structured logging |
| `tavily-python` | >= 0.5.0 | Web search API (optional) |
| `duckduckgo-search` | >= 7.0.0 | Free web search fallback |
| `sqlalchemy` | >= 2.0.0 | ORM used by APScheduler job store |

**Python version:** 3.11+
**Package manager:** [uv](https://github.com/astral-sh/uv)

Note: `langchain-openai` has been replaced by `langchain-ollama`. The project migrated to a fully local Ollama backend.

## Frontend (TypeScript)

| Package | What it does |
|---------|-------------|
| `react` 19 | UI component library |
| `vite` 7 | Fast build tool and dev server |
| `tailwindcss` 4 | Utility-first CSS framework |
| `framer-motion` | Smooth animations |
| `react-markdown` | Render markdown in chat messages |
| `remark-gfm` | GitHub-flavored markdown (tables, strikethrough) |
| `rehype-highlight` | Syntax highlighting for code blocks |
| `highlight.js` | VS Code-style code coloring |
| `lucide-react` | Icon library |
| `react-router-dom` >= 7 | Client-side routing |

**Node.js version:** 18+
**Package manager:** npm

## Why these choices?

### LangGraph over plain LangChain

LangGraph gives us a proper state machine with cycles. The agent can call a tool, read the result, decide it needs _another_ tool, and keep going. Plain LangChain chains are linear -- they can't loop.

### FastAPI + SSE over WebSockets

Server-Sent Events (SSE) are simpler than WebSockets and perfect for streaming text. The browser opens one HTTP connection and the server pushes tokens as they arrive. No need for bidirectional communication.

### React over Streamlit

The original UI used Streamlit (Python). We migrated to React for:
- Real-time streaming (token by token)
- Better animations and UX (dark mode, toasts, drag and drop)
- Full control over the layout and interactions
- Standard web development tooling

### MCP for tool integration

Instead of writing custom integrations for every external service, MCP provides a standard protocol. Add a server URL to `mcp_servers.json` and the tools are automatically available to the agent.

### Ollama over OpenAI

Fully local inference with no API key required. Ollama supports a wide range of open models (Llama, Mistral, Qwen, etc.) and runs on consumer hardware. No usage costs, no rate limits, complete data privacy.

### ChromaDB over FAISS

ChromaDB provides persistent storage out of the box, runs in-process with no separate server, and supports metadata filtering. FAISS requires manual serialization and lacks built-in persistence.

### APScheduler over Celery

APScheduler is lightweight and async-native, backed by SQLite via SQLAlchemy. No external message broker (Redis, RabbitMQ) needed. Ideal for single-process deployments where the scheduler lives alongside the API.

### structlog over stdlib logging

Structured JSON logs with automatic context binding and correlation IDs. Makes it straightforward to trace requests across the agent pipeline and parse logs programmatically.
