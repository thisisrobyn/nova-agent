# NOVA — Copilot Instructions
> Neural Orchestration & Virtual Agent

---

## Project Context

You are helping to develop NOVA, an advanced conversational AI agent built as a master's thesis project.

Core capabilities:
- Generate and execute Python code autonomously
- Perform web searches for up-to-date information
- Maintain short- and long-term conversation memory
- Access a knowledge base via RAG
- Orchestrate multiple specialized agents
- Expose functionality via a REST API
- Run scheduled automations

---

## Repository Layout

```
nova/
├── agent/
│   ├── graph.py          # Main LangGraph graph
│   ├── nodes.py          # Graph nodes (reasoning, tools, memory)
│   ├── state.py          # Shared agent state (TypedDict)
│   └── prompts.py        # System prompts and templates
├── tools/
│   ├── search.py         # Web search (Tavily / DuckDuckGo)
│   ├── code_exec.py      # Code generation & execution
│   ├── rag.py            # Retrieval over ChromaDB/FAISS
│   ├── files.py          # File reading/writing (Pandas, OpenPyXL)
│   └── datetime_tool.py  # Date/time utilities
├── memory/
│   ├── short_term.py     # Conversation buffer (Redis / in-memory)
│   ├── long_term.py      # RAG: embeddings + vector store
│   └── episodic.py       # Session summaries (SQLite)
├── mcp/
│   └── server.py         # MCP Server (LangChain MCP)
├── api/
│   ├── main.py           # FastAPI app
│   ├── routes.py         # REST endpoints
│   └── schemas.py        # Pydantic models
├── ui/
│   └── app.py            # Streamlit / Gradio UI
├── automation/
│   ├── scheduler.py      # APScheduler jobs
│   └── n8n_webhook.py    # n8n webhook receiver
├── tests/
├── docs/
├── pyproject.toml
├── .env.example
└── README.md
```

---

## Technology Stack

Key components and suggested packages:
- LLM Core: Claude 3 / GPT-4o / Llama3 (Ollama) — `langchain_anthropic`, `langchain_openai`, `langchain_ollama`
- Orchestration: LangGraph + LangChain — `langgraph`, `langchain`
- Web search: Tavily — `langchain_community.tools.tavily_search`
- Vector store: ChromaDB / FAISS — `chromadb`, `langchain_community.vectorstores`
- Embeddings: OpenAI / sentence-transformers
- Memory: Redis (conversation buffer) — `langchain.memory`, `redis`
- MCP: LangChain MCP — `langchain_mcp_adapters`
- API: FastAPI + Uvicorn — `fastapi`, `uvicorn`
- UI: Streamlit — `streamlit`
- Automation: APScheduler + n8n
- Data/RPA: pandas, openpyxl, beautifulsoup4

---

## Environment Variables

Use a `.env` file and `os.getenv()` or `python-dotenv` to read secrets. Example variables:

```env
# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Web search
TAVILY_API_KEY=

# Memory
REDIS_URL=redis://localhost:6379
CHROMA_PERSIST_DIR=./data/chroma

# Observability
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=nova-tfm

# API
NOVA_API_HOST=0.0.0.0
NOVA_API_PORT=8000

# Code execution
CODE_EXEC_TIMEOUT=30
CODE_EXEC_MODE=subprocess  # subprocess | docker
MCP_TRANSPORT=http  # or 'stdio'
```

Never hardcode credentials in source.

---

## Code Conventions

- Python 3.11+
- Use type hints on all functions
- Docstrings in Google style
- Configuration classes via `pydantic.BaseSettings`
- Explicit error handling using specific exceptions
- Use `logging.getLogger(__name__)` instead of `print()`

LangGraph conventions:
- Agent state is a `TypedDict` in `agent/state.py`
- Nodes are pure async functions that take and return partial state
- Use `add_messages` metadata to accumulate messages in state

Tools:
- Define tools with the `@tool` decorator (LangChain)
- Tools must have clear docstrings and internal error handling (do not raise to agent)
- For code-execution tools, restrict dangerous imports and enforce timeouts

API:
- All endpoints async
- Pydantic v2 for request/response schemas
- Version API paths under `/api/v1/`

Testing:
- Use `pytest` + `pytest-asyncio`
- Mock LLMs in unit tests (no real LLM calls in CI)

---

## Agent Flow (high level)

```
User -> [Input Node (context + memory)] -> [LLM Reasoning (ReAct)]
                              |
                 +----------+----------+
                 |                     |
             Needs tool?            No tool
                 |                     |
         [Execute Tool Node]      [Generate Response]
                 |                     |
        [Return tool result]      [Save to memory]
                 \_____________________/ 
                          |
                     [Respond to user]
```

When proposing graph code, respect the flow and always include memory updates.

---

## MCP (Model Context Protocol)

Use LangChain MCP Adapters to register external tools via MCP. See https://docs.langchain.com/mcp

Implement MCP server logic in `mcp/server.py` and provide a function to load MCP tools. Use `MCP_TRANSPORT` to select `http` or `stdio`.

Example loader:

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

async def load_mcp_tools():
    client = MultiServerMCPClient({
        "filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]},
    })
    return await client.get_tools()
```

---

## Phase Plan

Phase 1 — Foundation: Agent base + MCP + UI

Phase 2 — RAG memory: ChromaDB + Redis + BPMN

Phase 3 — Web + Code + Multi-agent: Tavily + Code Agent + CrewAI

Phase 4 — API + Automation: FastAPI + n8n + APScheduler

Phase 5 — Thesis presentation: Demo + memory + slides

Update phase status as you progress (In Progress / Done / Pending).

---

## Specific Guidelines

1. Prioritize LangGraph over legacy LangChain constructs (do not use `LLMChain` or `ConversationChain`).
2. Use `async`/`await` in nodes and API endpoints.
3. Always add type hints to functions.
4. New tools must use `@tool`, have a Google-style docstring, and handle errors internally.
5. Nodes must return partial state dicts only (do not mutate global state).
6. Read environment variables with `os.getenv()` or `pydantic.BaseSettings`.
7. Do not use `print()` for logging; use `logging.getLogger(__name__)`.
8. For code execution tools, enforce timeouts and restrict dangerous imports.
9. Prefer MCP for adding external tools rather than ad-hoc integrations.
10. Write tests before implementing critical tools or nodes.

Refactor guidance:
- Keep modules modular: `agent/`, `tools/`, `memory/`, `ui/`, `api/`, `mcp/`.
- Implement nodes as pure async functions with type hints and return partial state.
- Tools live in `tools/` with `@tool` and safe error handling.
- Document any new env vars in `.env.example`.
- Add unit tests in `tests/` and mock external LLM/MCP calls.

---

