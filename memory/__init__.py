"""NOVA Memory subsystem.

Provides a singleton ``MemoryManager`` facade that wraps:
- ``ConversationMemoryManager`` -- fact extraction and context building
- ``EpisodicMemoryStore`` -- session summary persistence

Usage::

    from memory import get_memory_manager

    mm = get_memory_manager()
    context = await mm.build_memory_context()
"""

from __future__ import annotations

from memory.conversation import ConversationMemoryManager
from memory.episodic import EpisodicMemoryStore

# Module-level singleton
_manager: ConversationMemoryManager | None = None


def get_memory_manager() -> ConversationMemoryManager:
    """Return the global ``ConversationMemoryManager`` singleton.

    Creates the instance on first call (lazy init).
    """
    global _manager
    if _manager is None:
        _manager = ConversationMemoryManager()
    return _manager


async def init_memory() -> None:
    """Initialize the memory subsystem (called from app lifespan).

    Ensures the database tables exist and creates the manager singleton.
    """
    from memory.database import init_db

    await init_db()
    get_memory_manager()


__all__ = [
    "ConversationMemoryManager",
    "EpisodicMemoryStore",
    "get_memory_manager",
    "init_memory",
]
