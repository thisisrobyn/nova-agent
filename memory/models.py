"""Data models for the NOVA memory subsystem.

Defines dataclass entities for memory facts, episodic memory,
and document metadata per ``data-model.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class MemoryFact:
    """A key-value fact extracted from conversation (e.g. user_name=Roberto).

    Upsert semantics on ``key``: if a fact with the same key exists,
    the value is overwritten.
    """

    key: str
    value: str
    id: Optional[int] = None
    source_session: Optional[str] = None
    confidence: float = 1.0
    updated_at: Optional[datetime] = None


@dataclass
class EpisodicMemory:
    """LLM-generated summary of a past conversation session."""

    session_id: str
    summary: str
    key_topics: list[str] = field(default_factory=list)
    message_count: int = 0
    id: Optional[int] = None
    created_at: Optional[datetime] = None


@dataclass
class Document:
    """Metadata for a user-uploaded document in the RAG knowledge base."""

    id: str  # UUID
    name: str
    file_type: str  # pdf, txt, md
    size_bytes: int
    chunk_count: int = 0
    status: str = "pending"  # pending | processing | ready | error
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class DocumentChunk:
    """A segment of a document stored in ChromaDB with its embedding."""

    id: str  # UUID
    document_id: str  # FK -> Document.id
    content: str
    chunk_index: int
    metadata: dict = field(default_factory=dict)
