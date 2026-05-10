"""Scheduler manager -- wraps APScheduler for autonomous task execution.

Uses ``AsyncIOScheduler`` with ``SQLAlchemyJobStore`` for persistence.
Tasks call ``run_agent_once()`` to execute prompts through the NOVA agent.
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime
from typing import Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from scheduler.models import ScheduledTask, TaskExecution
from scheduler.store import SchedulerStore

logger = structlog.stdlib.get_logger(__name__)

_DB_PATH = os.getenv("SCHEDULER_DB_PATH", os.path.join("data", "nova_scheduler.db"))


class SchedulerManager:
    """Manages APScheduler lifecycle and task execution."""

    def __init__(self) -> None:
        self._store = SchedulerStore()
        self._scheduler: Optional[AsyncIOScheduler] = None

    @property
    def store(self) -> SchedulerStore:
        return self._store

    async def start(self) -> None:
        """Initialize the scheduler and reload persisted tasks."""
        await self._store.init_db()

        jobstore_url = f"sqlite:///{_DB_PATH}"
        self._scheduler = AsyncIOScheduler(
            jobstores={"default": SQLAlchemyJobStore(url=jobstore_url)},
        )

        # Remove stale jobs from APScheduler that may reference old code paths
        self._scheduler.start()

        # Reload tasks from our metadata table
        tasks = await self._store.list_tasks()
        for task in tasks:
            if task.enabled:
                self._schedule_task(task)

        logger.info("scheduler started", active_tasks=len(tasks))

    def shutdown(self) -> None:
        """Shut down the scheduler gracefully."""
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("scheduler shut down")

    @property
    def is_running(self) -> bool:
        return self._scheduler is not None and self._scheduler.running

    # ── Task management ──────────────────────────────────────────

    async def create_task(
        self,
        name: str,
        prompt: str,
        trigger_type: str,
        trigger_args: dict,
        enabled: bool = True,
    ) -> ScheduledTask:
        """Create and schedule a new task."""
        task = ScheduledTask(
            id=str(uuid.uuid4()),
            name=name,
            prompt=prompt,
            trigger_type=trigger_type,
            trigger_args=trigger_args,
            enabled=enabled,
        )
        await self._store.create_task(task)

        if enabled and self._scheduler:
            self._schedule_task(task)

        logger.info("task created", task_id=task.id, name=name)
        return task

    async def update_task(self, task_id: str, **fields) -> Optional[ScheduledTask]:
        """Update task fields and reschedule if needed."""
        task = await self._store.update_task(task_id, **fields)
        if not task:
            return None

        # Remove existing job and reschedule
        if self._scheduler:
            try:
                self._scheduler.remove_job(task_id)
            except Exception:
                pass

            if task.enabled:
                self._schedule_task(task)

        return task

    async def delete_task(self, task_id: str) -> bool:
        """Delete a task and remove its scheduled job."""
        if self._scheduler:
            try:
                self._scheduler.remove_job(task_id)
            except Exception:
                pass

        return await self._store.delete_task(task_id)

    async def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        return await self._store.get_task(task_id)

    async def list_tasks(self) -> list[ScheduledTask]:
        return await self._store.list_tasks()

    async def get_task_logs(
        self, task_id: str, limit: int = 20, offset: int = 0,
        status: Optional[str] = None,
    ) -> list[TaskExecution]:
        return await self._store.get_task_logs(task_id, limit, offset, status)

    # ── Internal scheduling ──────────────────────────────────────

    def _schedule_task(self, task: ScheduledTask) -> None:
        """Add a task to APScheduler."""
        if not self._scheduler:
            return

        trigger = self._build_trigger(task.trigger_type, task.trigger_args)
        if not trigger:
            logger.warning("invalid trigger config", task_id=task.id)
            return

        self._scheduler.add_job(
            self._execute_task,
            trigger=trigger,
            id=task.id,
            args=[task.id, task.prompt],
            replace_existing=True,
            name=task.name,
        )

    @staticmethod
    def _build_trigger(trigger_type: str, trigger_args: dict):
        """Build an APScheduler trigger from type + args."""
        try:
            if trigger_type == "cron":
                return CronTrigger(**trigger_args)
            elif trigger_type == "interval":
                return IntervalTrigger(**trigger_args)
            return None
        except Exception:
            return None

    async def _execute_task(self, task_id: str, prompt: str) -> None:
        """Execute a scheduled task by running the agent with the prompt."""
        execution = TaskExecution(
            id=str(uuid.uuid4()),
            task_id=task_id,
            started_at=datetime.now(),
            status="running",
        )
        await self._store.save_execution(execution)
        await self._store.update_last_run(task_id, execution.started_at)

        start_time = time.monotonic()
        try:
            from agent.graph import run_agent_once

            result = await run_agent_once(prompt)
            elapsed = round(time.monotonic() - start_time, 2)

            # Extract response text
            from langchain_core.messages import AIMessage
            messages = result.get("messages", [])
            response = ""
            for msg in reversed(messages):
                if isinstance(msg, AIMessage) and msg.content:
                    response = msg.content
                    break

            await self._store.update_execution(
                execution.id,
                finished_at=datetime.now(),
                duration_seconds=elapsed,
                status="success",
                result_summary=response[:2000] if response else None,
                tokens_used=result.get("total_tokens", 0),
            )
            logger.info("task executed", task_id=task_id, duration=elapsed)

        except Exception as exc:
            elapsed = round(time.monotonic() - start_time, 2)
            await self._store.update_execution(
                execution.id,
                finished_at=datetime.now(),
                duration_seconds=elapsed,
                status="error",
                error=str(exc)[:2000],
            )
            logger.error("task execution failed", task_id=task_id, error=str(exc))
