# NOVA Agent Capabilities

This document covers all major capabilities of the NOVA agent, how they work, and how to use them.

---

## 1. Conversational AI

**What it does:** NOVA is a multi-turn conversational agent that reasons about tasks, selects tools when needed, and produces coherent responses. It uses a ReAct (Reason + Act) loop implemented as a LangGraph state graph.

**How it works:** Each user message enters the orchestrator graph, which first asks whether the request is worth splitting across several agents (capability 10). Most are not, and those fall through to the single-agent ReAct loop described here: the agent node calls the LLM, which decides whether to respond directly or invoke a tool. If a tool is called, the result feeds back into the graph for another reasoning step. This loop continues until the agent produces a final answer. Token usage is tracked across all iterations.

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

---

## 9. Connected Services

**What it does:** NOVA can act on the user's behalf in Google, Microsoft and GitHub — reading and sending mail, managing calendar events, browsing Drive/OneDrive, creating spreadsheets and documents, and working with repositories, issues and pull requests. That is 28 further tools on top of the built-in ones.

**How it works:** The user signs in once from the connections panel (sidebar → `connections`). NOVA exchanges the OAuth code for tokens server-side, encrypts them with Fernet and stores them in SQLite, refreshing expired access tokens automatically. The same functions are registered twice: as MCP tools for external clients (`nova_mcp/servers/`) and as LangChain tools for NOVA's own graph (`nova_mcp/builtin.py`).

Only services the user is signed into contribute tools. This is a hard requirement rather than an optimisation — tool schemas are large, and binding all of them fills a local model's context window on its own. `agent.graph.reload_service_tools()` re-binds them and rebuilds the graph on connect, disconnect and credential changes, with no restart.

**How to use it:**
- Operator, once per deployment: register NOVA as an application with each provider through the setup wizard. GitHub registers itself from a manifest in one click; Microsoft has a script; Google is done in its console.
- User, once per account: open the panel and click **Connect**.
- Connection state is injected into the system prompt each turn, so a disconnected service makes the agent say so plainly instead of improvising. Every tool also re-resolves its token at call time and returns `NOT_CONNECTED:` or `AUTH_EXPIRED:` if the grant was revoked.

**Configuration:**
- `NOVA_PUBLIC_URL` — every redirect URI is derived from it.
- `NOVA_ENCRYPTION_KEY` — Fernet key protecting tokens at rest; auto-generated into `data/.connection_key` if unset.
- Client ids and secrets live in the encrypted database, not `.env`. See [CONNECTIONS.md](CONNECTIONS.md).

---

## 10. Multi-Agent Orchestration (A2A)

**What it does:** A request containing several independent jobs — *"book me a slot on Friday, research the competition and draft a summary"* — is decomposed into a task graph and worked on by specialised agents in parallel, then merged into a single reply. The chat shows the run as it happens: which agent is working, which tool it is calling right now, what each one cost.

**How it works:** A planner turns the request into a DAG of tasks, each naming a *skill* rather than an agent. The executor runs the DAG in dependency waves, so independent tasks overlap instead of queueing. Every task runs under a budget (steps, tool calls, wall clock, repeated calls); hitting a limit stops the tool loop but does not fail the task — the agent answers from what it already gathered. Failures are contained per task: transient ones are retried, wrong approaches are replanned once, and a task whose dependency produced nothing is skipped rather than sent to invent an answer. The aggregator then merges the artifacts, reporting honestly on whatever did not work.

Splitting is not free, so the planner is allowed to decline. A plan of fewer than two tasks routes the turn to the single-agent graph instead — the path most turns take. See [MULTI_AGENT.md](MULTI_AGENT.md) for the graph, the budgets and the failure modes.

**How to use it:**
- Nothing to switch on. Ask for several things at once and the split happens by itself.
- Watch it live in the chat, or expand the diagram to see the full activity log per agent.
- `GET /api/v1/agents` lists the internal agents and whether their provider is connected.
- Point `NOVA_A2A_PEERS` at other A2A-speaking agents to add their skills to the planner's catalogue; matching tasks are then dispatched over JSON-RPC instead of running in-process.

**Configuration:**
- `NOVA_TASK_MAX_STEPS`, `NOVA_TASK_MAX_TOOL_CALLS`, `NOVA_TASK_MAX_SECONDS`, `NOVA_TASK_MAX_REPEATS` — the per-task budget.
- `NOVA_TASK_MAX_ATTEMPTS` — how many times a transient failure is retried.
- `NOVA_A2A_PEERS` — comma-separated base URLs of remote agents.
