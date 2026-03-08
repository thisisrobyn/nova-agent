# CLI Guide

## What is the CLI?

The CLI (Command Line Interface) lets you chat with NOVA directly in your terminal — no browser needed.

## Setup

```bash
make setup       # Install + add 'nova' command
source ~/.bashrc # Reload your terminal
```

## Usage

```bash
nova
```

You'll see a welcome header. Type your message and press Enter. The agent will think, maybe use some tools, and reply.

### Special commands

| Command | What it does |
|---------|-------------|
| `exit` or `quit` | Stop the agent |
| `Ctrl+C` | Interrupt the current response |

## What you'll see

```
╔═══════════════════════════════════════╗
║          NOVA Agent v0.1.0           ║
║   Neural Orchestration & Virtual Agent ║
╚═══════════════════════════════════════╝

You: What's 2^10?

🔄 Processing...

NOVA: 2^10 = 1024.

  Tokens: prompt=45 | completion=8 | total=53
  Session total: 53 tokens

You: exit

👋 Goodbye!
```

## Features

- **Colored output** — different colors for headers, responses, tokens, errors
- **Token tracking** — see how many tokens each message uses
- **Session stats** — cumulative token count across the conversation
- **Tool indicators** — shows when the agent uses a tool
- **Works anywhere** — since it reads your current directory, you can ask about files in any folder

## Files

| File | What it does |
|------|-------------|
| `agent/cli.py` | Main REPL loop |
| `agent/ui_formatter.py` | Colors, boxes, formatting |
