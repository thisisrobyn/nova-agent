"""Pydantic models for scheduled tasks and execution records."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ScheduledTask(BaseModel):
    """A user-defined recurring task executed autonomously by NOVA."""

    id: str
    name: str
    prompt: str
    trigger_type: str  # "cron" or "interval"
    trigger_args: dict[str, Any]
    enabled: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None


class TaskExecution(BaseModel):
    """Record of a scheduled task execution."""

    id: str
    task_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    status: str = "running"  # running | success | error | timeout
    result_summary: Optional[str] = None
    error: Optional[str] = None
    tokens_used: Optional[int] = None
