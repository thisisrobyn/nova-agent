# Setup Guide

## What you need before starting

- **Python 3.11 or newer** — check with `python3 --version`
- **Node.js 18 or newer** — check with `node --version`
- **uv** — Python package manager. Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **An OpenAI API key** — get one at https://platform.openai.com/api-keys

## Step-by-step installation

### 1. Clone the project

```bash
git clone https://github.com/thisisrober/nova-agent.git
cd nova-agent
```

### 2. Create your configuration file

```bash
cp .env.example .env
```

Open `.env` in any text editor and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-proj-your-key-here
```

That's the only required value. Everything else has sensible defaults.

### 3. Install dependencies

```bash
make install
```

This does two things:
- Installs all Python packages (via `uv sync`)
- Installs all JavaScript packages for the web UI (via `npm install`)

### 4. Start the app

```bash
make dev
```

This starts **two servers** at the same time:
- **API server** at http://localhost:8000 (the backend brain)
- **Web UI** at http://localhost:5173 (the frontend you interact with)

Open http://localhost:5173 in your browser and start chatting!

## Other ways to run NOVA

### Web UI + API (recommended)

```bash
make dev    # Starts both servers
```

### Terminal mode (CLI)

If you prefer the command line:

```bash
make setup  # One-time: adds the "nova" command to your terminal
source ~/.bashrc
nova        # Start chatting in your terminal
```

### Just the API

```bash
make api    # Only the backend on port 8000
```

### Just the frontend

```bash
make ui     # Only the React dev server on port 5173
```

## Optional configuration

All settings go in your `.env` file:

| Variable | Default | What it does |
|----------|---------|-------------|
| `OPENAI_API_KEY` | _(none)_ | **Required.** Your OpenAI API key |
| `NOVA_MODEL_NAME` | `gpt-4.1-mini` | Which AI model to use |
| `NOVA_TEMPERATURE` | `0.7` | How creative the AI is (0 = precise, 2 = wild) |
| `MCP_TRANSPORT` | `http` | How the MCP server communicates (`stdio` or `http`) |

> **Tip:** You can also change the model, temperature, and API key from the web UI's Settings panel without editing files.

## Connecting external MCP servers

Edit `mcp_servers.json` in the project root to add external tool servers:

```json
{
  "langchain-docs": {
    "url": "https://docs.langchain.com/mcp",
    "transport": "streamable_http"
  }
}
```

Restart the API server after editing this file.

## Troubleshooting

| Problem | Solution |
|---------|---------|
| `command not found: nova` | Run `source ~/.bashrc` or open a new terminal |
| `OPENAI_API_KEY not set` | Make sure your `.env` file has the key and it's not empty |
| Page is blank / white screen | Open browser dev tools (F12) and check the Console tab |
| `make dev` fails | Try `make install` first, then `make dev` again |
| Port already in use | Another process is using port 8000 or 5173. Stop it or change the port |
