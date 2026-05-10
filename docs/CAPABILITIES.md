# NOVA Agent Capabilities

This document covers all major capabilities of the NOVA agent, how they work, and how to use them.

---

## 1. Conversational AI

**What it does:** NOVA is a multi-turn conversational agent that reasons about tasks, selects tools when needed, and produces coherent responses. It uses a ReAct (Reason + Act) loop implemented as a LangGraph state graph.

**How it works:** Each user message enters the LangGraph state graph. The agent node calls the Ollama LLM, which decides whether to respond directly or invoke a tool. If a tool is called, the result feeds back into the graph for another reasoning step. This loop continues until the agent produces a final answer. Token usage is tracked across all iterations.

**How to use it:**
- Send messages via the REST API (`POST /api/v1/chat`) or the CLI (`uv run nova`).
- For real-time output, use the streaming endpoint (`POST /api/v1/chat/stream`), which delivers tokens via Server-Sent Events as they are generated.
- Provide a `session_id` to maintain conversation continuity across requests.

**Configuration:**
- `model_name` -- The Ollama model to use (e.g., `llama3`, `mistral`). Changed via `PUT /api/v1/settings`.
- `temperature` -- Controls response randomness (0.0 to 1.0).
- `ollama_base_url` -- URL of the Ollama instance. Defaults to `http://localhost:11434`.

---

## 2. Long-Term Memory

**What it does:** NOVA automatically extracts and stores facts from conversations (e.g., user preferences, project details) and creates episodic summaries of past interactions. This information is injected into future conversations so the agent remembers context across sessions.

**How it works:** After each conversation turn, a background process analyzes the exchange for noteworthy facts. These are stored persistently. Episodic memory captures higher-level summaries of entire conversations. When a new message arrives, relevant facts and episodes are retrieved and included in the system prompt.

**How to use it:**
- Memory works automatically. No user action is required.
- View stored facts via `GET /api/v1/memory/facts`.
- View episodic summaries via `GET /api/v1/memory/episodes`.
- Clear facts or episodes via the corresponding `DELETE` endpoints if needed.

**Configuration:**
- Memory extraction is enabled by default. The number of facts and episodes retained can be adjusted in the agent configuration.

---

## 3. Knowledge Base (RAG)

**What it does:** Users can upload documents (PDF, TXT, Markdown) to build a personal knowledge base. When relevant, the agent retrieves and references this information in its responses.

**How it works:** Uploaded documents are split into chunks and embedded using the `nomic-embed-text` model via Ollama. Embeddings are stored in a vector database. During conversations, the agent can invoke the `rag_search` tool to perform similarity search against the knowledge base and retrieve relevant chunks as context.

**How to use it:**
- Upload documents via `POST /api/v1/documents/upload` (multipart form, max 50 MB).
- Check document processing status via `GET /api/v1/documents`.
- The agent automatically decides when to search the knowledge base based on the user's question.
- You can also explicitly ask the agent to search your documents.

**Configuration:**
- Supported formats: `.pdf`, `.txt`, `.md`.
- Embedding model: `nomic-embed-text` (pulled automatically by Ollama).
- Chunk size and overlap are configured in the RAG module settings.

---

## 4. Web Search

**What it does:** The agent can search the web in real time to answer questions about current events, look up documentation, or verify information.

**How it works:** The agent has access to a web search tool backed by Tavily or DuckDuckGo. When the agent determines that a question requires up-to-date or external information, it invokes the search tool, receives results, and incorporates them into its response.

**How to use it:**
- Ask the agent any question that requires current information. The agent decides autonomously when to search.
- You can also explicitly request a web search (e.g., "Search the web for...").

**Configuration:**
- `TAVILY_API_KEY` -- Set this environment variable to enable Tavily search. If not set, DuckDuckGo is used as a fallback.
- Search result count and other parameters are configurable in the tools module.

---

## 5. Code Execution

**What it does:** The agent can write and execute Python code to perform calculations, data transformations, file operations, and other programmatic tasks.

**How it works:** When the agent decides to run code, it writes a Python script and executes it in a sandboxed subprocess. The subprocess has restricted imports (no `os`, `sys`, `subprocess`, etc.) and a configurable timeout to prevent runaway execution. Standard output and errors are captured and returned to the agent.

**How to use it:**
- Ask the agent to perform any computation or data task. It will write and run code as needed.
- Results (stdout, stderr, return values) are included in the agent's response.

**Configuration:**
- Execution timeout: configurable (default varies by deployment).
- Import restrictions: defined in the code execution tool module.

---

## 6. Scheduled Tasks

**What it does:** Users can create recurring tasks that run agent prompts on a schedule. This enables autonomous operations such as daily summaries, periodic monitoring, or recurring data collection.

**How it works:** The scheduler uses APScheduler to manage cron-based and interval-based triggers. When a task fires, the configured prompt is sent to the agent, and the response is logged. Each execution records its status, response content, and duration.

**How to use it:**
- Create tasks via `POST /api/v1/scheduler/tasks` with a name, prompt, trigger type (`cron` or `interval`), and trigger arguments.
- View all tasks via `GET /api/v1/scheduler/tasks`.
- Review execution history via `GET /api/v1/scheduler/tasks/{task_id}/logs`.
- Enable or disable tasks via `PUT /api/v1/scheduler/tasks/{task_id}`.
- Delete tasks via `DELETE /api/v1/scheduler/tasks/{task_id}`.

**Configuration:**
- `trigger_type: "cron"` -- Standard cron fields: `hour`, `minute`, `day_of_week`, `month`, `day`.
- `trigger_type: "interval"` -- Duration fields: `seconds`, `minutes`, `hours`, `days`.

---

## 7. MCP Integration

**What it does:** NOVA can connect to external tool servers using the Model Context Protocol (MCP). This allows the agent to access tools provided by third-party services without modifying its core codebase.

**How it works:** The MCP client discovers and connects to MCP-compatible servers. Each server exposes a set of tools with defined schemas. These tools are registered with the agent at runtime and become available for use in the ReAct loop alongside built-in tools.

**How to use it:**
- Configure MCP server connections in the MCP configuration file.
- Once connected, the agent can use external tools transparently. They appear in `tools_used` in the response just like built-in tools.

**Configuration:**
- MCP server URLs and authentication are defined in the `nova_mcp/` module configuration.
- Multiple MCP servers can be connected simultaneously.

---

## 8. Session Management

**What it does:** NOVA maintains persistent conversation sessions on disk. Each session preserves the full message history, allowing users to resume conversations and review past interactions.

**How it works:** Sessions are identified by a `session_id`. Conversation history (all user and assistant messages) is stored persistently. When a session ID is reused, the full history is loaded and provided to the LLM as context. Titles can be generated automatically from the first message.

**How to use it:**
- Include a `session_id` in chat requests to maintain continuity.
- Retrieve history via `GET /api/v1/chat/history/{session_id}`.
- Generate a title for a session via `POST /api/v1/chat/title`.
- Clear a session via `DELETE /api/v1/chat/history/{session_id}`.
- If no `session_id` is provided, a new session is created automatically.

**Configuration:**
- Session storage location is determined by the application's data directory configuration.
- There is no hard limit on session count or history length, though very long histories may affect performance due to context window constraints.
