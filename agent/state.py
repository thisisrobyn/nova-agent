from typing import TypedDict, List, Dict, Optional

class NOVAState(TypedDict):
    messages: List[Dict]
    memory_context: str
    tool_results: List[Dict]
    iteration_count: int
    total_tokens: int
    token_usage: Optional[Dict]