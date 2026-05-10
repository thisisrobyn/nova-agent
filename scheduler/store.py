"""SQLite store for scheduled task metadata and execution logs.

Separate from the memory database -- uses ``data/nova_scheduler.db``.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiosqlite
import structlog

from scheduler.models import ScheduledTask, TaskExecution

logger = structlog.stdlib.get_logger(__name__)

_DEFAULT_DB_PATH = os.path.join("data", "nova_scheduler.db")
_db_path: str = os.getenv("SCHEDULER_DB_PATH", _DEFAULT_DB_PATH)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    prompt        TEXT NOT NULL,
    trigger_type  TEXT NOT NULL,
    trigger_args  TEXT NOT NULL,
    enabled       INTEGER DEFAULT 1,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at   TIMESTAMP,
    next_run_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_executions (
    id               TEXT PRIMARY KEY,
    task_id          TEXT NOT NULL,
    started_at       TIMESTAMP NOT NULL,
    finished_at      TIMESTAMP,
    duration_seconds REAL,
    status           TEXT NOT NULL DEFAULT 'running',
    result_summary   TEXT,
    error            TEXT,
    tokens_used      INTEGER,
    FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);
"""


class SchedulerStore:
    """Async CRUD for scheduled tasks and execution logs."""

    async def init_db(self) -> None:
        """Create tables if they don't exist."""
        Path(_db_path).parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(_db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL;")
            await db.execute("PRAGMA foreign_keys=ON;")
            await db.executescript(_SCHEMA_SQL)
            await db.commit()
        logger.info("scheduler database initialized", path=_db_path)

    async def _get_db(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(_db_path)
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON;")
        return db

    # ── Scheduled Tasks CRUD ─────────────────────────────────────

    async def create_task(self, task: ScheduledTask) -> ScheduledTask:
        db = await self._get_db()
        try:
            await db.execute(
                """INSERT INTO scheduled_tasks
                   (id, name, prompt, trigger_type, trigger_args, enabled)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (task.id, task.name, task.prompt, task.trigger_type,
                 json.dumps(task.trigger_args), int(task.enabled)),
            )
            await db.commit()
            return task
        finally:
            await db.close()

    async def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        db = await self._get_db()
        try:
            cursor = await db.execute(
                "SELECT * FROM scheduled_tasks WHERE id = ?", (task_id,)
            )
            row = await cursor.fetchone()
            return self._row_to_task(row) if row else None
        finally:
            await db.close()

    async def list_tasks(self) -> list[ScheduledTask]:
        db = await self._get_db()
        try:
            cursor = await db.execute(
                "SELECT * FROM scheduled_tasks ORDER BY created_at DESC"
            )
            rows = await cursor.fetchall()
            return [self._row_to_task(r) for r in rows]
        finally:
            await db.close()

    async def update_task(self, task_id: str, **fields) -> Optional[ScheduledTask]:
        db = await self._get_db()
        try:
            sets: list[str] = []
            vals: list = []
            for k, v in fields.items():
                if k == "trigger_args":
                    v = json.dumps(v)
                elif k == "enabled":
                    v = int(v)
                sets.append(f"{k} = ?")
                vals.append(v)
            sets.append("updated_at = CURRENT_TIMESTAMP")
            vals.append(task_id)

            await db.execute(
                f"UPDATE scheduled_tasks SET {', '.join(sets)} WHERE id = ?",
                vals,
            )
            await db.commit()
            return await self.get_task(task_id)
        finally:
            await db.close()

    async def delete_task(self, task_id: str) -> bool:
        db = await self._get_db()
        try:
            cursor = await db.execute(
                "DELETE FROM scheduled_tasks WHERE id = ?", (task_id,)
            )
            await db.commit()
            return cursor.rowcount > 0
        finally:
            await db.close()

    async def update_last_run(self, task_id: str, ts: datetime) -> None:
        db = await self._get_db()
        try:
            await db.execute(
                "UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?",
                (ts.isoformat(), task_id),
            )
            await db.commit()
        finally:
            await db.close()

    # ── Task Executions ──────────────────────────────────────────

    async def save_execution(self, execution: TaskExecution) -> None:
        db = await self._get_db()
        try:
            await db.execute(
                """INSERT INTO task_executions
                   (id, task_id, started_at, finished_at, duration_seconds,
                    status, result_summary, error, tokens_used)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (execution.id, execution.task_id,
                 execution.started_at.isoformat(),
                 execution.finished_at.isoformat() if execution.finished_at else None,
                 execution.duration_seconds, execution.status,
                 execution.result_summary, execution.error, execution.tokens_used),
            )
            await db.commit()
        finally:
            await db.close()

    async def update_execution(self, exec_id: str, **fields) -> None:
        db = await self._get_db()
        try:
            sets = []
            vals = []
            for k, v in fields.items():
                if isinstance(v, datetime):
                    v = v.isoformat()
                sets.append(f"{k} = ?")
                vals.append(v)
            vals.append(exec_id)
            await db.execute(
                f"UPDATE task_executions SET {', '.join(sets)} WHERE id = ?",
                vals,
            )
            await db.commit()
        finally:
            await db.close()

    async def get_task_logs(
        self, task_id: str, limit: int = 20, offset: int = 0,
        status: Optional[str] = None,
    ) -> list[TaskExecution]:
        db = await self._get_db()
        try:
            if status:
                cursor = await db.execute(
                    """SELECT * FROM task_executions
                       WHERE task_id = ? AND status = ?
                       ORDER BY started_at DESC LIMIT ? OFFSET ?""",
                    (task_id, status, limit, offset),
                )
            else:
                cursor = await db.execute(
                    """SELECT * FROM task_executions
                       WHERE task_id = ?
                       ORDER BY started_at DESC LIMIT ? OFFSET ?""",
                    (task_id, limit, offset),
                )
            rows = await cursor.fetchall()
            return [self._row_to_execution(r) for r in rows]
        finally:
            await db.close()

    # ── Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _row_to_task(row) -> ScheduledTask:
        def _ts(val):
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val)
                except ValueError:
                    return None
            return val

        return ScheduledTask(
            id=row["id"],
            name=row["name"],
            prompt=row["prompt"],
            trigger_type=row["trigger_type"],
            trigger_args=json.loads(row["trigger_args"]),
            enabled=bool(row["enabled"]),
            created_at=_ts(row["created_at"]),
            updated_at=_ts(row["updated_at"]),
            last_run_at=_ts(row["last_run_at"]),
            next_run_at=_ts(row["next_run_at"]),
        )

    @staticmethod
    def _row_to_execution(row) -> TaskExecution:
        def _ts(val):
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val)
                except ValueError:
                    return None
            return val

        return TaskExecution(
            id=row["id"],
            task_id=row["task_id"],
            started_at=_ts(row["started_at"]) or datetime.now(),
            finished_at=_ts(row["finished_at"]),
            duration_seconds=row["duration_seconds"],
            status=row["status"],
            result_summary=row["result_summary"],
            error=row["error"],
            tokens_used=row["tokens_used"],
        )
