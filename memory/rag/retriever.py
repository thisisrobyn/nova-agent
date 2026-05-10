"""RAG retriever -- queries ChromaDB and formats results for the LLM.

Performs semantic similarity search and returns relevant document
excerpts with source references formatted for the system prompt.
"""

from __future__ import annotations

import structlog

from memory.rag.store import ChromaVectorStore

logger = structlog.stdlib.get_logger(__name__)


class RAGRetriever:
    """Query the knowledge base and format results for LLM consumption."""

    def __init__(self, vector_store: ChromaVectorStore) -> None:
        self._store = vector_store

    async def retrieve(self, query: str, k: int = 5) -> str:
        """Search the knowledge base and return formatted results.

        Parameters
        ----------
        query:
            The user's question or search query.
        k:
            Maximum number of chunks to return.

        Returns
        -------
        str:
            Formatted string with relevant document excerpts and sources,
            or a message indicating no results were found.
        """
        results = await self._store.similarity_search(query, k=k)

        if not results:
            return "No relevant documents found in the knowledge base."

        parts: list[str] = []
        for i, item in enumerate(results, 1):
            meta = item["metadata"]
            doc_name = meta.get("document_name", "Unknown")
            chunk_idx = meta.get("chunk_index", "?")
            content = item["content"]

            parts.append(
                f"[Source {i}: {doc_name} (chunk {chunk_idx})]\n{content}"
            )

        header = f"Found {len(results)} relevant excerpt(s) from the knowledge base:\n"
        return header + "\n\n---\n\n".join(parts)

    async def retrieve_with_metadata(
        self, query: str, k: int = 5
    ) -> list[dict]:
        """Return raw search results with metadata (for API responses)."""
        return await self._store.similarity_search(query, k=k)
