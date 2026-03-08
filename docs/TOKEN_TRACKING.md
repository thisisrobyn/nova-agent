# Token Tracking

## What are tokens?

Tokens are small pieces of text that the AI model reads and writes. Every time you send a message, you use tokens. Tokens cost money (you pay OpenAI per token).

- **1 token ≈ 4 characters** of English text
- The word "hello" is 1 token
- A long paragraph might be 50-100 tokens

## How NOVA tracks tokens

Every time the agent runs, it records three numbers:

| Metric | What it means |
|--------|-------------|
| **Prompt tokens** | How many tokens were in your message + conversation history |
| **Completion tokens** | How many tokens the AI wrote in its response |
| **Total tokens** | Prompt + completion |

These are stored in the agent state and sent to the frontend with every response.

## Where you can see token usage

### Web UI

In the sidebar, you'll see:
- ⚡ Total tokens used in this session
- Each assistant message shows its individual token count (hover to expand)

### CLI

After each response:
```
  Tokens: prompt=45 | completion=12 | total=57
  Session total: 182 tokens
```

### API

The `/chat/stream` endpoint includes token data in the `done` event:

```json
{
  "type": "done",
  "token_usage": {
    "prompt_tokens": 45,
    "completion_tokens": 12,
    "total_tokens": 57
  },
  "total_tokens": 182
}
```

## How it works internally

1. `agent/nodes.py` → after each LLM call, extracts `response_metadata.usage`
2. If the API doesn't return usage data, it falls back to **tiktoken** (local estimation)
3. Token counts accumulate in `state["total_tokens"]` across the conversation
4. `tools/token_counter.py` → helper functions for counting tokens with tiktoken

## Cost estimation

Rough pricing for OpenAI models (as of 2025):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|----------------------|
| gpt-4.1 | $2.00 | $8.00 |
| gpt-4.1-mini | $0.40 | $1.60 |

A typical conversation (20 messages) uses roughly 5,000-15,000 total tokens.
