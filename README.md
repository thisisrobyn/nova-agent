<div align="center">

# NOVA — Neural Orchestration & Virtual Agent

An advanced conversational AI agent built with **LangGraph**, **LangChain**, **FastAPI** and **React**.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/thisisrober)
[![GitHub](https://img.shields.io/badge/GitHub-Follow-181717?style=for-the-badge&logo=github)](https://github.com/thisisrober)
[![Stars](https://img.shields.io/github/stars/thisisrober/nova-agent?style=for-the-badge&color=f59e0b)](https://github.com/thisisrober/nova-agent/stargazers)

</div>

## What is NOVA?

NOVA is a smart AI assistant that can chat with you, do math, read your files, search documentation, and more — all from a beautiful web interface or your terminal.

Think of it like having a helpful robot on your computer that understands what you ask and uses the right tool to answer.

## Features

- 🤖 **AI Chat** — talk to NOVA in natural language; it figures out what to do
- 🔧 **Built-in tools** — calculator, date/time, CSV/Excel/text file reader, directory listing
- 🌐 **MCP integration** — connects to external tool servers (e.g. LangChain Docs search)
- ⚡ **Real-time streaming** — see the response appear word-by-word as NOVA thinks
- 🎨 **Modern web UI** — React app with dark mode, markdown rendering, syntax-highlighted code blocks, file drag & drop, toast notifications
- ⚙️ **Runtime settings** — change the OpenAI model, temperature, or API key from the UI without restarting
- 📝 **Message editing** — edit previous messages and retry failed ones
- 🖥️ **CLI** — rich terminal interface with colored output and token stats
- 🔌 **MCP server** — expose NOVA's tools so other apps can use them
- 📊 **Token tracking** — per-message and cumulative token usage

## Quick start

```bash
# 1. Clone the project
git clone https://github.com/thisisrober/nova-agent/ && cd nova-agent

# 2. Create your config file
cp .env.example .env
# Edit .env and add your OpenAI API key (OPENAI_API_KEY=sk-proj-...)

# 3. Install everything
make install

# 4. Start both the API server and the web UI
make dev
```

Then open **http://localhost:5173** in your browser. That's it! 🎉

## How it works (the simple version)

```
You type a message
        ↓
   NOVA reads it
        ↓
   Does it need a tool?
     /         \
   Yes          No
    ↓            ↓
 Runs the      Writes a
  tool          reply
    ↓            ↓
 Goes back    Sends it
 to thinking   to you
```

1. You write something like _"What's 2^10?"_
2. NOVA's brain (an LLM like GPT-4.1) reads your message
3. It decides: _"I need the calculator tool for this"_
4. The calculator runs and returns `1024`
5. NOVA writes a nice reply: _"2¹⁰ = 1024"_
6. You see the answer appear in real time, word by word

## Project structure

```
nova-agent/
├── agent/                  # The brain
│   ├── graph.py            #   LangGraph agent loop (agent ↔ tools)
│   ├── nodes.py            #   LLM reasoning node & tool router
│   ├── state.py            #   Conversation state definition
│   ├── llm.py              #   OpenAI model setup & runtime config
│   └── cli.py              #   Terminal chat interface
├── tools/                  # Things NOVA can do
│   ├── calculator.py       #   Math expressions (2+2, sqrt(144), etc.)
│   ├── datetime_tool.py    #   Current time & timezone conversion
│   ├── files.py            #   Read CSV, Excel, text files, list folders
│   └── token_counter.py    #   Count tokens for cost tracking
├── nova_mcp/               # Model Context Protocol
│   ├── server.py           #   Expose NOVA's tools to other apps
│   └── client.py           #   Connect to external MCP tool servers
├── api/                    # REST API (backend)
│   ├── main.py             #   FastAPI app with MCP lifecycle
│   ├── routes.py           #   Chat, streaming, settings, history endpoints
│   └── schemas.py          #   Request/response models
├── ui/                     # Web interface (frontend)
│   ├── src/
│   │   ├── App.tsx         #   Main app shell
│   │   ├── components/     #   React components (chat, sidebar, UI)
│   │   ├── hooks/          #   useChat (streaming), useTheme
│   │   └── lib/            #   API client, types, utilities
│   ├── package.json        #   Node.js dependencies
│   └── vite.config.ts      #   Vite build config with API proxy
├── mcp_servers.json        # External MCP servers to connect to
├── pyproject.toml          # Python dependencies
├── Makefile                # All the commands you need
├── .env.example            # Template for your config
└── README.md               # You are here!
```

## Available commands

All commands live in the `Makefile`:

| Command | What it does |
|---------|-------------|
| `make install` | Install all Python and Node.js dependencies |
| `make setup` | Same as install + add the `nova` shortcut to your terminal |
| `make dev` | Start both the API and the web UI at the same time |
| `make api` | Start only the FastAPI backend (port 8000) |
| `make ui` | Start only the React frontend (port 5173) |
| `make run` | Run the terminal chat (CLI mode) |
| `make mcp` | Start the MCP server (stdio transport) |
| `make mcp-http` | Start the MCP server (HTTP transport) |
| `make test` | Run the test suite |
| `make clean` | Remove caches and build artifacts |

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```env
# Required — get your key at https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-...

# Optional — defaults shown
NOVA_MODEL_NAME=gpt-4.1-mini    # Which OpenAI model to use
NOVA_TEMPERATURE=0.7             # 0.0 = precise, 2.0 = very creative
MCP_TRANSPORT=http               # MCP server transport: stdio or http
```

You can also change the model, temperature, and API key **from the web UI** at any time (click the ⚙️ Settings button in the sidebar).

## External MCP servers

NOVA can connect to external tool servers using the [Model Context Protocol](https://modelcontextprotocol.io/). Configure them in `mcp_servers.json`:

```json
{
  "langchain-docs": {
    "url": "https://docs.langchain.com/mcp",
    "transport": "streamable_http"
  }
}
```

This gives NOVA a `SearchDocsByLangChain` tool — it can search the LangChain documentation to answer your questions about LangChain.

To add more MCP servers, just add entries to the JSON file and restart the API.

## Tools

| Tool | What it does | Example |
|------|-------------|---------|
| `calculator` | Evaluate math expressions | _"What's sqrt(144) + 3^2?"_ → 21 |
| `get_current_datetime` | Get current date and time | _"What time is it in Tokyo?"_ |
| `convert_timezone` | Convert between timezones | _"Convert 3pm EST to CET"_ |
| `list_directory` | List files in a folder | _"What files are in /home/user?"_ |
| `read_csv` | Read CSV files | _"Show me the sales.csv data"_ |
| `read_excel` | Read Excel files | _"Open report.xlsx"_ |
| `read_text_file` | Read text files | _"Read my notes.txt"_ |
| `SearchDocsByLangChain` | Search LangChain docs (MCP) | _"How do I use LangGraph?"_ |

## Tech stack

| Layer | Technology |
|-------|-----------|
| **LLM** | OpenAI GPT-4.1 / GPT-4.1-mini via `langchain-openai` |
| **Orchestration** | LangGraph + LangChain (ReAct agent pattern) |
| **Backend** | FastAPI + Uvicorn (async REST API with SSE streaming) |
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| **Animations** | Framer Motion |
| **Markdown** | react-markdown + remark-gfm + rehype-highlight |
| **MCP** | langchain-mcp-adapters (client) + FastMCP (server) |
| **Token counting** | tiktoken |
| **Package manager** | uv (Python) + npm (Node.js) |

## License

MIT

---

<div align="center">
  Made with ❤️ by <a href="https://thisisrober.es">thisisrober</a>
</div>
