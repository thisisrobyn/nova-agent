"""RAG search tool for the NOVA agent.

Allows the agent to search the user's knowledge base (uploaded documents)
for relevant information using semantic similarity search.
"""

from __future__ import annotations

from langchain_core.tools import tool


@tool
async def rag_search(query: str) -> str:
    """Search the knowledge base for information relevant to the query.

    Use this tool when:
    - The user asks about content from their uploaded documents
    - You need to find specific information from the knowledge base
    - The user references documents, files, or uploaded materials

    Args:
        query: The search query describing what information to find.

    Returns:
        Relevant document excerpts with source references, or a message
        if no results are found.
    """
    from memory.rag.store import ChromaVectorStore
    from memory.rag.retriever import RAGRetriever

    try:
        store = ChromaVectorStore()
        retriever = RAGRetriever(store)

        # Check if there are any documents in the collection
        if store.count() == 0:
            return "The knowledge base is empty. No documents have been uploaded yet."

        return await retriever.retrieve(query, k=5)
    except Exception as e:
        return f"Error searching knowledge base: {str(e)}"
