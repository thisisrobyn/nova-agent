"""ChromaDB vector store wrapper for the RAG pipeline.

Uses ``chromadb.PersistentClient`` for local persistence and
``OllamaEmbeddings`` (nomic-embed-text) for embedding generation.
"""

from __future__ import annotations

import os
from typing import Any

import chromadb
import structlog
from langchain_ollama import OllamaEmbeddings

logger = structlog.stdlib.get_logger(__name__)

_COLLECTION_NAME = "nova_documents"
_DEFAULT_PERSIST_DIR = os.path.join("data", "chroma")


class ChromaVectorStore:
    """Manages ChromaDB collection for RAG document chunks."""

    def __init__(self, persist_dir: str | None = None) -> None:
        self._persist_dir = persist_dir or os.getenv(
            "CHROMA_PERSIST_DIR", _DEFAULT_PERSIST_DIR
        )
        self._client = chromadb.PersistentClient(path=self._persist_dir)
        self._collection = self._client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        self._embeddings = OllamaEmbeddings(
            model="nomic-embed-text",
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )
        logger.info(
            "ChromaDB store initialized",
            persist_dir=self._persist_dir,
            collection=_COLLECTION_NAME,
        )

    # ── Write ────────────────────────────────────────────────────

    async def add_documents(
        self,
        chunks: list[str],
        metadatas: list[dict[str, Any]],
        ids: list[str],
    ) -> None:
        """Add document chunks with embeddings to the collection."""
        embeddings = await self._embeddings.aembed_documents(chunks)
        self._collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
        logger.info("added chunks to ChromaDB", count=len(chunks))

    # ── Read ─────────────────────────────────────────────────────

    async def similarity_search(
        self, query: str, k: int = 5
    ) -> list[dict[str, Any]]:
        """Query the collection and return the top-k relevant chunks.

        Returns a list of dicts with ``content``, ``metadata``, and ``distance``.
        """
        query_embedding = await self._embeddings.aembed_query(query)
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )

        items: list[dict[str, Any]] = []
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(documents, metadatas, distances):
            items.append({
                "content": doc,
                "metadata": meta or {},
                "distance": dist,
            })

        return items

    # ── Delete ───────────────────────────────────────────────────

    def delete_by_document_id(self, document_id: str) -> None:
        """Delete all chunks belonging to a specific document."""
        self._collection.delete(where={"document_id": document_id})
        logger.info("deleted chunks from ChromaDB", document_id=document_id)

    # ── Info ─────────────────────────────────────────────────────

    def count(self) -> int:
        """Return total number of chunks in the collection."""
        return self._collection.count()

    def is_healthy(self) -> bool:
        """Check if the ChromaDB collection is accessible."""
        try:
            self._collection.count()
            return True
        except Exception:
            return False
