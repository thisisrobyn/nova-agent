"""NOVA Scheduled Tasks package.

Provides autonomous task scheduling using APScheduler with
SQLite persistence for task definitions and execution logs.
"""

from __future__ import annotations

from typing import Optional

from scheduler.manager import SchedulerManager

_instance: Optional[SchedulerManager] = None


def get_scheduler() -> SchedulerManager:
    """Return the singleton SchedulerManager instance."""
    global _instance
    if _instance is None:
        _instance = SchedulerManager()
    return _instance
