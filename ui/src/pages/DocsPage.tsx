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
  Terminal,
  Zap,
  Menu,
  X,
  Github,
  FileText,
  Link2,
  HelpCircle,
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

/* ─── FAQ entry ───
   A question is a heading in its own right, so it gets the anchor treatment
   rather than being folded away behind a disclosure the reader has to hunt in. */
function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-surface-700/30 bg-surface-900/30 p-5">
      <h3 className="mb-2 font-semibold text-surface-100">{q}</h3>
      <div className="text-sm leading-relaxed text-surface-300 [&>p]:mb-2 [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
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
            ['NOVA_PROVIDER', 'ollama', 'LLM provider: ollama, openai or anthropic'],
            ['OLLAMA_BASE_URL', 'http://localhost:11434', 'Ollama server URL'],
            ['NOVA_MODEL_NAME', 'gemma3:4b', 'Chat model'],
            ['NOVA_TEMPERATURE', '0.7', 'Creativity (0-2)'],
            ['NOVA_NUM_CTX', '16384', 'Ollama context window — smaller values break tool calls'],
            ['NOVA_REASONING', '(model default)', 'Force thinking mode on/off (qwen3, deepseek-r1…)'],
            ['NOVA_PUBLIC_URL', 'http://localhost:5173', 'Base URL every OAuth redirect URI is built from'],
            ['NOVA_ENCRYPTION_KEY', '(auto-generated)', 'Fernet key encrypting connection tokens at rest'],
            ['TAVILY_API_KEY', '(none)', 'Optional: Tavily web search API key'],
            ['CODE_EXEC_MODE', 'subprocess', 'Code execution mode'],
            ['SCHEDULER_DB_PATH', 'data/nova_scheduler.db', 'Scheduler database path'],
          ]}
        />
        <P>
          OAuth client ids and secrets are <strong className="text-surface-100">not</strong> set
          here — enter them in the connections setup wizard, which stores them encrypted in the
          database.
        </P>

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
            ['Agent invents tool names', 'Context window too small — raise NOVA_NUM_CTX (16384 default)'],
            ['redirect_uri_mismatch', 'NOVA_PUBLIC_URL must match the URI registered with the provider'],
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

        <H2>9. Connected Services</H2>
        <P>
          Sign in once with Google, Microsoft or GitHub and the agent gains 28 further tools that
          act on your real account: mail, calendar, files, spreadsheets, documents, repositories,
          issues and pull requests. Tools are bound only for the services you are actually signed
          into, so a disconnected provider costs nothing.
        </P>
        <UL
          items={[
            'Sidebar → connections to sign in; the card flips to your account email',
            'OAuth tokens are encrypted at rest and refreshed automatically',
            <>See <strong className="text-surface-100">Connected Services</strong> for the full setup guide</>,
          ]}
        />
      </>
    ),
  },

  /* ─── FAQ ─── */
  {
    slug: 'faq',
    title: 'FAQ',
    icon: HelpCircle,
    category: 'Getting Started',
    content: (
      <>
        <P>
          Short answers to the questions that come up most. Each one links on to the page that
          covers it in full.
        </P>

        <H2>Models & providers</H2>

        <Q q="Do I need an API key to use NOVA?">
          <p>
            No. By default NOVA runs a local model through Ollama, so there is nothing to pay for
            and nothing to sign up to. API keys are only needed if you switch the provider to
            OpenAI or Anthropic in the settings panel, or if you want Tavily web search instead
            of the DuckDuckGo fallback.
          </p>
        </Q>

        <Q q="Which model should I use?">
          <p>
            gemma3:4b is the default and runs comfortably on a laptop. Tool calling is the part
            small models struggle with — if the agent misfires on tool arguments, try a larger
            model or a reasoning model (qwen3, deepseek-r1) with NOVA_REASONING=true. Thinking
            costs seconds per turn but is measurably what makes small models get dates and tool
            arguments right.
          </p>
        </Q>

        <Q q="Can I use OpenAI or Anthropic instead of Ollama?">
          <p>
            Yes. Set NOVA_PROVIDER to openai or anthropic (or switch it in the settings panel)
            and provide the matching API key. The graph, tools, memory and connections are
            unchanged — only the model behind them differs.
          </p>
        </Q>

        <Q q="Is my data really private?">
          <p>
            With the default local model, yes: conversations, memory and uploaded documents live
            in SQLite and ChromaDB on your own disk, and there is no telemetry. Anything that
            leaves the machine is something you switched on — a cloud model provider, web search,
            an external MCP server, or a connected Google/Microsoft/GitHub account.
          </p>
        </Q>

        <H2>Connected services</H2>

        <Q q="Why do I have to register an app before connecting my Google account?">
          <p>
            Because Google, Microsoft and GitHub all require an application with a client id and
            secret before granting access to anyone's mailbox or files. It is a one-time step per
            deployment, not per user. GitHub can register itself in one click, Microsoft takes a
            single script, and Google's console steps are linked from the wizard.
          </p>
        </Q>

        <Q q="Where are my OAuth tokens stored?">
          <p>
            Fernet-encrypted in the local SQLite database, under NOVA_ENCRYPTION_KEY. The client
            secret never reaches the browser, and expired access tokens are refreshed
            automatically. Disconnecting deletes NOVA's copy; to revoke access entirely, also
            remove the app from the provider's own permissions page.
          </p>
        </Q>

        <Q q="The agent says it can't send an email even though I connected Google.">
          <p>
            Tools are bound only for services you are signed into, and the graph rebuilds on
            connect — but check the connections panel actually shows your account email rather
            than a Connect button. If it does, the token may have been revoked provider-side; the
            tool then returns AUTH_EXPIRED and reconnecting fixes it.
          </p>
        </Q>

        <Q q="My Google connection stops working after about a week.">
          <p>
            The OAuth consent screen is in Testing mode, which caps refresh-token lifetime at 7
            days. Publish the app in the Google Cloud Console, or simply reconnect.
          </p>
        </Q>

        <Q q="I get redirect_uri_mismatch when signing in.">
          <p>
            The URI registered with the provider must match{' '}
            <code className="text-primary-300">
              {'{NOVA_PUBLIC_URL}/api/v1/connections/{provider}/callback'}
            </code>{' '}
            character for character, including scheme and port. Copy it from the wizard rather
            than typing it.
          </p>
        </Q>

        <Q q="Can other apps use these integrations?">
          <p>
            Yes — each service is a real MCP server (nova-google, nova-microsoft, nova-github).
            Point Claude Desktop or your IDE at them with make mcp-google and they work. NOVA's
            own agent binds the same functions in-process, so it does not pay the transport cost.
          </p>
        </Q>

        <H2>Behaviour & errors</H2>

        <Q q="The agent invented a tool name and made up a date.">
          <p>
            Almost always a context-window problem. Ollama defaults to 2048 tokens; NOVA's system
            prompt plus the tool schemas exceed that many times over, so Ollama truncates from the
            top and the model loses its instructions. NOVA_NUM_CTX defaults to 16384 for this
            reason — do not lower it with services connected.
          </p>
        </Q>

        <Q q="Why does the agent ask which service to use?">
          <p>
            Because more than one can do the job. With both Google and Microsoft connected, "send
            an email" is genuinely ambiguous, so it asks. With only one connected it just acts.
          </p>
        </Q>

        <Q q="Does NOVA remember things between sessions?">
          <p>
            Yes. Facts are extracted from conversations in the background and injected into later
            ones, alongside episodic summaries. Both are viewable and clearable from the memory
            endpoints or the UI.
          </p>
        </Q>

        <Q q="Is the code the agent writes sandboxed?">
          <p>
            It runs in a subprocess with restricted imports and a timeout. It is a guard rail, not
            a jail — do not point it at untrusted input and expect containment.
          </p>
        </Q>

        <H2>Project</H2>

        <Q q="What does NOVA stand for?">
          <p>
            Neural Orchestration &amp; Virtual Agent. The orchestration half is deliberate: the
            next milestone is multi-agent orchestration — a supervisor routing work to
            specialised agents rather than one agent juggling every tool.
          </p>
        </Q>

        <Q q="Where do I report a bug or follow development?">
          <p>
            The GitHub repository and its public project board, both linked from the landing page.
            Releases are automated with release-please, so the changelog always reflects what
            shipped.
          </p>
        </Q>
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
            ['GET', '/chat/history', 'List sessions'],
            ['GET', '/chat/history/{session_id}', 'Get conversation history'],
            ['DELETE', '/chat/history/{session_id}', 'Clear session history'],
            ['POST', '/chat/stop/{session_id}', 'Stop an in-flight generation'],
            ['POST', '/chat/title', 'Generate title from first message'],
          ]}
        />

        <H2>Settings & providers</H2>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/settings', 'Get current LLM configuration'],
            ['PUT', '/settings', 'Update LLM configuration'],
            ['POST', '/providers/test', 'Validate credentials for a provider'],
            ['GET', '/ollama/models', 'List locally installed models'],
            ['GET', '/ollama/status', 'Whether the Ollama service is reachable'],
            ['POST', '/ollama/start', 'Start the local Ollama service'],
            ['GET', '/ollama/catalog', 'Browse pullable models'],
            ['POST', '/ollama/pull', 'Pull a model (streamed progress)'],
          ]}
        />

        <H2>Connections</H2>
        <P>
          OAuth connections to Google, Microsoft and GitHub. See{' '}
          <strong className="text-surface-100">Connected Services</strong> for the flow these
          endpoints implement.
        </P>
        <Table
          headers={['Method', 'Endpoint', 'Description']}
          rows={[
            ['GET', '/connections', 'State of every provider: configured, connected, account, scopes'],
            ['POST', '/connections/{provider}/authorize', 'Get the authorization URL for the UI popup'],
            ['GET', '/connections/{provider}/callback', 'OAuth redirect target — exchanges code for tokens'],
            ['DELETE', '/connections/{provider}', 'Disconnect the account and delete its tokens'],
            ['PUT', '/connections/{provider}/credentials', 'Store the app client id/secret (admin)'],
            ['DELETE', '/connections/{provider}/credentials', 'Forget the app credentials and drop connections (admin)'],
            ['POST', '/connections/github/setup/manifest', 'Build the GitHub App manifest for one-click registration'],
            ['GET', '/connections/github/setup/callback', 'GitHub manifest redirect target'],
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
            ['GET', '/scheduler/tasks/{id}', 'Get a single task'],
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
          MCP is an open standard that lets AI tools talk to each other — one standard plug that
          works everywhere. NOVA uses it in three ways: as a client, as a server, and as one
          server per connected account.
        </P>

        <H2>1. NOVA as MCP client</H2>
        <P>
          Configure external servers in <code className="text-primary-300">mcp_servers.json</code>{' '}
          at the project root. They are connected at API startup and their tools are registered
          alongside the built-in ones.
        </P>
        <CodeBlock lang="json">{`{
  "langchain-docs": {
    "url": "https://docs.langchain.com/mcp",
    "transport": "streamable_http"
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
    "transport": "stdio"
  }
}`}</CodeBlock>
        <P>
          <code className="text-primary-300">nova_mcp/client.py</code> reads the config and returns
          LangChain tools; <code className="text-primary-300">api/main.py</code> registers them in
          the graph.
        </P>

        <H2>2. NOVA as MCP server</H2>
        <P>
          NOVA exposes its own tools so other MCP-compatible agents (Claude Desktop, IDE plugins)
          can use them: <code className="text-primary-300">calculator</code>,{' '}
          <code className="text-primary-300">get_current_datetime</code>,{' '}
          <code className="text-primary-300">convert_timezone</code>,{' '}
          <code className="text-primary-300">read_csv</code>,{' '}
          <code className="text-primary-300">read_excel</code>,{' '}
          <code className="text-primary-300">read_text_file</code>.
        </P>
        <CodeBlock lang="bash">{`make mcp        # stdio — local integrations
make mcp-http   # http  — remote access`}</CodeBlock>

        <H2>3. Connected-service servers</H2>
        <P>
          Three further servers act on the user's own accounts. They read the OAuth tokens stored
          by the connections panel, so there is nothing to configure per server.
        </P>
        <Table
          headers={['Server', 'Module', 'Tools']}
          rows={[
            ['nova-google', 'nova_mcp/servers/google.py', 'Gmail list/read/send, Calendar list/create/update/delete, Drive list, Sheets create/append, Docs create (11)'],
            ['nova-microsoft', 'nova_mcp/servers/microsoft.py', 'Outlook list/read/send, Calendar list/create/update/delete, OneDrive list (8)'],
            ['nova-github', 'nova_mcp/servers/github.py', 'Repos list/create, file read, commits, issues list/read/create/comment, pull requests (9)'],
          ]}
        />
        <CodeBlock lang="bash">{`make mcp-google
make mcp-microsoft
make mcp-github`}</CodeBlock>

        <H3>Why the agent does not use MCP for them</H3>
        <P>
          NOVA's agent runs in the same process, so routing its calls through an MCP transport
          would add a process spawn and serialisation to every tool call for no benefit.{' '}
          <code className="text-primary-300">nova_mcp/builtin.py</code> binds the very same
          functions as LangChain tools — one definition per capability, registered twice.
        </P>
        <CodeBlock>{`nova_mcp/servers/google.py::TOOLS
        ├── mcp.tool()       → external MCP clients (stdio / SSE)
        └── nova_mcp.builtin → LangChain tools for NOVA's own graph`}</CodeBlock>
        <P>
          Only services you are signed into contribute tools. This is a hard requirement, not an
          optimisation: tool schemas are large, and two dozen of them fill a local model's context
          window on their own.{' '}
          <code className="text-primary-300">reload_service_tools()</code> re-binds them and
          rebuilds the graph on connect, disconnect and credential changes — no restart.
        </P>

        <H2>Configuration</H2>
        <Table
          headers={['Variable', 'Default', 'Description']}
          rows={[
            ['MCP_TRANSPORT', 'http', 'Transport for NOVA’s own server: stdio or http'],
            ['NOVA_NUM_CTX', '16384', 'Context window; below this, tool schemas get truncated'],
          ]}
        />
      </>
    ),
  },

  /* ─── Connected Services ─── */
  {
    slug: 'connections',
    title: 'Connected Services',
    icon: Link2,
    category: 'Features',
    content: (
      <>
        <H2>What this gives you</H2>
        <P>
          NOVA can act on your behalf in Google, Microsoft and GitHub. You sign in once from the
          UI (sidebar → <strong className="text-surface-100">connections</strong>), NOVA stores
          the resulting OAuth tokens, and the per-service MCP servers reuse them.
        </P>
        <Table
          headers={['Service', 'Surfaces', 'What the agent can do']}
          rows={[
            ['Google', 'Gmail, Calendar, Drive, Sheets, Docs', 'List/read/send mail, create-update-delete events, list Drive files, create spreadsheets and documents (11 tools)'],
            ['Microsoft', 'Outlook, Calendar, OneDrive', 'List/read/send mail, create-update-delete events, browse OneDrive (8 tools)'],
            ['GitHub', 'Repos, Issues, Pull requests', 'List/create repos, read files and commits, list-read-create-comment issues, list pull requests (9 tools)'],
          ]}
        />

        <H2>Two roles, do not mix them up</H2>
        <Table
          headers={['Role', 'What they do', 'How often']}
          rows={[
            ['User', 'Opens the panel, clicks Connect, signs in. Nothing else.', 'Once per account'],
            ['Operator', 'Registers NOVA as an application with each provider.', 'Once per deployment'],
          ]}
        />
        <P>
          The operator step cannot be skipped: all three providers require an application with a
          client id and secret before they grant access to anyone's mailbox or files. It is a
          one-time cost, and the setup wizard makes it as short as each provider allows — GitHub
          can be registered in a single click.
        </P>

        <H2>How the flow works</H2>
        <CodeBlock>{`UI  ──POST /api/v1/connections/{provider}/authorize──►  API
UI  ◄─────────────── authorize_url ──────────────────  API
UI  ──opens popup──►  provider consent screen
                          │  user approves
                          ▼
    provider ──redirect──►  GET /api/v1/connections/{provider}/callback
                                    │  code → access_token + refresh_token
                                    ▼
                            connections/store.py  (encrypted SQLite)`}</CodeBlock>
        <UL
          items={[
            'The client secret never reaches the browser — the code-for-token exchange is server-side.',
            'App credentials and per-user tokens are Fernet-encrypted before hitting SQLite.',
            'Expired access tokens are refreshed automatically; callers never deal with expiry.',
          ]}
        />

        <H2>Before you start</H2>
        <P>Set the public base URL — every redirect URI is derived from it:</P>
        <CodeBlock lang="dotenv">{`NOVA_PUBLIC_URL=http://localhost:5173`}</CodeBlock>
        <P>
          Use <code className="text-primary-300">http://localhost:5173</code> in development (the
          Vite dev server proxies <code className="text-primary-300">/api</code>, so the OAuth
          popup shares an origin with the UI). In production use the real domain.
        </P>
        <P>Then set a token-encryption key — otherwise one is generated into data/.connection_key:</P>
        <CodeBlock lang="bash">{`uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`}</CodeBlock>
        <CodeBlock lang="dotenv">{`NOVA_ENCRYPTION_KEY=<the generated key>`}</CodeBlock>
        <P>
          Changing this key invalidates every stored credential — you will have to reconnect.
          Client ids and secrets do <strong className="text-surface-100">not</strong> go in .env:
          enter them in the wizard, where they are stored encrypted and take effect with no
          restart.
        </P>

        <H2>1. GitHub — one click</H2>
        <P>
          GitHub is the only provider that lets an application register itself, through the app
          manifest flow.
        </P>
        <UL
          items={[
            'Connections panel → GitHub → Setup required',
            'Optionally rename the app (names are unique across GitHub) and pick an owning organization',
            'Click Create the GitHub App — GitHub opens pre-filled with permissions and callback URL',
            'Confirm, and NOVA stores the credentials on its own',
          ]}
        />
        <P>
          The app requests contents, issues, pull_requests, administration (to create repos) and
          metadata. A GitHub App is used rather than an OAuth App because it can be registered
          from a manifest and grants per-repository access with short-lived tokens.
        </P>

        <H2>2. Microsoft — one command</H2>
        <P>With the Azure CLI installed and az login done:</P>
        <CodeBlock lang="powershell">{`./scripts/setup_microsoft_app.ps1 -PublicUrl http://localhost:5173`}</CodeBlock>
        <P>
          The script creates the app registration, adds the delegated Graph permissions
          (User.Read, Mail.Read, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, offline_access),
          generates a secret and prints the values to paste into the wizard. To do it by hand:
          Azure Portal → Microsoft Entra ID → App registrations → New registration, redirect URI
          type <strong className="text-surface-100">Web</strong> pointing at
          /api/v1/connections/microsoft/callback.
        </P>
        <P>
          <strong className="text-surface-100">Gotcha:</strong> setting a specific tenant id in
          the wizard blocks personal @outlook.com accounts. Leave it as{' '}
          <code className="text-primary-300">common</code> unless that is what you want.
        </P>

        <H2>3. Google — guided, but manual</H2>
        <P>
          Google exposes no API for creating OAuth clients, so this one is done in the console —
          the wizard links straight to each page.
        </P>
        <UL
          items={[
            'Create or pick a project in the Google Cloud Console',
            'APIs & Services → Library — enable Gmail, Calendar, Drive, Sheets and Docs APIs',
            'OAuth consent screen — External, add the scopes listed in the wizard, add yourself under Test users',
            'Credentials → OAuth client ID → Web application, redirect URI /api/v1/connections/google/callback',
            'Paste the client id and secret into the wizard',
          ]}
        />
        <P>
          <strong className="text-surface-100">Gotchas:</strong> Gmail and Drive scopes are
          restricted — while the consent screen is in Testing mode only listed test users can
          connect and refresh tokens expire after 7 days. Google only returns a refresh token
          when access_type=offline and prompt=consent are sent; NOVA always sends both.
        </P>

        <H2>Verify</H2>
        <CodeBlock lang="bash">{`curl http://localhost:8000/api/v1/connections`}</CodeBlock>
        <P>
          Each configured provider shows a <strong className="text-surface-100">Connect</strong>{' '}
          button instead of the amber <em>Setup required</em> badge. After signing in, the card
          flips to the connected account's email.{' '}
          <code className="text-primary-300">credentials_source</code> tells you whether a
          provider is configured from the database or the environment.
        </P>

        <H2>What happens when a service is not connected</H2>
        <P>
          Only services you are signed into contribute tools — this keeps the model's context
          window usable. The live connection state is injected into the system prompt each turn,
          so a disconnected service makes the agent say so plainly instead of improvising. As a
          second line of defence, every tool resolves its access token at call time and returns a
          NOT_CONNECTED or AUTH_EXPIRED instruction if the grant was revoked.
        </P>
        <P>
          With both Google and Microsoft connected, a bare "send an email" makes the agent ask
          which service to use; with only one connected it just uses that one.
        </P>

        <H2>Troubleshooting</H2>
        <Table
          headers={['Symptom', 'Cause']}
          rows={[
            ['redirect_uri_mismatch', 'The registered URI differs from {NOVA_PUBLIC_URL}/api/v1/connections/{provider}/callback — they must match character for character.'],
            ['Amber "Setup required" badge', 'No credentials stored for that provider yet. Open the wizard.'],
            ['GitHub says the app name is taken', 'App names are unique across all of GitHub. Change it and retry.'],
            ['"This authorization link has expired"', 'The state lives in memory for 10 minutes; an API restart mid-flow invalidates it. Retry.'],
            ['Card stays disconnected after sign-in', 'The popup landed on a different origin than the UI. Set NOVA_PUBLIC_URL=http://localhost:5173.'],
            ['Everything disconnects after a redeploy', 'NOVA_ENCRYPTION_KEY changed, or data/.connection_key was lost. Re-enter credentials.'],
            ['Google connection dies after ~7 days', 'The consent screen is in Testing mode, which caps refresh-token lifetime. Publish the app, or reconnect.'],
            ['Agent invents tool names like "google:calendar"', 'Context window too small — the tool schemas were truncated. Raise NOVA_NUM_CTX.'],
          ]}
        />

        <H2>Security notes</H2>
        <UL
          items={[
            'Client secrets are encrypted in the database and never sent to the browser — the API only reports whether a provider is configured.',
            'Access and refresh tokens are encrypted the same way, so the database file alone is not enough to impersonate anyone.',
            'state is a 32-byte single-use value with a 10-minute TTL, protecting both the sign-in and GitHub manifest callbacks against CSRF.',
            'Clearing a provider’s credentials also drops every stored connection to it, since those tokens could no longer be refreshed.',
            'Disconnecting deletes NOVA’s local copy of the tokens. To revoke access entirely, also remove the app from the provider’s account permissions page.',
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
