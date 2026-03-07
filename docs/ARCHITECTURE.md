# NOVA Architecture

## Overview

NOVA (Neural Orchestration & Virtual Agent) is a conversational AI agent built on **LangGraph** and **LangChain**. Its design follows the **ReAct** (Reasoning + Acting) pattern: the agent reasons about the user's question, decides whether it needs to execute tools, executes them, and formulates a final response.

## Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                      Interfaces                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │   CLI    │  │  Streamlit   │  │  MCP Server        │ │
│  │ agent/   │  │  ui/app.py   │  │  nova_mcp/server.py│ │
│  │ cli.py   │  │              │  │                    │ │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────────┘ │
│       │               │                   │              │
│       └───────────────┼───────────────────┘              │
│                       ▼                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │              LangGraph StateGraph                  │  │
│  │                                                    │  │
│  │   START → [agent_node] ──→ tool_calls? ──→ END    │  │
│  │                │                                   │  │
│  │                ▼ yes                               │  │
│  │           [tool_node] ──→ [agent_node]             │  │
│  │                                                    │  │
│  │   agent/graph.py · agent/nodes.py · agent/state.py │  │
│  └──────────┬────────────────────┬────────────────────┘  │
│             │                    │                        │
│             ▼                    ▼                        │
│  ┌──────────────────┐  ┌─────────────────────────────┐   │
│  │   LLM (OpenAI)   │  │          Tools              │   │
│  │   agent/llm.py   │  │  tools/calculator.py        │   │
│  │   ChatOpenAI      │  │  tools/datetime_tool.py     │   │
│  │   gpt-4.1-mini   │  │  tools/files.py             │   │
│  └──────────────────┘  └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Request Flow

1. The user sends a message (via CLI, Streamlit, or MCP).
2. The message is converted into a LangChain `HumanMessage` and added to the state.
3. LangGraph invokes the **agent_node**:
   - Builds the prompt: system message (with cwd) + full conversation history.
   - Calls the LLM with the bound tools (`bind_tools()`).
   - The LLM responds with text or with `tool_calls`.
4. The **router** (`should_use_tools`) inspects the response:
   - If there are `tool_calls` → executes the **tool_node** → returns to step 3.
   - If there are no `tool_calls` → end of the graph.
5. The final response is extracted from the last `AIMessage` and presented to the user.

## Agent State (`NOVAState`)

The state is a typed dictionary that LangGraph manages automatically:

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `Annotated[Sequence[BaseMessage], add_messages]` | Full conversation history. Uses the `add_messages` reducer for automatic merging. |
| `memory_context` | `str` | Long-term memory context (Phase 2). |
| `tool_results` | `List[Dict]` | Intermediate tool results. |
| `iteration_count` | `int` | Number of agent iterations in the session. |
| `total_tokens` | `int` | Accumulated tokens in the session. |
| `token_usage` | `Optional[Dict]` | Token usage from the last LLM call. |

## Main Modules

### `agent/graph.py`
Builds and compiles the LangGraph `StateGraph`. Defines the tool registry (`get_tools()`), nodes and edges, and exposes `compiled_graph` as a singleton. Provides `run_agent_once()` as the entry point for CLI and UI.

### `agent/nodes.py`
Contains `agent_node` (calls the LLM with tools) and `should_use_tools` (conditional router). The system prompt is dynamically injected with the current working directory.

### `agent/state.py`
Defines `NOVAState` with LangGraph annotations. The `messages` field uses `add_messages` so that each node can return only its new messages.

### `agent/llm.py`
Initializes the `ChatOpenAI` singleton. Model and temperature are configurable via environment variables (`NOVA_MODEL_NAME`, `NOVA_TEMPERATURE`).

### `agent/llm_client.py`
Low-level helper for LLM generation with multiple fallback patterns. Used internally; the main graph uses `bind_tools()` directly.
