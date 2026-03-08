# Architecture

## Overview

NOVA follows a **ReAct** (Reasoning + Acting) pattern powered by **LangGraph**. The system has three layers:

1. **Frontend** — React web app (or CLI) where the user types messages
2. **Backend** — FastAPI server that manages sessions and streams responses
3. **Agent** — LangGraph state machine that reasons and calls tools

## How a message flows through the system

```
Browser (React)                    Server (FastAPI)                  Agent (LangGraph)
─────────────────                  ────────────────                  ─────────────────
User types message
        │
        ▼
  POST /chat/stream ──────────►  SSE streaming endpoint
                                        │
                                        ▼
                                 Create input state ──────────►  agent_node
                                                                    │
                                                              LLM decides:
                                                              needs tool?
                                                              /         \
                                                            Yes          No
                                                             │            │
                                                        tools node     respond
                                                        (execute)        │
                                                             │            │
                                                        back to       ◄──┘
                                                        agent_node
                                                                    │
                                 ◄─── SSE tokens ──────────────────┘
        │
  Render tokens
  word by word
```

## Agent state

The agent keeps a state dictionary (`NOVAState`) that travels through every node:

| Field | Type | Purpose |
|-------|------|---------|
| `messages` | `list[BaseMessage]` | Full conversation history (human, AI, tool) |
| `memory_context` | `str` | Additional context from memory (future) |
| `tool_results` | `list[str]` | Raw tool outputs |
| `iteration_count` | `int` | How many times the agent has run |
| `total_tokens` | `int` | Cumulative token usage |
| `token_usage` | `dict` | Last turn's prompt/completion/total tokens |

## Graph nodes

### `agent_node` (in `agent/nodes.py`)

1. Gets the LLM singleton from `agent/llm.py`
2. Calls `get_tools()` which returns local tools + MCP tools
3. Binds tools to the LLM (`llm.bind_tools(tools)`)
4. Sends the full message history to the LLM
5. Returns the AI response + token usage

### `should_use_tools` (router)

Looks at the last message. If it has `tool_calls` → go to `tools` node. Otherwise → end.

### `tools` node (LangGraph `ToolNode`)

Executes whatever tool the LLM requested and returns the result as a `ToolMessage`. Control goes back to `agent_node` so the LLM can use the result.

## Graph rebuild on MCP tool changes

The graph is compiled lazily. When `set_mcp_tools()` is called (at API startup), the graph recompiles with the new tools so the `ToolNode` can execute them. A `_GraphProxy` object ensures existing references always point to the latest compiled graph.

## Key modules

| Module | Responsibility |
|--------|---------------|
| `agent/graph.py` | Build LangGraph, manage tool registry, lazy graph compilation |
| `agent/nodes.py` | LLM reasoning + tool routing |
| `agent/state.py` | `NOVAState` TypedDict with `add_messages` reducer |
| `agent/llm.py` | OpenAI model singleton + runtime reconfiguration |
| `api/main.py` | FastAPI app, CORS, MCP lifecycle |
| `api/routes.py` | REST endpoints: chat, stream (SSE), settings, history |
| `api/schemas.py` | Pydantic request/response models |
| `nova_mcp/client.py` | Load tools from external MCP servers |
| `nova_mcp/server.py` | Expose NOVA's tools via MCP |
