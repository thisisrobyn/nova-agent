"""Async SQLite database initialization and connection helpers.

Creates tables for memory facts, episodic memory, and documents
in ``data/nova_memory.db`` using aiosqlite.  Call ``init_db()`` once
at application startup (from ``api/main.py`` lifespan).

All write operations use WAL mode for better async concurrency.
"""

from __future__ import annotations

import os
from pathlib import Path

import aiosqlite
import structlog

logger = structlog.stdlib.get_logger(__name__)

# Default database path -- overridable via env var
_DEFAULT_DB_PATH = os.path.join("data", "nova_memory.db")
_db_path: str = os.getenv("MEMORY_DB_PATH", _DEFAULT_DB_PATH)

_SCHEMA_SQL = """
-- Memory facts (key-value pairs extracted from conversations)
CREATE TABLE IF NOT EXISTS facts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE,
    value       TEXT    NOT NULL,
    source_session TEXT,
    confidence  REAL    DEFAULT 1.0,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Episodic memory (session summaries)
CREATE TABLE IF NOT EXISTS episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT    NOT NULL UNIQUE,
    summary       TEXT    NOT NULL,
    key_topics    TEXT,                          -- JSON array
    message_count INTEGER DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG document metadata
CREATE TABLE IF NOT EXISTS documents (
    id            TEXT    PRIMARY KEY,           -- UUID
    name          TEXT    NOT NULL,
    file_type     TEXT    NOT NULL,
    size_bytes    INTEGER NOT NULL,
    chunk_count   INTEGER DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


async def init_db(db_path: str | None = None) -> None:
    """Create the memory database and tables if they don't exist.

    Parameters
    ----------
    db_path:
        Override the default database path.  When *None* the value from
        ``MEMORY_DB_PATH`` env-var (or ``data/nova_memory.db``) is used.
    """
    global _db_path
    if db_path is not None:
        _db_path = db_path

    # Ensure the parent directory exists
    Path(_db_path).parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(_db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.executescript(_SCHEMA_SQL)
        await db.commit()

    logger.info("memory database initialized", path=_db_path)


async def get_db() -> aiosqlite.Connection:
    """Return an open aiosqlite connection to the memory database.

    Callers are responsible for closing the connection (prefer
    ``async with get_db() as db:`` pattern).
    """
    db = await aiosqlite.connect(_db_path)
    db.row_factory = aiosqlite.Row
    return db


def get_db_path() -> str:
    """Return the current database file path (useful for tests)."""
    return _db_path
