import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  Rocket,
  Cpu,
  Wrench,
  Globe,
  Code,
  Brain,
  Database,
  Clock,
  Plug,
  Key,
  Terminal,
  Zap,
  Menu,
  X,
  Github,
  FileText,
} from 'lucide-react';

/* ─── Types ─── */
interface DocSection {
  slug: string;
  title: string;
  icon: React.ElementType;
  category: string;
  content: React.ReactNode;
}

/* ─── Code Block ─── */
function CodeBlock({ children, lang = '' }: { children: string; lang?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-surface-700/30 bg-surface-900/80">
      {lang && (
        <div className="border-b border-surface-700/30 px-4 py-1.5 text-xs text-surface-500">
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-surface-300 code-scroll">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ─── Table ─── */
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-surface-700/30 code-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700/30 bg-surface-900/60">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-surface-200">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-surface-700/20 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-surface-300">
                  <span
                    className={j === 0 ? 'font-mono text-primary-300' : ''}
                  >
                    {cell}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Section Heading ─── */
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-4 text-2xl font-bold text-surface-100 first:mt-0">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 text-lg font-semibold text-surface-200">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 leading-relaxed text-surface-300">{children}</p>;
}

function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mb-4 space-y-2 pl-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-surface-300">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500/50" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════════════════════════════════
   DOCUMENTATION CONTENT
   ═══════════════════════════════════════════════════════ */
const docs: DocSection[] = [
  /* ─── Setup Guide ─── */
  {
    slug: 'setup',
    title: 'Setup Guide',
    icon: Rocket,
    category: 'Getting Started',
    content: (
      <>
        <H2>Prerequisites</H2>
        <UL
          items={[
            <>
              <strong className="text-surface-100">Python 3.11+</strong> — check with{' '}
              <code className="text-primary-300">python3 --version</code>
            </>,
            <>
              <strong className="text-surface-100">Node.js 18+</strong> — check with{' '}
              <code className="text-primary-300">node --version</code>
            </>,
            <>
              <strong className="text-surface-100">uv</strong> (Python package manager)
            </>,
            <>
              <strong className="text-surface-100">Ollama</strong> — install from{' '}
              <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">
                ollama.com
              </a>
            </>,
          ]}
        />

        <H2>Step-by-step Installation</H2>

        <H3>1. Clone the project</H3>
        <CodeBlock lang="bash">{`git clone https://github.com/thisisrober/nova-agent.git
cd nova-agent`}</CodeBlock>

        <H3>2. Pull Ollama models</H3>
        <CodeBlock lang="bash">{`ollama pull gemma3:4b          # Default chat model
ollama pull nomic-embed-text   # Required for RAG embeddings`}</CodeBlock>

        <H3>3. Configuration</H3>
        <CodeBlock lang="bash">cp .env.example .env</CodeBlock>

        <P>Key environment variables:</P>
        <Table
          headers={['Variable', 'Default', 'Description']}
          rows={[
            ['OLLAMA_BASE_URL', 'http://localhost:11434', 'Ollama server URL'],
            ['NOVA_MODEL_NAME', 'gemma3:4b', 'Chat model'],
            ['NOVA_TEMPERATURE', '0.7', 'Creativity (0-2)'],
            ['TAVILY_API_KEY', '(none)', 'Optional: Tavily web search API key'],
            ['CODE_EXEC_MODE', 'subprocess', 'Code execution mode'],
            ['SCHEDULER_DB_PATH', 'data/nova_scheduler.db', 'Scheduler database path'],
          ]}
        />

        <H3>4. Install dependencies</H3>
        <CodeBlock lang="bash">{`make install   # or: uv sync && cd ui && npm install`}</CodeBlock>

        <H3>5. Create data directories</H3>
        <CodeBlock lang="bash">mkdir -p data/chroma data/uploads data/sessions</CodeBlock>

        <H3>6. Start the app</H3>
        <CodeBlock lang="bash">make dev       # Starts API (port 8000) + UI (port 5173)</CodeBlock>
        <P>
          Open <code className="text-primary-300">http://localhost:5173</code> in your browser.
        </P>

        <H2>Run Modes</H2>
        <Table
          headers={['Command', 'Description']}
          rows={[
            ['make dev', 'Full stack (API + UI)'],
            ['make api', 'API only (port 8000)'],
            ['make ui', 'Frontend only (port 5173)'],
            ['uv run nova', 'CLI mode'],
            ['make test', 'Run tests'],
          ]}
        />

        <H2>Troubleshooting</H2>
        <Table
          headers={['Problem', 'Solution']}
          rows={[
            ['Ollama not found', 'Install from https://ollama.com, verify with ollama list'],
            ['Model not available', 'Run ollama pull gemma3:4b'],
            ['Port in use', 'Stop other services on 8000/5173'],
            ['ChromaDB errors', 'Delete data/chroma/ and re-upload documents'],
          ]}
        />
      </>
    ),
  },

  /* ─── Capabilities ─── */
  {
    slug: 'capabilities',
    title: 'Capabilities',
    icon: Zap,
    category: 'Getting Started',
    content: (
      <>
        <H2>1. Conversational AI</H2>
        <P>
          NOVA is a multi-turn conversational agent that reasons about tasks, selects tools when
          needed, and produces coherent responses. It uses a ReAct (Reason + Act) loop implemented
          as a LangGraph state graph.
        </P>
        <P>
          Each user message enters the LangGraph state graph. The agent node calls the Ollama LLM,
          which decides whether to respond directly or invoke a tool. If a tool is called, the
          result feeds back into the graph for another reasoning step.
        </P>

        <H2>2. Long-Term Memory</H2>
        <P>
          NOVA automatically extracts and stores facts from conversations (e.g., user preferences,
          project details) and creates episodic summaries of past interactions. This information is
          injected into future conversations so the agent remembers context across sessions.
        </P>
        <UL
          items={[
            'View stored facts via GET /api/v1/memory/facts',
            'View episodic summaries via GET /api/v1/memory/episodes',
            'Clear facts or episodes via the corresponding DELETE endpoints',
          ]}
        />

        <H2>3. Knowledge Base (RAG)</H2>
        <P>
          Users can upload documents (PDF, TXT, Markdown) to build a personal knowledge base.
          Uploaded documents are split into chunks and embedded using the nomic-embed-text model
          via Ollama. Embeddings are stored in ChromaDB.
        </P>
        <UL
          items={[
            'Upload via POST /api/v1/documents/upload (max 50 MB)',
            'Supported formats: .pdf, .txt, .md',
            'Automatic similarity search when the agent needs context',
          ]}
        />

        <H2>4. Web Search</H2>
        <P>
          The agent can search the web in real time using Tavily (primary) or DuckDuckGo
          (fallback). It autonomously decides when external information is needed.
        </P>

        <H2>5. Code Execution</H2>
        <P>
          The agent can write and execute Python code in a sandboxed subprocess with restricted
          imports, configurable timeout, and self-healing on errors.
        </P>

        <H2>6. Scheduled Tasks</H2>
        <P>
          Create recurring tasks that run agent prompts on a schedule using cron or interval-based
          triggers via APScheduler. Each execution is logged with status, duration, and result.
        </P>

        <H2>7. MCP Integration</H2>
        <P>
          NOVA can connect to external tool servers using the Model Context Protocol (MCP). Tools
          from external servers are registered at runtime alongside built-in tools.
        </P>

        <H2>8. Session Management</H2>
        <P>
          Persistent conversation sessions stored on disk. Each session preserves the full message
          history, allowing users to resume conversations and review past interactions.
        </P>
      </>
    ),
  },

  /* ─── Architecture ─── */
  {
    slug: 'architecture',
    title: 'Architecture',
    icon: Cpu,
    category: 'Core Concepts',
    content: (
      <>
        <H2>Overview</H2>
        <P>
          NOVA follows a ReAct (Reasoning + Acting) pattern powered by LangGraph. The system
          has three layers: a React 19 frontend, a FastAPI backend, and a LangGraph agent engine
          connected by SSE streaming.
        </P>

        <H2>Message Flow</H2>
        <CodeBlock lang="text">{`Browser (React 19)     Server (FastAPI)      Agent (LangGraph)
    User types msg
         |
    POST /chat/stream --> SSE streaming endpoint
                              |
                        Create input state
                        Inject memory_context
                              |
                        Pass to agent -------> agent_node
                                                  |
                                             LLM decides:
                                             needs tool?
                                             /         \\
                                           Yes          No
                                            |            |
                                       tools node     respond
                                       (execute)        |
                                            |            |
                                       back to       <--+
                                       agent_node
                              |
                   <-- SSE tokens ----------+
         |
    Render tokens`}</CodeBlock>

        <H2>Agent State (NOVAState)</H2>
        <Table
          headers={['Field', 'Type', 'Purpose']}
          rows={[
            ['messages', 'list[BaseMessage]', 'Full conversation history'],
            ['memory_context', 'str', 'Injected context from long-term memory'],
            ['tool_results', 'list[str]', 'Raw tool outputs'],
            ['iteration_count', 'int', 'Loop iteration counter'],
            ['total_tokens', 'int', 'Cumulative token usage'],
            ['token_usage', 'dict', 'Last turn prompt/completion/total tokens'],
          ]}
        />

        <H2>Graph Nodes</H2>
        <H3>agent_node</H3>
        <P>
          Gets the LLM singleton, binds tools, sends SYSTEM_PROMPT + memory_context + full
          message history to the LLM, and returns the AI response with token usage.
        </P>

        <H3>should_use_tools (router)</H3>
        <P>
          Checks the last message for tool_calls. If present, routes to the tools node.
          Otherwise, the graph ends.
        </P>

        <H3>tools node (ToolNode)</H3>
        <P>
          Executes the requested tool and returns the result as a ToolMessage. Control goes
          back to agent_node for the LLM to use the result.
        </P>

        <H2>Data Storage Layout</H2>
        <CodeBlock lang="text">{`data/
  nova_memory.db      # Memory facts + episodes (SQLite)
  nova_scheduler.db   # Scheduler tasks + execution logs (SQLite)
  chroma/             # ChromaDB vector store (embeddings)
  uploads/            # Uploaded documents for RAG ingestion
  sessions/           # Persisted chat sessions (JSON)`}</CodeBlock>

        <H2>Key Modules</H2>
        <Table
          headers={['Module', 'Responsibility']}
          rows={[
            ['agent/graph.py', 'Build LangGraph, manage tool registry'],
            ['agent/nodes.py', 'LLM reasoning node, tool routing'],
            ['agent/state.py', 'NOVAState TypedDict'],
            ['agent/llm.py', 'LLM singleton (Ollama)'],
            ['api/main.py', 'FastAPI app factory, CORS, lifespan'],
            ['api/routes.py', '22 REST endpoints'],
            ['memory/', 'Memory subsystem (facts + episodes)'],
            ['memory/rag/', 'ChromaDB vector store + ingestion'],
            ['tools/', 'Built-in tool implementations'],
            ['scheduler/', 'APScheduler task management'],
            ['nova_mcp/', 'MCP client/server'],
          ]}
        />
      </>
    ),
  },

  /* ─── Tools ─── */
  {
    slug: 'tools',
    title: 'Tools',
    icon: Wrench,
    category: 'Core Concepts',
    content: (
      <>
        <H2>What are tools?</H2>
        <P>
          Tools are functions that NOVA can use to do things it can't do by just thinking — like
          math, reading files, searching the web, or executing code. The agent decides autonomously
          when to use a tool.
        </P>

        <H2>Built-in Tools</H2>
        <Table
          headers={['Tool', 'Description', 'Module']}
          rows={[
            ['calculator', 'Evaluate math expressions safely', 'tools/calculator.py'],
            ['get_current_datetime', 'Current date/time in any timezone', 'tools/datetime_tool.py'],
            ['convert_timezone', 'Convert between timezones', 'tools/datetime_tool.py'],
            ['list_directory', 'List files and folders with sizes', 'tools/files.py'],
            ['read_csv', 'Read and preview CSV data', 'tools/files.py'],
            ['read_excel', 'Read and preview Excel data', 'tools/files.py'],
            ['read_text_file', 'Read plain text/code files', 'tools/files.py'],
            ['rag_search', 'Query ChromaDB knowledge base', 'tools/rag_tool.py'],
            ['web_search', 'Search web (Tavily + DDG fallback)', 'tools/web_search.py'],
            ['execute_python', 'Run Python in sandbox', 'tools/code_executor.py'],
            ['count_conversation_tokens', 'Count tokens in conversation', 'tools/conversation_tokens.py'],
          ]}
        />

        <H2>How to Add a New Tool</H2>
        <P>Create a function in the tools/ folder, decorate it with @tool from LangChain, and register it:</P>
        <CodeBlock lang="python">{`from langchain_core.tools import tool

@tool
def my_new_tool(query: str) -> str:
    """Search for something cool.
    Use this when the user asks about cool things."""
    try:
        result = do_something(query)
        return f"Found: {result}"
    except Exception as e:
        return f"Error: {e}"`}</CodeBlock>
        <P>
          Then add it to <code className="text-primary-300">get_tools()</code> in{' '}
          <code className="text-primary-300">agent/graph.py</code>.
        </P>
      </>
    ),
  },

  /* ─── API Reference ─── */
  {
    slug: 'api',
    title: 'API Reference',
    icon: FileText,
    category: 'Reference',
    content: (
      <>
        <H2>Base URL</H2>
        <CodeBlock>http://localhost:8000/api/v1</CodeBlock>

        <H2>Chat</H2>

        <H3>POST /api/v1/chat</H3>
        <P>Send a message and receive a complete response.</P>
        <CodeBlock lang="json">{`// Request
{
  "message": "What is the capital of France?",
  "session_id": "optional-session-id"
}

// Response
{
  "response": "The capital of France is Paris.",
  "tools_used": [],
  "token_usage": {
    "prompt_tokens": 42,
    "completion_tokens": 12,
    "total_tokens": 54
  }
}`}</CodeBlock>

        <H3>POST /api/v1/chat/stream</H3>
        <P>Send a message and receive the response as Server-Sent Events (SSE).</P>
        <Table
          headers={['Event', 'Description']}
          rows={[
            ['token', 'Partial response token'],
            ['tool_start', 'Tool invocation started'],
            ['tool_end', 'Tool invocation completed'],
            ['status', 'Status update'],
            ['done', 'Final complete response with metadata'],
            ['error', 'Error occurred'],
          ]}
        />

        <H2>History</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/chat/history/{session_id}', 'Get conversation history'],
            ['DELETE', '/chat/history/{session_id}', 'Clear session history'],
            ['POST', '/chat/title', 'Generate title from first message'],
          ]}
        />

        <H2>Settings</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/settings', 'Get current LLM configuration'],
            ['PUT', '/settings', 'Update LLM configuration'],
          ]}
        />

        <H2>Memory</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/memory/facts', 'List all stored facts'],
            ['DELETE', '/memory/facts', 'Clear all facts'],
            ['GET', '/memory/episodes', 'List episodic summaries'],
            ['DELETE', '/memory/episodes', 'Clear all episodes'],
          ]}
        />

        <H2>Documents</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['POST', '/documents/upload', 'Upload document for RAG (max 50MB)'],
            ['GET', '/documents', 'List all documents'],
            ['GET', '/documents/{id}', 'Get document details'],
            ['DELETE', '/documents/{id}', 'Delete document and embeddings'],
          ]}
        />

        <H2>Scheduler</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/scheduler/tasks', 'List all scheduled tasks'],
            ['POST', '/scheduler/tasks', 'Create new task'],
            ['PUT', '/scheduler/tasks/{id}', 'Update task'],
            ['DELETE', '/scheduler/tasks/{id}', 'Delete task'],
            ['GET', '/scheduler/tasks/{id}/logs', 'Get execution logs'],
          ]}
        />

        <H2>Health</H2>
        <CodeBlock lang="bash">{`GET /health

# Response
{
  "status": "healthy",
  "subsystems": {
    "ollama": "connected",
    "database": "connected",
    "scheduler": "running",
    "memory": "ready"
  }
}`}</CodeBlock>
      </>
    ),
  },

  /* ─── Memory & RAG ─── */
  {
    slug: 'memory',
    title: 'Memory & RAG',
    icon: Brain,
    category: 'Core Concepts',
    content: (
      <>
        <H2>Memory System</H2>
        <P>
          NOVA uses two types of long-term memory, both stored in SQLite via aiosqlite:
        </P>

        <H3>Semantic Facts</H3>
        <P>
          Key-value pairs extracted by the LLM from conversations. Examples: user_name=Roberto,
          preferred_language=Python. Each fact is stored with a confidence score and source session.
        </P>

        <H3>Episodic Memory</H3>
        <P>
          Summaries of conversations including key topics and message counts. One episode is
          created per session.
        </P>

        <H3>Memory Extraction</H3>
        <P>
          Runs as a fire-and-forget task after every chat response where the conversation has
          4+ messages. The LLM extracts semantic facts and creates episode summaries in the background.
        </P>

        <H3>Context Injection</H3>
        <P>
          Before each agent turn, the system retrieves relevant facts and recent episodes,
          formats them into a memory_context string, and passes it as part of the agent state.
        </P>

        <H2>RAG Pipeline</H2>
        <CodeBlock lang="text">{`Upload document
      |
  PyMuPDF (PDF) / text loader
      |
  RecursiveCharacterTextSplitter
  (chunk_size=1000, overlap=200)
      |
  OllamaEmbeddings (nomic-embed-text)
      |
  ChromaDB (persistent at data/chroma/)
      |
  rag_search tool -> similarity search
      |
  Top chunks returned to agent`}</CodeBlock>

        <H3>Vector Store</H3>
        <P>
          ChromaDB runs in-process with persistent storage. Documents are embedded with
          nomic-embed-text (768 dimensions) via OllamaEmbeddings — fully offline, no API keys.
        </P>

        <H3>Document Ingestion</H3>
        <Table
          headers={['Format', 'Parser']}
          rows={[
            ['PDF', 'PyMuPDF'],
            ['TXT', 'Plain text'],
            ['MD', 'Markdown'],
          ]}
        />
        <P>Maximum file size: 50 MB. Chunks use RecursiveCharacterTextSplitter with size=1000, overlap=200.</P>
      </>
    ),
  },

  /* ─── Web Search ─── */
  {
    slug: 'web-search',
    title: 'Web Search',
    icon: Globe,
    category: 'Features',
    content: (
      <>
        <H2>Dual-Provider Architecture</H2>
        <UL
          items={[
            <>
              <strong className="text-surface-100">Primary: Tavily</strong> — High-quality
              results with summaries. Requires TAVILY_API_KEY.
            </>,
            <>
              <strong className="text-surface-100">Fallback: DuckDuckGo</strong> — Free, no
              API key needed. Activated when Tavily is unavailable.
            </>,
          ]}
        />

        <H2>Setup</H2>
        <P>DuckDuckGo works out of the box. For Tavily (recommended):</P>
        <CodeBlock lang="bash">{`# Get a key at https://tavily.com
# Add to your .env file:
TAVILY_API_KEY=your-api-key-here`}</CodeBlock>

        <H2>Result Format</H2>
        <P>Returns top 5 results, each with title, URL, and snippet.</P>
      </>
    ),
  },

  /* ─── Code Execution ─── */
  {
    slug: 'code-execution',
    title: 'Code Execution',
    icon: Code,
    category: 'Features',
    content: (
      <>
        <H2>Security Model</H2>
        <UL
          items={[
            <>
              <strong className="text-surface-100">Isolated Mode</strong> — Python -I flag
              (no user site-packages, no env vars)
            </>,
            <>
              <strong className="text-surface-100">Import Blocklist</strong> — os, subprocess,
              sys, shutil, socket, http, urllib, requests, pathlib, signal, ctypes, pickle, and more
            </>,
            <>
              <strong className="text-surface-100">Temp Working Directory</strong> — Each
              execution runs in a fresh temp directory
            </>,
            <>
              <strong className="text-surface-100">Timeout</strong> — Default 30 seconds,
              configurable via CODE_EXEC_TIMEOUT
            </>,
          ]}
        />

        <H2>Self-Healing</H2>
        <P>
          If code execution fails, the error is returned to the agent. The agent can fix the
          code and retry automatically as part of its ReAct loop.
        </P>

        <H2>Configuration</H2>
        <Table
          headers={['Variable', 'Values', 'Default']}
          rows={[
            ['CODE_EXEC_MODE', 'subprocess / disabled', 'subprocess'],
            ['CODE_EXEC_TIMEOUT', 'Seconds', '30'],
          ]}
        />
      </>
    ),
  },

  /* ─── Scheduler ─── */
  {
    slug: 'scheduler',
    title: 'Scheduled Tasks',
    icon: Clock,
    category: 'Features',
    content: (
      <>
        <H2>Overview</H2>
        <P>
          NOVA can execute agent prompts autonomously on a schedule using APScheduler with
          AsyncIOScheduler and SQLAlchemyJobStore for persistence.
        </P>

        <H2>Trigger Types</H2>
        <H3>Interval</H3>
        <Table
          headers={['Example', 'trigger_args']}
          rows={[
            ['Every 60 minutes', '{"minutes": 60}'],
            ['Every 2 hours', '{"hours": 2}'],
            ['Every 30 seconds', '{"seconds": 30}'],
          ]}
        />

        <H3>Cron</H3>
        <Table
          headers={['Example', 'trigger_args']}
          rows={[
            ['Daily at 9:00 AM', '{"hour": 9, "minute": 0}'],
            ['Weekdays at 8:00 AM', '{"day_of_week": "mon-fri", "hour": 8}'],
          ]}
        />

        <H2>Example Tasks</H2>
        <CodeBlock lang="json">{`// Daily summary at 9 AM
{
  "name": "Morning briefing",
  "prompt": "Give me a summary of today's top AI news",
  "trigger_type": "cron",
  "trigger_args": {"hour": 9, "minute": 0},
  "enabled": true
}

// Health check every 30 minutes
{
  "name": "System health check",
  "prompt": "Check system status and report any issues",
  "trigger_type": "interval",
  "trigger_args": {"minutes": 30},
  "enabled": true
}`}</CodeBlock>
      </>
    ),
  },

  /* ─── MCP ─── */
  {
    slug: 'mcp',
    title: 'MCP Integration',
    icon: Plug,
    category: 'Features',
    content: (
      <>
        <H2>Model Context Protocol</H2>
        <P>
          NOVA can act as both an MCP client (connecting to external tool servers) and an MCP
          server (exposing its own tools to other agents).
        </P>

        <H3>MCP Client</H3>
        <P>
          Configure MCP server connections in mcp_servers.json. Tools from external servers are
          discovered at startup and registered alongside built-in tools.
        </P>

        <H3>MCP Server</H3>
        <P>
          NOVA can expose its tools via the MCP protocol, allowing other MCP-compatible agents
          to use NOVA's capabilities.
        </P>

        <H2>Configuration</H2>
        <Table
          headers={['Variable', 'Default', 'Description']}
          rows={[
            ['MCP_TRANSPORT', 'http', 'MCP transport mode'],
          ]}
        />
      </>
    ),
  },

  /* ─── CLI Guide ─── */
  {
    slug: 'cli',
    title: 'CLI Guide',
    icon: Terminal,
    category: 'Reference',
    content: (
      <>
        <H2>Running the CLI</H2>
        <CodeBlock lang="bash">uv run nova</CodeBlock>
        <P>
          The CLI provides a REPL interface for interacting with NOVA directly in your terminal.
          All tools, memory, and capabilities are available in CLI mode.
        </P>

        <H2>Features</H2>
        <UL
          items={[
            'Colored output with syntax highlighting',
            'Token usage tracking per response',
            'Full tool support (web search, code execution, etc.)',
            'Session persistence across runs',
          ]}
        />
      </>
    ),
  },

  /* ─── Token Tracking ─── */
  {
    slug: 'tokens',
    title: 'Token Tracking',
    icon: Zap,
    category: 'Reference',
    content: (
      <>
        <H2>How NOVA Tracks Tokens</H2>
        <P>
          Every agent run records prompt tokens, completion tokens, and total tokens.
          These are stored in the agent state and included in every response.
        </P>
        <Table
          headers={['Metric', 'Description']}
          rows={[
            ['Prompt tokens', 'Tokens in your message + conversation history'],
            ['Completion tokens', 'Tokens the AI wrote in its response'],
            ['Total tokens', 'Prompt + completion'],
          ]}
        />

        <H2>Where You Can See Usage</H2>
        <UL
          items={[
            <>
              <strong className="text-surface-100">Web UI</strong> — Total tokens in sidebar,
              per-message counts on hover
            </>,
            <>
              <strong className="text-surface-100">CLI</strong> — Printed after each response
            </>,
            <>
              <strong className="text-surface-100">API</strong> — Included in the done SSE event
              and chat response
            </>,
          ]}
        />
      </>
    ),
  },

  /* ─── Tech Stack ─── */
  {
    slug: 'tech-stack',
    title: 'Tech Stack',
    icon: Database,
    category: 'Reference',
    content: (
      <>
        <H2>Backend</H2>
        <Table
          headers={['Technology', 'Purpose']}
          rows={[
            ['Python 3.11+', 'Core language'],
            ['LangChain / LangGraph', 'Agent framework + ReAct state graph'],
            ['Ollama', 'Local LLM inference (via OpenAI-compatible API)'],
            ['FastAPI + Uvicorn', 'REST API server with async support'],
            ['SQLite (aiosqlite)', 'Memory and scheduler persistence'],
            ['ChromaDB', 'Vector store for RAG embeddings'],
            ['APScheduler', 'Task scheduling engine'],
            ['structlog', 'Structured logging'],
            ['uv', 'Python package management'],
          ]}
        />

        <H2>Frontend</H2>
        <Table
          headers={['Technology', 'Purpose']}
          rows={[
            ['React 19', 'UI framework'],
            ['TypeScript', 'Type safety'],
            ['Vite 7', 'Build tool + dev server'],
            ['Tailwind CSS 4', 'Utility-first styling'],
            ['Framer Motion', 'Animations'],
            ['React Router', 'Client-side routing'],
            ['Lucide React', 'Icon library'],
          ]}
        />
      </>
    ),
  },

  /* ─── API Keys ─── */
  {
    slug: 'api-keys',
    title: 'API Keys & Auth',
    icon: Key,
    category: 'Reference',
    content: (
      <>
        <H2>API Key Format</H2>
        <P>
          NOVA API keys follow the format <code className="text-primary-300">nova-sk-*</code>.
          Keys are generated and managed through the authentication system.
        </P>

        <H2>Authentication Flow</H2>
        <UL
          items={[
            'JWT-based authentication for API access',
            'Optional AWS Cognito integration for user management',
            'Guest mode available for quick access without registration',
          ]}
        />
      </>
    ),
  },
];

/* ─── Sidebar Nav Item ─── */
function NavItem({
  doc,
  isActive,
  onClick,
}: {
  doc: DocSection;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = doc.icon;
  return (
    <button
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all ${
        isActive
          ? 'bg-primary-500/10 text-primary-300'
          : 'text-surface-400 hover:bg-surface-800/50 hover:text-surface-200'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{doc.title}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   DOCS PAGE
   ═══════════════════════════════════════════════════════ */
export function DocsPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const activeDoc = docs.find((d) => d.slug === slug) ?? docs[0];

  useEffect(() => {
    document.title = `${activeDoc.title} — NOVA Docs`;
    contentRef.current?.scrollTo(0, 0);
    setSidebarOpen(false);
  }, [activeDoc]);

  const categories = Array.from(new Set(docs.map((d) => d.category)));

  return (
    <div className="flex h-screen bg-surface-950 text-surface-100">
      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-surface-700/30 bg-surface-950 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-surface-700/30 px-5 py-4">
          <button
            onClick={() => navigate('/')}
            className="flex cursor-pointer items-center gap-2 text-surface-300 transition-colors hover:text-primary-400"
          >
            <ArrowLeft className="h-4 w-4" />
            <img src={`${import.meta.env.BASE_URL}ai-bot.png`} alt="NOVA" className="h-5 w-5" />
            <span className="text-sm font-bold text-primary-400 tracking-wider">NOVA</span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="cursor-pointer rounded-lg p-1.5 text-surface-400 hover:bg-surface-800 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="scrollbar-thin overflow-y-auto p-4" style={{ height: 'calc(100% - 65px)' }}>
          {categories.map((cat) => (
            <div key={cat} className="mb-6">
              <div className="mb-2 px-3 text-xs font-medium text-surface-500 uppercase tracking-widest">
                {cat}
              </div>
              <div className="space-y-0.5">
                {docs
                  .filter((d) => d.category === cat)
                  .map((doc) => (
                    <NavItem
                      key={doc.slug}
                      doc={doc}
                      isActive={doc.slug === activeDoc.slug}
                      onClick={() => navigate(`/docs/${doc.slug}`)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Main content ─── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-surface-700/30 px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="cursor-pointer rounded-lg p-1.5 text-surface-400 hover:bg-surface-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-surface-400">
              <BookOpen className="h-4 w-4" />
              <span>{activeDoc.category}</span>
              <span className="text-surface-600">/</span>
              <span className="text-surface-200">{activeDoc.title}</span>
            </div>
          </div>
          <a
            href="https://github.com/thisisrober/nova-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>

        {/* Content */}
        <div ref={contentRef} className="scrollbar-thin flex-1 overflow-y-auto">
          <motion.div
            key={activeDoc.slug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto max-w-3xl px-8 py-10"
          >
            {/* Page title */}
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10">
                <activeDoc.icon className="h-5 w-5 text-primary-400" />
              </div>
              <h1 className="text-3xl font-bold text-surface-100">{activeDoc.title}</h1>
            </div>

            {/* Content */}
            <div className="docs-content">{activeDoc.content}</div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
