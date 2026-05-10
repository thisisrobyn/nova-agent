# Scheduled Tasks

## Overview

NOVA can execute agent prompts autonomously on a schedule. The scheduler uses APScheduler 3.10.x with `AsyncIOScheduler` and `SQLAlchemyJobStore` for persistence, allowing tasks to survive restarts.

## Architecture

- **SchedulerManager** wraps APScheduler. Accessed as a singleton via `scheduler/__init__.py` `get_scheduler()`.
- Task metadata is stored in SQLite (`data/nova_scheduler.db`), separate from the memory database.
- Two tables:
  - `scheduled_tasks` -- CRUD metadata (name, prompt, trigger config, enabled flag).
  - `task_executions` -- execution logs (status, duration, result, errors, token usage).
- On API startup, the scheduler starts via the FastAPI lifespan handler. On shutdown, it stops gracefully.
- Tasks reload from the database on restart.

## Trigger Types

### `interval`

Runs every N units of time. Pass the interval as `trigger_args`:

| Example | trigger_args |
|---------|-------------|
| Every 60 minutes | `{"minutes": 60}` |
| Every 2 hours | `{"hours": 2}` |
| Every 30 seconds | `{"seconds": 30}` |

### `cron`

Standard cron-style schedule. Pass cron fields as `trigger_args`:

| Example | trigger_args |
|---------|-------------|
| Daily at 9:00 AM | `{"hour": 9, "minute": 0}` |
| Weekdays at 8:00 AM | `{"day_of_week": "mon-fri", "hour": 8}` |

## Execution

Each scheduled run calls `run_agent_once(prompt)`, which executes the full agent graph with all available tools. The result is stored as a `TaskExecution` record with:

- **status**: `running`, `success`, `error`, or `timeout`
- **duration**: wall-clock execution time
- **result_summary**: truncated output from the agent
- **error**: error message (if status is `error`)
- **tokens_used**: total tokens consumed during the run

## API Endpoints

All endpoints are under `/api/v1/scheduler/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List all scheduled tasks |
| POST | `/tasks` | Create a new task |
| GET | `/tasks/{id}` | Get a single task |
| PUT | `/tasks/{id}` | Partial update of a task |
| DELETE | `/tasks/{id}` | Delete a task |
| GET | `/tasks/{id}/logs` | Execution history (query params: `limit`, `offset`, `status`) |

### Create task request body

```json
{
  "name": "Daily summary",
  "prompt": "Summarize the latest news about AI",
  "trigger_type": "cron",
  "trigger_args": {"hour": 9, "minute": 0},
  "enabled": true
}
```

## UI

The scheduler panel is accessible from the sidebar and includes:

- Task list with enable/disable toggle per task
- Execution log viewer for each task
- New task form with trigger type selection (interval or cron)

## Examples

**Daily summary at 9 AM:**

```json
{
  "name": "Morning briefing",
  "prompt": "Give me a summary of today's top AI news",
  "trigger_type": "cron",
  "trigger_args": {"hour": 9, "minute": 0},
  "enabled": true
}
```

**Health check every 30 minutes:**

```json
{
  "name": "System health check",
  "prompt": "Check system status and report any issues",
  "trigger_type": "interval",
  "trigger_args": {"minutes": 30},
  "enabled": true
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_DB_PATH` | `data/nova_scheduler.db` | Path to the scheduler SQLite database |
