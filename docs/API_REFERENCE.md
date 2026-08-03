# NOVA Agent API Reference

Base URL: `http://localhost:8000/api/v1`

All endpoints return JSON unless otherwise noted. Errors follow the format `{"detail": "error message"}`.

---

## Table of Contents

- [Chat](#chat)
- [Settings](#settings)
- [Ollama](#ollama)
- [Connections](#connections)
- [Memory](#memory)
- [Documents](#documents)
- [Scheduler](#scheduler)
- [Health](#health)

---

## Chat

### POST /api/v1/chat

Send a message and receive a complete response.

**Request Body:**

```json
{
  "message": "What is the capital of France?",
  "session_id": "optional-session-id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User message |
| `session_id` | string | No | Session identifier. Generated if omitted. |

**Response:**

```json
{
  "response": "The capital of France is Paris.",
  "tools_used": [],
  "token_usage": {
    "prompt_tokens": 42,
    "completion_tokens": 12,
    "total_tokens": 54
  },
  "total_tokens": 54,
  "iteration_count": 1
}
```

**Example:**

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the capital of France?", "session_id": "my-session"}'
```

---

### POST /api/v1/chat/stream

Send a message and receive the response as a Server-Sent Events (SSE) stream.

**Request Body:** Same as `POST /api/v1/chat`.

**SSE Event Types:**

| Event | Data | Description |
|-------|------|-------------|
| `token` | `{"content": "..."}` | Partial response token |
| `tool_start` | `{"tool": "calculator", "input": "..."}` | Tool invocation started |
| `tool_end` | `{"tool": "calculator", "output": "..."}` | Tool invocation completed |
| `status` | `{"message": "..."}` | Status update |
| `done` | `{"response": "...", "tools_used": [...], "token_usage": {...}, "total_tokens": N, "iteration_count": N}` | Final complete response |
| `error` | `{"detail": "..."}` | Error occurred |

**Example:**

```bash
curl -N -X POST http://localhost:8000/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain quantum computing", "session_id": "my-session"}'
```

---

### GET /api/v1/chat/history/{session_id}

Retrieve the conversation history for a session.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Session identifier |

**Response:**

```json
{
  "session_id": "my-session",
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"}
  ]
}
```

---

### DELETE /api/v1/chat/history/{session_id}

Clear the conversation history for a session.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Session identifier |

**Response:** `200 OK`

```json
{
  "detail": "Session history cleared"
}
```

---

### POST /api/v1/chat/stop/{session_id}

Cancel the in-flight generation for a session. Whatever was streamed before the
stop is kept as a partial assistant message, so the history matches what the
user saw on screen. `stopped` is `false` when there was nothing running.

**Response:** `200 OK`

```json
{
  "session_id": "abc123",
  "stopped": true
}
```

---

### GET /api/v1/chat/history

List every stored session with its title and last-activity timestamp.

---

### POST /api/v1/chat/title

Generate a short title from the first message of a conversation.

**Request Body:**

```json
{
  "message": "Can you help me write a Python script to parse CSV files?"
}
```

**Response:**

```json
{
  "title": "Python CSV Parsing Script"
}
```

---

## Settings

### GET /api/v1/settings

Get the current LLM configuration.

**Response:**

```json
{
  "model_name": "llama3",
  "temperature": 0.7,
  "ollama_base_url": "http://localhost:11434"
}
```

---

### PUT /api/v1/settings

Update LLM configuration. All fields are optional; only provided fields are updated.

**Request Body:**

```json
{
  "model_name": "mistral",
  "temperature": 0.5,
  "ollama_base_url": "http://localhost:11434"
}
```

**Response:** Updated settings object (same shape as GET).

---

## Ollama

### GET /api/v1/ollama/models

List all models available in the connected Ollama instance.

**Response:**

```json
{
  "models": [
    {"name": "llama3", "size": 4661224676, "modified_at": "2024-01-15T10:30:00Z"},
    {"name": "mistral", "size": 4109865472, "modified_at": "2024-01-10T08:00:00Z"}
  ]
}
```

### Other Ollama endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/ollama/status` | Whether the Ollama service is reachable |
| `POST` | `/api/v1/ollama/start` | Start the local Ollama service |
| `GET` | `/api/v1/ollama/catalog` | Browse pullable models |
| `POST` | `/api/v1/ollama/pull` | Pull a model (streamed progress) |
| `POST` | `/api/v1/providers/test` | Validate credentials for a provider |

---

## Connections

OAuth connections to Google, Microsoft and GitHub. See
[CONNECTIONS.md](CONNECTIONS.md) for the flow these endpoints implement.

### GET /api/v1/connections

Return the connection state of every supported provider.

**Response:**

```json
{
  "connections": [
    {
      "provider": "google",
      "label": "Google",
      "configured": true,
      "credentials_source": "database",
      "connected": true,
      "account_email": "you@gmail.com",
      "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
      "required_scopes": ["https://www.googleapis.com/auth/gmail.modify"],
      "expires_at": "2026-08-03T13:40:00Z",
      "redirect_uri": "http://localhost:5173/api/v1/connections/google/callback",
      "supports_auto_setup": false
    }
  ],
  "is_admin": true
}
```

`credentials_source` is `database` or `environment`, telling you where the app
credentials came from.

### POST /api/v1/connections/{provider}/authorize

Return the provider's authorization URL for the UI to open in a popup.

**Query parameters:** `lang` — UI language for the callback page (default `en`).

**Response:**

```json
{
  "provider": "google",
  "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "cf3f...9a1"
}
```

### GET /api/v1/connections/{provider}/callback

The provider's redirect target. Exchanges the code for tokens, stores them
encrypted and returns a small HTML page that closes the popup. Not called
directly by clients.

### DELETE /api/v1/connections/{provider}

Disconnect the account and delete NOVA's copy of its tokens. This does not
revoke the grant provider-side.

### Application setup (admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/v1/connections/{provider}/credentials` | Store the app `client_id` / `client_secret` (plus `tenant_id` for Microsoft) |
| `DELETE` | `/api/v1/connections/{provider}/credentials` | Forget the app credentials; every connection to that provider is dropped too |
| `POST` | `/api/v1/connections/github/setup/manifest` | Build the GitHub App manifest for one-click registration |
| `GET` | `/api/v1/connections/github/setup/callback` | GitHub's manifest redirect target |

Credential changes re-bind the agent's service tools immediately — no restart.

---

## Memory

### GET /api/v1/memory/facts

List all stored memory facts.

**Response:**

```json
{
  "facts": [
    {"id": "fact-1", "content": "User prefers Python over JavaScript", "created_at": "2024-01-15T10:00:00Z"}
  ]
}
```

---

### DELETE /api/v1/memory/facts

Clear all stored facts.

**Response:** `200 OK`

```json
{
  "detail": "All facts cleared"
}
```

---

### GET /api/v1/memory/episodes

List episodic memory summaries.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 20 | Maximum number of episodes to return |
| `offset` | int | 0 | Pagination offset |

**Response:**

```json
{
  "episodes": [
    {"id": "ep-1", "summary": "User asked about deploying Docker containers", "created_at": "2024-01-15T10:00:00Z"}
  ],
  "total": 1
}
```

---

### DELETE /api/v1/memory/episodes

Clear all episodic memories.

**Response:** `200 OK`

```json
{
  "detail": "All episodes cleared"
}
```

---

## Documents

### POST /api/v1/documents/upload

Upload a document for RAG indexing. The document is chunked and embedded automatically.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | Document file (.pdf, .txt, .md). Max 50 MB. |

**Response:** `201 Created`

```json
{
  "document_id": "doc-abc123",
  "filename": "report.pdf",
  "status": "processing",
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Example:**

```bash
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -F "file=@/path/to/report.pdf"
```

---

### GET /api/v1/documents

List all uploaded documents.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `processing`, `ready`, `error` |

**Response:**

```json
{
  "documents": [
    {
      "document_id": "doc-abc123",
      "filename": "report.pdf",
      "status": "ready",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### GET /api/v1/documents/{document_id}

Get details for a specific document.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `document_id` | string | Document identifier |

**Response:**

```json
{
  "document_id": "doc-abc123",
  "filename": "report.pdf",
  "status": "ready",
  "chunk_count": 42,
  "created_at": "2024-01-15T10:00:00Z"
}
```

---

### DELETE /api/v1/documents/{document_id}

Delete a document and its associated embeddings.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `document_id` | string | Document identifier |

**Response:** `200 OK`

```json
{
  "detail": "Document deleted"
}
```

---

## Scheduler

### GET /api/v1/scheduler/tasks

List all scheduled tasks.

**Response:**

```json
{
  "tasks": [
    {
      "task_id": "task-001",
      "name": "Daily Summary",
      "prompt": "Summarize today's news",
      "trigger_type": "cron",
      "trigger_args": {"hour": 9, "minute": 0},
      "enabled": true,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### POST /api/v1/scheduler/tasks

Create a new scheduled task.

**Request Body:**

```json
{
  "name": "Daily Summary",
  "prompt": "Summarize the top 5 tech news stories today",
  "trigger_type": "cron",
  "trigger_args": {"hour": 9, "minute": 0},
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable task name |
| `prompt` | string | Yes | Prompt sent to the agent on each execution |
| `trigger_type` | string | Yes | `"cron"` or `"interval"` |
| `trigger_args` | object | Yes | Trigger configuration (see below) |
| `enabled` | bool | No | Defaults to `true` |

**Trigger args for `cron`:** `{hour, minute, day_of_week, month, day}` (APScheduler cron fields).

**Trigger args for `interval`:** `{seconds?, minutes?, hours?, days?}`.

**Response:** `201 Created` -- the created task object.

**Example:**

```bash
curl -X POST http://localhost:8000/api/v1/scheduler/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly Check",
    "prompt": "Check system status and report anomalies",
    "trigger_type": "interval",
    "trigger_args": {"hours": 1},
    "enabled": true
  }'
```

---

### GET /api/v1/scheduler/tasks/{task_id}

Get a specific scheduled task.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task identifier |

**Response:** Task object (same shape as list items).

---

### PUT /api/v1/scheduler/tasks/{task_id}

Update a scheduled task. All fields are optional; only provided fields are updated.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task identifier |

**Request Body:**

```json
{
  "name": "Updated Name",
  "prompt": "New prompt text",
  "trigger_type": "interval",
  "trigger_args": {"minutes": 30},
  "enabled": false
}
```

**Response:** Updated task object.

---

### DELETE /api/v1/scheduler/tasks/{task_id}

Delete a scheduled task.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task identifier |

**Response:** `200 OK`

```json
{
  "detail": "Task deleted"
}
```

---

### GET /api/v1/scheduler/tasks/{task_id}/logs

Get execution logs for a scheduled task.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task identifier |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 20 | Maximum number of log entries |
| `offset` | int | 0 | Pagination offset |
| `status` | string | -- | Filter by execution status: `success`, `error` |

**Response:**

```json
{
  "logs": [
    {
      "log_id": "log-001",
      "task_id": "task-001",
      "status": "success",
      "response": "System status: all services operational.",
      "executed_at": "2024-01-15T09:00:00Z",
      "duration_ms": 3200
    }
  ],
  "total": 1
}
```

---

## Health

### GET /health

Health check endpoint. Returns the status of the API and its subsystems.

> Note: This endpoint is at the root level, not under `/api/v1`.

**Response:**

```json
{
  "status": "healthy",
  "subsystems": {
    "ollama": "connected",
    "database": "connected",
    "scheduler": "running",
    "memory": "ready"
  }
}
```
