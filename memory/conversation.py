"""Conversation memory manager -- extracts and stores user facts.

Uses the LLM to extract structured key-value facts from conversations
(e.g., name, preferences, projects).  Facts are stored with upsert
semantics so newer information overwrites older entries.

The ``build_memory_context()`` method assembles facts + recent episode
summaries into a formatted string injected into the system prompt.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

import structlog

from memory.database import get_db
from memory.episodic import EpisodicMemoryStore
from memory.models import MemoryFact

logger = structlog.stdlib.get_logger(__name__)

# Maximum number of facts to keep (soft limit)
_MAX_FACTS = 500

# Prompt template for LLM fact extraction
FACT_EXTRACTION_PROMPT = """\
Analyze the following conversation and extract key facts about the user.
Focus on personal information, preferences, projects, and recurring topics.

Return a JSON array of objects with "key" and "value" fields.
Use snake_case keys like "user_name", "preferred_language", "current_project".
Only include facts you are confident about. If no facts can be extracted, return [].

Example output:
[
  {{"key": "user_name", "value": "Roberto"}},
  {{"key": "preferred_language", "value": "Spanish"}},
  {{"key": "current_project", "value": "Data engineering pipeline"}}
]

Conversation:
{conversation}

Extracted facts (JSON array only, no markdown, no explanation):"""

# Prompt template for episode summarization
EPISODE_SUMMARY_PROMPT = """\
Summarize the following conversation in 2-3 sentences, capturing the main \
topics discussed and any key outcomes or decisions. Also list the key topics \
as a JSON array of short strings.

Respond ONLY with a JSON object like:
{{"summary": "...", "key_topics": ["topic1", "topic2"]}}

Conversation:
{conversation}

JSON response:"""


class ConversationMemoryManager:
    """Manages user fact extraction, storage, and memory context building."""

    def __init__(self) -> None:
        self._episodic = EpisodicMemoryStore()

    # ── Fact extraction (LLM-powered) ────────────────────────────

    async def extract_facts_from_conversation(
        self, messages: list[dict[str, str]]
    ) -> list[MemoryFact]:
        """Use the LLM to extract key-value facts from a conversation.

        Parameters
        ----------
        messages:
            List of dicts with ``role`` and ``content`` keys.

        Returns
        -------
        list[MemoryFact]:
            Extracted facts (not yet saved).
        """
        from agent.llm import get_llm
        from langchain_core.messages import HumanMessage

        llm = get_llm()
        if llm is None:
            logger.warning("LLM not available for fact extraction")
            return []

        # Build a text representation of the conversation
        conversation_text = "\n".join(
            f"{m.get('role', 'unknown')}: {m.get('content', '')}"
            for m in messages
        )

        prompt = FACT_EXTRACTION_PROMPT.format(conversation=conversation_text)

        try:
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            content = response.content.strip()

            # Strip markdown fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1]
                if content.endswith("```"):
                    content = content[: content.rfind("```")]
                content = content.strip()

            facts_data = json.loads(content)
            if not isinstance(facts_data, list):
                return []

            return [
                MemoryFact(key=f["key"], value=f["value"])
                for f in facts_data
                if isinstance(f, dict) and "key" in f and "value" in f
            ]
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("fact extraction failed", error=str(exc))
            return []

    async def summarize_episode(
        self, messages: list[dict[str, str]], session_id: str
    ) -> Optional[dict]:
        """Use the LLM to summarize a conversation for episodic memory.

        Returns dict with ``summary`` and ``key_topics`` or None on failure.
        """
        from agent.llm import get_llm
        from langchain_core.messages import HumanMessage

        llm = get_llm()
        if llm is None:
            return None

        conversation_text = "\n".join(
            f"{m.get('role', 'unknown')}: {m.get('content', '')}"
            for m in messages
        )

        prompt = EPISODE_SUMMARY_PROMPT.format(conversation=conversation_text)

        try:
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            content = response.content.strip()

            if content.startswith("```"):
                content = content.split("\n", 1)[-1]
                if content.endswith("```"):
                    content = content[: content.rfind("```")]
                content = content.strip()

            result = json.loads(content)
            if isinstance(result, dict) and "summary" in result:
                return result
            return None
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("episode summarization failed", error=str(exc))
            return None

    # ── Fact persistence ─────────────────────────────────────────

    async def save_facts(
        self, facts: list[MemoryFact], source_session: str | None = None
    ) -> int:
        """Upsert facts into the database.  Returns count of saved facts."""
        if not facts:
            return 0

        db = await get_db()
        saved = 0
        try:
            for fact in facts[:_MAX_FACTS]:
                await db.execute(
                    """
                    INSERT INTO facts (key, value, source_session, confidence)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value          = excluded.value,
                        source_session = excluded.source_session,
                        confidence     = excluded.confidence,
                        updated_at     = CURRENT_TIMESTAMP
                    """,
                    (fact.key, fact.value, source_session or fact.source_session,
                     fact.confidence),
                )
                saved += 1
            await db.commit()
            logger.info("facts saved", count=saved)
        finally:
            await db.close()
        return saved

    async def get_all_facts(self) -> list[MemoryFact]:
        """Return all stored facts."""
        db = await get_db()
        try:
            cursor = await db.execute(
                "SELECT * FROM facts ORDER BY updated_at DESC"
            )
            rows = await cursor.fetchall()
            return [self._row_to_fact(r) for r in rows]
        finally:
            await db.close()

    async def delete_all_facts(self) -> int:
        """Delete all facts.  Returns the number of rows removed."""
        db = await get_db()
        try:
            cursor = await db.execute("DELETE FROM facts")
            await db.commit()
            count = cursor.rowcount
            logger.info("all facts deleted", count=count)
            return count
        finally:
            await db.close()

    # ── Memory context builder ───────────────────────────────────

    async def build_memory_context(self) -> str:
        """Build a formatted string of stored memory for the system prompt.

        Combines user facts and recent episode summaries into a block
        that can be injected into the NOVA system prompt.
        """
        parts: list[str] = []

        # Load facts
        facts = await self.get_all_facts()
        if facts:
            facts_text = "\n".join(f"- {f.key}: {f.value}" for f in facts)
            parts.append(f"Known facts about the user:\n{facts_text}")

        # Load recent episodes
        episodes = await self._episodic.get_recent_episodes(limit=5)
        if episodes:
            episodes_text = "\n".join(
                f"- [{e.session_id}] {e.summary}" for e in episodes
            )
            parts.append(f"Recent conversation summaries:\n{episodes_text}")

        if not parts:
            return ""

        return (
            "\n\n--- MEMORY CONTEXT ---\n"
            + "\n\n".join(parts)
            + "\n--- END MEMORY ---\n"
        )

    # ── Helpers ──────────────────────────────────────────────────

    @property
    def episodic(self) -> EpisodicMemoryStore:
        """Access the underlying episodic store."""
        return self._episodic

    @staticmethod
    def _row_to_fact(row) -> MemoryFact:
        updated = row["updated_at"]
        if isinstance(updated, str):
            try:
                updated = datetime.fromisoformat(updated)
            except ValueError:
                updated = None

        return MemoryFact(
            id=row["id"],
            key=row["key"],
            value=row["value"],
            source_session=row["source_session"],
            confidence=row["confidence"],
            updated_at=updated,
        )
