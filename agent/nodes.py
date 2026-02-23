from typing import Dict, Any
from .state import NOVAState
from .llm_client import generate

async def process_input_node(state: NOVAState, user_input: str) -> Dict[str, Any]:
    """Process the user's input and return a partial state dict.

    This function does not mutate the original state; it returns only the
    fields that need to be updated.
    """
    new_message = {"role": "user", "content": user_input}
    updated_messages = list(state.get("messages", [])) + [new_message]
    return {
        "messages": updated_messages,
        "iteration_count": state.get("iteration_count", 0) + 1,
    }

async def reasoning_node(state: NOVAState) -> Dict[str, Any]:
    """A simplified reasoning node (ReAct-like).

    Build a minimal prompt from the last user message and call the LLM. Returns
    the assistant reply and an optional list of tool results.
    """
    messages = state.get("messages", [])
    if not messages:
        return {
            "tool_results": [],
            "messages": messages,
            "token_usage": None,
            "total_tokens": state.get("total_tokens", 0),
        }

    last_user = messages[-1]
    prompt = f"User asked: {last_user.get('content')}\nRespond briefly."
    
    # Generate response with token tracking
    response, token_usage = await generate(prompt, return_tokens=True)
    
    assistant_message = {"role": "assistant", "content": response}
    updated_messages = list(messages) + [assistant_message]
    
    # Calculate cumulative tokens
    total_tokens = state.get("total_tokens", 0)
    if token_usage:
        total_tokens += token_usage.get("total_tokens", 0)
    
    return {
        "messages": updated_messages,
        "tool_results": [],
        "token_usage": token_usage,
        "total_tokens": total_tokens,
    }