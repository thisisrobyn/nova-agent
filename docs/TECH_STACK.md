# Tech Stack

## Backend (Python)

| Package | Version | What it does |
|---------|---------|-------------|
| `langchain` | ≥ 1.1.3 | Framework for building LLM apps |
| `langgraph` | ≥ 1.0.4 | State machine for the agent loop |
| `langchain-openai` | ≥ 0.3.0 | Connect to OpenAI models |
| `fastapi` | ≥ 0.115.0 | REST API framework (async) |
| `uvicorn` | ≥ 0.34.0 | ASGI server to run FastAPI |
| `langchain-mcp-adapters` | ≥ 0.1.0 | Connect to external MCP tool servers |
| `fastmcp` | ≥ 3.0.2 | Expose NOVA's tools via MCP |
| `mcp` | ≥ 1.0 | MCP protocol implementation |
| `tiktoken` | ≥ 0.9.0 | Count tokens (for cost tracking) |
| `pandas` | ≥ 2.2.0 | Read CSV files |
| `openpyxl` | ≥ 3.1.0 | Read Excel files |
| `python-dotenv` | ≥ 1.1.0 | Load `.env` configuration |

**Python version:** 3.11+
**Package manager:** [uv](https://github.com/astral-sh/uv)

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

**Node.js version:** 18+
**Package manager:** npm

## Why these choices?

### LangGraph over plain LangChain

LangGraph gives us a proper state machine with cycles. The agent can call a tool, read the result, decide it needs _another_ tool, and keep going. Plain LangChain chains are linear — they can't loop.

### FastAPI + SSE over WebSockets

Server-Sent Events (SSE) are simpler than WebSockets and perfect for streaming text. The browser opens one HTTP connection and the server pushes tokens as they arrive. No need for bidirectional communication.

### React over Streamlit

The original UI used Streamlit (Python). We migrated to React for:
- Real-time streaming (token by token)
- Better animations and UX (dark mode, toasts, drag & drop)
- Full control over the layout and interactions
- Standard web development tooling

### MCP for tool integration

Instead of writing custom integrations for every external service, MCP provides a standard protocol. Add a server URL to `mcp_servers.json` and the tools are automatically available to the agent.
