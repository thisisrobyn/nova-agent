"""Document ingestion pipeline for the RAG knowledge base.

Handles file upload, text extraction, chunking, and vector storage.
Supports PDF (.pdf), plain text (.txt), and Markdown (.md) files.
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

import structlog

from memory.database import get_db
from memory.models import Document
from memory.rag.store import ChromaVectorStore

logger = structlog.stdlib.get_logger(__name__)

_UPLOADS_DIR = os.path.join("data", "uploads")
_CHUNK_SIZE = 1000
_CHUNK_OVERLAP = 200
_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
_ALLOWED_TYPES = {"pdf", "txt", "md"}


class DocumentIngestionPipeline:
    """Ingest documents into the RAG knowledge base."""

    def __init__(self, vector_store: ChromaVectorStore) -> None:
        self._store = vector_store

    async def ingest(
        self,
        file_path: str,
        original_name: str,
        file_type: str,
        file_size: int,
    ) -> Document:
        """Ingest a document: extract text, chunk, embed, and store.

        Parameters
        ----------
        file_path:
            Path to the uploaded file (temporary location).
        original_name:
            Original filename from the upload.
        file_type:
            File extension (pdf, txt, md).
        file_size:
            File size in bytes.

        Returns
        -------
        Document:
            The document metadata record.
        """
        doc_id = str(uuid.uuid4())

        # Create document record in SQLite (status=pending)
        doc = Document(
            id=doc_id,
            name=original_name,
            file_type=file_type,
            size_bytes=file_size,
            status="pending",
        )
        await self._save_document(doc)

        try:
            # Update status to processing
            await self._update_status(doc_id, "processing")

            # Save file to uploads directory
            dest_path = self._save_upload(file_path, doc_id, file_type)

            # Extract text
            text = self._extract_text(dest_path, file_type)
            if not text.strip():
                raise ValueError("No text content extracted from document")

            # Chunk text
            chunks = self._chunk_text(text)
            logger.info(
                "document chunked",
                doc_id=doc_id,
                chunks=len(chunks),
            )

            # Generate chunk IDs and metadata
            chunk_ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
            metadatas = [
                {
                    "document_id": doc_id,
                    "document_name": original_name,
                    "chunk_index": i,
                    "file_type": file_type,
                }
                for i in range(len(chunks))
            ]

            # Add to vector store
            await self._store.add_documents(chunks, metadatas, chunk_ids)

            # Update document record
            await self._update_status(doc_id, "ready", chunk_count=len(chunks))

            doc.status = "ready"
            doc.chunk_count = len(chunks)
            return doc

        except Exception as exc:
            logger.error("ingestion failed", doc_id=doc_id, error=str(exc))
            await self._update_status(doc_id, "error", error_message=str(exc))
            doc.status = "error"
            doc.error_message = str(exc)
            return doc

    # ── File handling ────────────────────────────────────────────

    def _save_upload(self, src_path: str, doc_id: str, file_type: str) -> str:
        """Copy uploaded file to the uploads directory."""
        uploads_dir = Path(_UPLOADS_DIR)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        dest = uploads_dir / f"{doc_id}.{file_type}"
        shutil.copy2(src_path, dest)
        return str(dest)

    def _extract_text(self, file_path: str, file_type: str) -> str:
        """Extract text content from a file."""
        if file_type == "pdf":
            return self._extract_pdf(file_path)
        elif file_type in ("txt", "md"):
            return Path(file_path).read_text(encoding="utf-8", errors="replace")
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    @staticmethod
    def _extract_pdf(file_path: str) -> str:
        """Extract text from a PDF using PyMuPDF."""
        import pymupdf  # noqa: F401

        text_parts: list[str] = []
        with pymupdf.open(file_path) as doc:
            for page in doc:
                text_parts.append(page.get_text())
        return "\n".join(text_parts)

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
            length_function=len,
        )
        return splitter.split_text(text)

    # ── Database helpers ─────────────────────────────────────────

    async def _save_document(self, doc: Document) -> None:
        """Insert a new document record into SQLite."""
        db = await get_db()
        try:
            await db.execute(
                """
                INSERT INTO documents (id, name, file_type, size_bytes, status)
                VALUES (?, ?, ?, ?, ?)
                """,
                (doc.id, doc.name, doc.file_type, doc.size_bytes, doc.status),
            )
            await db.commit()
        finally:
            await db.close()

    async def _update_status(
        self,
        doc_id: str,
        status: str,
        chunk_count: int = 0,
        error_message: Optional[str] = None,
    ) -> None:
        """Update a document's status in SQLite."""
        db = await get_db()
        try:
            await db.execute(
                """
                UPDATE documents
                SET status = ?, chunk_count = ?, error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (status, chunk_count, error_message, doc_id),
            )
            await db.commit()
        finally:
            await db.close()


async def delete_document(doc_id: str, vector_store: ChromaVectorStore) -> bool:
    """Delete a document and its chunks from both SQLite and ChromaDB.

    Returns True if the document was found and deleted.
    """
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM documents WHERE id = ?", (doc_id,))
        row = await cursor.fetchone()
        if not row:
            return False

        # Delete from ChromaDB
        vector_store.delete_by_document_id(doc_id)

        # Delete uploaded file
        for ext in _ALLOWED_TYPES:
            p = Path(_UPLOADS_DIR) / f"{doc_id}.{ext}"
            if p.exists():
                p.unlink()
                break

        # Delete from SQLite
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await db.commit()
        logger.info("document deleted", doc_id=doc_id)
        return True
    finally:
        await db.close()


async def get_documents(status: Optional[str] = None) -> list[Document]:
    """List all documents, optionally filtered by status."""
    db = await get_db()
    try:
        if status:
            cursor = await db.execute(
                "SELECT * FROM documents WHERE status = ? ORDER BY created_at DESC",
                (status,),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM documents ORDER BY created_at DESC"
            )
        rows = await cursor.fetchall()
        return [_row_to_document(r) for r in rows]
    finally:
        await db.close()


async def get_document(doc_id: str) -> Optional[Document]:
    """Get a single document by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        )
        row = await cursor.fetchone()
        return _row_to_document(row) if row else None
    finally:
        await db.close()


def _row_to_document(row) -> Document:
    from datetime import datetime

    def _parse_ts(val):
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val)
            except ValueError:
                return None
        return val

    return Document(
        id=row["id"],
        name=row["name"],
        file_type=row["file_type"],
        size_bytes=row["size_bytes"],
        chunk_count=row["chunk_count"],
        status=row["status"],
        error_message=row["error_message"],
        created_at=_parse_ts(row["created_at"]),
        updated_at=_parse_ts(row["updated_at"]),
    )
