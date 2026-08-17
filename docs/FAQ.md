# FAQ

Short answers to the questions that come up most. Each one links on to the
guide that covers it in full.

---

## Models & providers

### Do I need an API key to use NOVA?

No. By default NOVA runs a local model through Ollama, so there is nothing to
pay for and nothing to sign up to. API keys are only needed if you switch the
provider to OpenAI or Anthropic, or if you want [Tavily](WEB_SEARCH.md) web
search instead of the DuckDuckGo fallback.

### Which model should I use?

`gemma3:4b` is the default and runs comfortably on a laptop. Tool calling is
the part small models struggle with — if the agent misfires on tool arguments,
try a larger model, or a reasoning model (`qwen3`, `deepseek-r1`) with
`NOVA_REASONING=true`. Thinking costs seconds per turn but is measurably what
makes small models get dates and tool arguments right.

### Can I use OpenAI or Anthropic instead of Ollama?

Yes. Set `NOVA_PROVIDER=openai` or `anthropic` (or switch it in the settings
panel) and provide the matching API key. The graph, tools, memory and
connections are unchanged — only the model behind them differs.

### Is my data really private?

With the default local model, yes: conversations, memory and uploaded documents
live in SQLite and ChromaDB on your own disk, and there is no telemetry.
Anything that leaves the machine is something you switched on — a cloud model
provider, web search, an external MCP server, or a connected account.

---

## Connected services

See [CONNECTIONS.md](CONNECTIONS.md) for the full guide.

### Why do I have to register an app before connecting my Google account?

Because Google, Microsoft and GitHub all require an application with a
`client_id` / `client_secret` before granting access to anyone's mailbox or
files. It is a one-time step per *deployment*, not per user. GitHub can register
itself in one click, Microsoft takes a single script, and Google's console steps
are linked from the wizard.

### Where are my OAuth tokens stored?

Fernet-encrypted in the local SQLite database, under `NOVA_ENCRYPTION_KEY`. The
client secret never reaches the browser, and expired access tokens are refreshed
automatically. Disconnecting deletes NOVA's copy; to revoke access entirely,
also remove the app from the provider's own permissions page.

### The agent says it can't send an email even though I connected Google.

Tools are bound only for services you are signed into, and the graph rebuilds on
connect — but check the connections panel actually shows your account email
rather than a *Connect* button. If it does, the token may have been revoked
provider-side; the tool then returns `AUTH_EXPIRED:` and reconnecting fixes it.

### My Google connection stops working after about a week.

The OAuth consent screen is in **Testing** mode, which caps refresh-token
lifetime at 7 days. Publish the app in the Google Cloud Console, or reconnect.

### I get `redirect_uri_mismatch` when signing in.

The URI registered with the provider must match
`{NOVA_PUBLIC_URL}/api/v1/connections/{provider}/callback` character for
character, including scheme and port. Copy it from the wizard rather than
typing it.

### Can other apps use these integrations?

Yes — each service is a real MCP server (`nova-google`, `nova-microsoft`,
`nova-github`). Point Claude Desktop or your IDE at them with `make mcp-google`
and they work. NOVA's own agent binds the same functions in-process, so it does
not pay the transport cost. See [MCP.md](MCP.md).

---

## Behaviour & errors

### The agent invented a tool name and made up a date.

Almost always a context-window problem. Ollama defaults to 2048 tokens; NOVA's
system prompt plus the tool schemas exceed that many times over, so Ollama
truncates from the top and the model loses its instructions. `NOVA_NUM_CTX`
defaults to `16384` for this reason — do not lower it with services connected.

### Why does the agent ask which service to use?

Because more than one can do the job. With both Google and Microsoft connected,
"send an email" is genuinely ambiguous, so it asks. With only one connected it
just acts.

### Does NOVA remember things between sessions?

Yes. Facts are extracted from conversations in the background and injected into
later ones, alongside episodic summaries. Both are viewable and clearable from
the memory endpoints or the UI — see [MEMORY_RAG.md](MEMORY_RAG.md).

### Is the code the agent writes sandboxed?

It runs in a subprocess with restricted imports and a timeout. It is a guard
rail, not a jail — do not point it at untrusted input and expect containment.
See [CODE_EXECUTION.md](CODE_EXECUTION.md).

### Can I stop a response mid-generation?

Yes, from the UI, or via `POST /api/v1/chat/stop/{session_id}`.

---

## Project

### What does NOVA stand for?

**N**eural **O**rchestration & **V**irtual **A**gent. The orchestration half is
literal: a supervisor graph splits a request across specialised agents rather
than making one agent juggle every tool. It ships — see
[MULTI_AGENT.md](MULTI_AGENT.md).

### Does every message go through the multi-agent orchestrator?

Every turn enters it, but most come straight back out. Splitting "what time is
it?" across four agents is pure overhead, so the planner is allowed to decline,
and a plan of fewer than two tasks counts as declining — the turn then runs on
the single-agent graph, with the memory and knowledge-base context the workers
deliberately do not carry. When it does split, the chat shows the task graph
live: which agent is working, which tool it is calling, what each one cost.

### Where do I report a bug or follow development?

The [GitHub repository](https://github.com/thisisrobyn/nova-agent) and its
public project board. Releases are automated with release-please, so the
changelog always reflects what shipped.
