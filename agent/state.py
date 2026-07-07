"""NOVA agent state definition for LangGraph."""

import operator
from typing import Annotated, Any, Dict, List, Optional, Sequence

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class NOVAState(dict):
    """State schema for the NOVA agent graph.

    Uses LangGraph's ``add_messages`` reducer so that each node can return
    a partial list of new messages and LangGraph merges them automatically.
    """

    __annotations__ = {
        "messages": Annotated[Sequence[BaseMessage], add_messages],
        "memory_context": str,
        "knowledge_context": str,
        "tool_results": List[Dict[str, Any]],
        "iteration_count": int,
        "total_tokens": int,
        "token_usage": Optional[Dict[str, Any]],
    }