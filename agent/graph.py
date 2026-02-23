import asyncio
from typing import Dict, Any
from .state import NOVAState
from .nodes import process_input_node, reasoning_node
import asyncio
from typing import Dict, Any
from .state import NOVAState
from .nodes import process_input_node, reasoning_node

async def run_agent_once(user_input: str, state: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Run a single pass of the agent graph: input -> reasoning -> output.

    This function provides an entry point for the CLI and tests.
    """
    if state is None:
        state = NOVAState(
            messages=[],
            memory_context="",
            tool_results=[],
            iteration_count=0,
            total_tokens=0,
            token_usage=None,
        )

    partial1 = await process_input_node(state, user_input)
    merged = dict(state)
    merged.update(partial1)

    # Reasoning node
    partial2 = await reasoning_node(merged)
    merged.update(partial2)

    return merged

def run_agent_sync(user_input: str) -> Dict[str, Any]:
    return asyncio.run(run_agent_once(user_input))