# Token Tracking Guide for NOVA Agent

## Overview

This guide explains how to use the token counting and tracking features to monitor API usage and costs in the NOVA agent.

## Installation

First, install the required dependency:

```bash
pip install tiktoken
```

> **Note**: `tiktoken` is OpenAI's official library for encoding text into tokens. It's required for accurate token counting.

## Core Components

### 1. Token Counter Module (`tools/token_counter.py`)

The module provides the following functions:

#### `count_tokens_for_message(content: str, model: str = "gpt-4-mini") -> int`
Counts tokens in a message using tiktoken.

```python
from tools.token_counter import count_tokens_for_message

tokens = count_tokens_for_message("Hello, how are you?")
print(f"Token count: {tokens}")
```

#### `extract_token_usage(llm_response) -> Optional[Dict[str, int]]`
Extracts token usage information from an LLM response.

Returns:
```python
{
    'prompt_tokens': 10,
    'completion_tokens': 50,
    'total_tokens': 60,
}
```

#### `format_token_usage(token_usage: Dict) -> str`
Formats token usage for display.

```python
from tools.token_counter import format_token_usage

token_info = format_token_usage(token_usage)
# Output: "Tokens used -> prompt: 10 | completion: 50 | total: 60"
```

#### `log_message_tokens(role, content, token_usage=None, model="gpt-4-mini") -> Dict`
Logs token information for a message and returns metadata.

```python
from tools.token_counter import log_message_tokens

data = log_message_tokens(
    role="assistant",
    content="Your response...",
    token_usage={"prompt_tokens": 10, "completion_tokens": 50, "total_tokens": 60}
)
```

### 2. Enhanced LLM Client (`agent/llm_client.py`)

The `generate()` function now supports token tracking:

```python
from agent.llm_client import generate

# Without token tracking (default behavior)
response = await generate("Your prompt here")

# With token tracking
response, token_usage = await generate(
    "Your prompt here",
    return_tokens=True
)
```

Returns:
- Without `return_tokens`: Just the response string
- With `return_tokens=True`: Tuple of `(response_text, token_usage_dict)`

### 3. Enhanced State (`agent/state.py`)

The NOVAState TypedDict now includes:
- `total_tokens: int` - Cumulative token count for the session
- `token_usage: Optional[Dict]` - Token usage from the last API call

## Usage Examples

### Example 1: Simple Single Message

```python
import asyncio
from agent.llm_client import generate
from tools.token_counter import format_token_usage, count_tokens_for_message

async def track_single_message():
    user_input = "Explain quantum computing."
    
    # Estimate input tokens
    input_tokens = count_tokens_for_message(user_input)
    print(f"Input tokens: {input_tokens}")
    
    # Get response with token tracking
    response, token_usage = await generate(user_input, return_tokens=True)
    
    print(f"Response: {response}")
    if token_usage:
        print(format_token_usage(token_usage))

asyncio.run(track_single_message())
```

### Example 2: Multi-turn Conversation

```python
async def track_conversation():
    cumulative_tokens = 0
    
    messages = [
        "What is AI?",
        "Explain neural networks.",
        "How do transformers work?"
    ]
    
    for msg in messages:
        response, token_usage = await generate(msg, return_tokens=True)
        
        if token_usage:
            cumulative_tokens += token_usage['total_tokens']
            print(f"Turn tokens: {token_usage['total_tokens']}")
    
    print(f"Total conversation tokens: {cumulative_tokens}")

asyncio.run(track_conversation())
```

### Example 3: Integrate with Nodes

Update your reasoning node to track tokens:

```python
from tools.token_counter import format_token_usage, log_message_tokens

async def reasoning_node(state: NOVAState) -> Dict[str, Any]:
    """Reasoning node with token tracking."""
    messages = state.get("messages", [])
    
    if not messages:
        return {
            "tool_results": [],
            "messages": messages,
            "total_tokens": 0,
            "token_usage": None,
        }
    
    last_user = messages[-1]
    prompt = f"User asked: {last_user.get('content')}\nRespond briefly."
    
    # Get response with token tracking
    response, token_usage = await generate(prompt, return_tokens=True)
    
    # Log tokens if available
    if token_usage:
        logger.info(f"Response tokens: {format_token_usage(token_usage)}")
    
    assistant_message = {
        "role": "assistant",
        "content": response,
    }
    
    updated_messages = list(messages) + [assistant_message]
    total_tokens = state.get("total_tokens", 0)
    if token_usage:
        total_tokens += token_usage.get("total_tokens", 0)
    
    return {
        "messages": updated_messages,
        "tool_results": [],
        "token_usage": token_usage,
        "total_tokens": total_tokens,
    }
```

### Example 4: Estimate Costs

```python
async def estimate_cost():
    """Estimate costs based on token usage."""
    
    # OpenAI GPT-4 mini pricing (as of Feb 2026)
    PROMPT_COST = 0.15 / 1_000_000  # $0.15 per 1M prompt tokens
    COMPLETION_COST = 0.60 / 1_000_000  # $0.60 per 1M completion tokens
    
    response, token_usage = await generate(
        "Explain machine learning",
        return_tokens=True
    )
    
    if token_usage:
        prompt_cost = token_usage['prompt_tokens'] * PROMPT_COST
        completion_cost = token_usage['completion_tokens'] * COMPLETION_COST
        total_cost = prompt_cost + completion_cost
        
        print(f"Cost for this request: ${total_cost:.6f}")
```

## Full Working Example

Run the provided example file to see token tracking in action:

```bash
python examples_token_tracking.py
```

This demonstrates:
1. Single message token tracking
2. Multi-turn conversation token accumulation
3. Using the logging utilities

## Token Limits and Fallback

If `tiktoken` is not installed or the model is not recognized, the system falls back to a rough approximation (1 token ≈ 4 characters). This ensures the system continues working even if token counting fails.

## Best Practices

1. **Track cumulative tokens**: Add token counts to your state to understand total API usage over a session
2. **Log at key points**: Log token usage after important API calls
3. **Monitor costs**: Use token counts to estimate and track API costs
4. **Handle missing data**: Always check if `token_usage` is None before using it
5. **Choose the right model**: Ensure the model name matches your LLM configuration

## API Reference

### `count_tokens_for_message(content, model="gpt-4-mini") -> int`
- **Parameters**: 
  - `content` (str): Message to count
  - `model` (str): Model identifier
- **Returns**: Integer token count

### `extract_token_usage(llm_response) -> Optional[Dict]`
- **Parameters**: 
  - `llm_response`: Response from LLM
- **Returns**: Dict with 'prompt_tokens', 'completion_tokens', 'total_tokens' or None

### `format_token_usage(token_usage) -> str`
- **Parameters**: 
  - `token_usage` (dict): From extract_token_usage()
- **Returns**: Formatted string for logging/display

### `log_message_tokens(role, content, token_usage=None, model="gpt-4-mini") -> Dict`
- **Parameters**:
  - `role` (str): Message role ('user', 'assistant', etc.)
  - `content` (str): Message content
  - `token_usage` (dict, optional): From API response
  - `model` (str): Model identifier
- **Returns**: Dict with message info and token counts

### `generate(text, max_tokens=512, return_tokens=False) -> Any`
- **Parameters**:
  - `text` (str): Prompt
  - `max_tokens` (int): Token limit
  - `return_tokens` (bool): If True, returns (text, token_usage) tuple
- **Returns**: Response text or (text, token_usage) tuple if return_tokens=True

## Troubleshooting

### "No module named 'tiktoken'"
Install tiktoken: `pip install tiktoken`

### Token counts seem inaccurate
- Verify the model name matches your actual LLM
- Check if the API response includes token_usage
- The token counter will fall back to approximation if tiktoken fails

### Token usage always None
- Ensure your LLM is configured to return token usage (most OpenAI models do)
- Check logs for extraction errors
- Your LLM might not support token usage in responses