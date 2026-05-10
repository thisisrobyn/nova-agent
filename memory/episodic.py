"""Episodic memory store -- persists conversation session summaries.

Each ``EpisodicMemory`` record captures an LLM-generated summary of a
completed conversation along with key topics discussed.  Recent episodes
are loaded into the system prompt at the start of new sessions so NOVA
has context about past interactions.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

import structlog

from memory.database import get_db
from memory.models import EpisodicMemory

logger = structlog.stdlib.get_logger(__name__)


class EpisodicMemoryStore:
    """Async CRUD operations against the ``episodes`` table."""

    # ── Write ────────────────────────────────────────────────────

    async def save_episode(
        self,
        session_id: str,
        summary: str,
        key_topics: list[str] | None = None,
        message_count: int = 0,
    ) -> EpisodicMemory:
        """Insert or update an episode summary for *session_id*."""
        topics_json = json.dumps(key_topics or [])
        db = await get_db()
        try:
            await db.execute(
                """
                INSERT INTO episodes (session_id, summary, key_topics, message_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    summary       = excluded.summary,
                    key_topics    = excluded.key_topics,
                    message_count = excluded.message_count,
                    created_at    = CURRENT_TIMESTAMP
                """,
                (session_id, summary, topics_json, message_count),
            )
            await db.commit()
            logger.info("episode saved", session_id=session_id)
            return EpisodicMemory(
                session_id=session_id,
                summary=summary,
                key_topics=key_topics or [],
                message_count=message_count,
            )
        finally:
            await db.close()

    # ── Read ─────────────────────────────────────────────────────

    async def get_recent_episodes(self, limit: int = 10) -> list[EpisodicMemory]:
        """Return the most recent episodes ordered by creation time desc."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT * FROM episodes ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_model(r) for r in rows]
        finally:
            await db.close()

    async def get_all_episodes(
        self, limit: int = 50, offset: int = 0
    ) -> list[EpisodicMemory]:
        """Paginated listing of all episodes."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT * FROM episodes ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )
            rows = await cursor.fetchall()
            return [self._row_to_model(r) for r in rows]
        finally:
            await db.close()

    async def count_episodes(self) -> int:
        """Total number of stored episodes."""
        db = await get_db()
        try:
            cursor = await db.execute("SELECT COUNT(*) FROM episodes")
            row = await cursor.fetchone()
            return row[0] if row else 0
        finally:
            await db.close()

    # ── Delete ───────────────────────────────────────────────────

    async def delete_all_episodes(self) -> int:
        """Delete all episodes.  Returns the number of rows removed."""
        db = await get_db()
        try:
            cursor = await db.execute("DELETE FROM episodes")
            await db.commit()
            count = cursor.rowcount
            logger.info("all episodes deleted", count=count)
            return count
        finally:
            await db.close()

    # ── Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _row_to_model(row) -> EpisodicMemory:
        topics_raw = row["key_topics"]
        try:
            topics = json.loads(topics_raw) if topics_raw else []
        except (json.JSONDecodeError, TypeError):
            topics = []

        created = row["created_at"]
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except ValueError:
                created = None

        return EpisodicMemory(
            id=row["id"],
            session_id=row["session_id"],
            summary=row["summary"],
            key_topics=topics,
            message_count=row["message_count"],
            created_at=created,
        )
