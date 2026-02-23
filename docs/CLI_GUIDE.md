# NOVA CLI — Enhanced UI with Token Tracking

## Overview

The NOVA CLI has been upgraded with:
- ✨ Beautiful, colorized output (Copilot/Claude-style)
- 📊 Real-time token tracking for each message
- 📈 Cumulative token count for your session
- 🎨 Clean separators and visual hierarchy
- ⚡ Status indicators (thinking, success, error)

## Features

### 1. **Token Tracking**

Every interaction shows:
- **Prompt tokens**: Tokens used for your input
- **Completion tokens**: Tokens used for the response
- **Total tokens**: Combined count for that turn
- **Session total**: Cumulative tokens since session start

Example output:
```
────────────────────────────────────────────────────────────
▶ YOU: Explain quantum computing

◀ NOVA: Quantum computing uses quantum bits (qubits)...

📊 Tokens: 12 prompt + 145 completion = 157
📈 Session Tokens: 157
────────────────────────────────────────────────────────────
```

### 2. **Color Scheme**

- **Bright Blue (▶ YOU)**: Your messages
- **Bright Green (◀ NOVA)**: Agent responses
- **Bright Yellow (📊)**: Token information
- **Bright Cyan**: Headers and separators
- **Bright Red**: Errors
- **Bright Green (✓)**: Success messages

### 3. **Visual Elements**

```
╔════════════════════════════════════════════════════════════╗  ← Header box
║          🚀 NOVA — Neural Orchestration & Agent 🚀        ║
╚════════════════════════════════════════════════════════════╝

────────────────────────────────────────────────────────────  ← Separator

▶ YOU: Your question here                                    ← User message

◀ NOVA: The agent's response                               ← Agent response

📊 Tokens: 10 + 50 = 60                                     ← Token breakdown
📈 Session Tokens: 60                                       ← Cumulative
```

### 4. **Status Messages**

- **⧗ Processing your request...** - Thinking indicator
- **✓ SUCCESS** - Successful operation
- **ℹ INFO** - Information message
- **✗ ERROR** - Error occurred

## Usage

### Start the Interactive CLI

```bash
python -m agent.cli
```

You'll see:
1. Beautiful header with NOVA branding
2. Colored input prompt (▶ YOU:)
3. Waiting for your input...

### Commands

- **Type any question** - Get a response with token count
- **exit** or **quit** - End the session (shows session stats)
- **Ctrl+C** - Interrupt (graceful shutdown)

### Example Session

```
╔════════════════════════════════════════════════════════════╗
║          🚀 NOVA — Neural Orchestration & Agent 🚀        ║
║                  Type 'exit' to quit                       ║
╚════════════════════════════════════════════════════════════╝

────────────────────────────────────────────────────────────

▶ YOU: what is AI

⧗ Processing your request...

────────────────────────────────────────────────────────────
▶ YOU: what is AI

◀ NOVA: AI, or artificial intelligence, refers to computer 
systems designed to perform tasks that typically require 
human intelligence...

📊 Tokens: 8 prompt + 45 completion = 53
📈 Session Tokens: 68
────────────────────────────────────────────────────────────

▶ YOU: exit

ℹ INFO: Goodbye!

════ Session Statistics ════

Total Interactions............ 2
Total Tokens................... 68

────────────────────────────────────────────────────────────
```

## Files Structure

### New Files
- **`agent/ui_formatter.py`** - Main UI formatting module with CLIFormatter class
- **`test_cli_tokens.py`** - Test script demonstrating token tracking

### Modified Files
- **`agent/cli.py`** - Integrated new formatter and token display
- **`agent/nodes.py`** - Added token tracking to reasoning node
- **`agent/graph.py`** - Updated state initialization with token fields
- **`agent/state.py`** - Added `total_tokens` and `token_usage` fields

## Implementation Details

### State Tracking

The NOVAState now includes:
```python
total_tokens: int  # Cumulative tokens in session
token_usage: Optional[Dict]  # Last response token data
```

### Token Information Format

Token data from API responses:
```python
token_usage = {
    'prompt_tokens': 10,
    'completion_tokens': 50,
    'total_tokens': 60
}
```

### Color Support

- **Auto-detection**: Colors enabled on Unix-like terminals
- **Windows**: Attempts to enable ANSI support (requires Windows 10+)
- **Fallback**: Plain text if colors not supported

## Customization

### Disable Colors

If colors aren't working on your system, you can manually disable them:

```python
from agent.ui_formatter import CLIFormatter
CLIFormatter.SUPPORTS_COLOR = False
```

### Custom Messages

The CLIFormatter also provides methods for custom output:

```python
from agent.ui_formatter import CLIFormatter

CLIFormatter.print_user_message("Your message")
CLIFormatter.print_nova_message("Response")
CLIFormatter.print_token_info({"prompt_tokens": 10, ...})
CLIFormatter.print_error("Something went wrong")
CLIFormatter.print_success("Done!")
CLIFormatter.print_info("Information")
CLIFormatter.print_thinking("Loading...")
```

## Cost Estimation

You can calculate API costs based on token usage:

```python
# OpenAI GPT-4 Mini pricing (Feb 2026)
prompt_cost = (prompt_tokens / 1_000_000) * 0.15
completion_cost = (completion_tokens / 1_000_000) * 0.60
total_cost = prompt_cost + completion_cost
```

For 100 tokens used (50 prompt + 50 completion):
- Cost ≈ $0.000045

## Troubleshooting

### No Token Display

If token counts don't show, this usually means:
1. Using the LLM fallback (mock) instead of real API
2. API key not configured
3. API response doesn't include token usage

**Solution**: Set up your `OPENAI_API_KEY` in `.env`

### Colors Not Working

Windows users might need:
1. Windows 10 or later
2. Enable ANSI support (usually automatic)
3. Use Windows Terminal instead of Command Prompt

**Fallback**: Plain text output still works fine

### Character Encoding Issues

If you see strange characters instead of emoji/symbols:
1. Check terminal encoding (should be UTF-8)
2. Use a modern terminal emulator
3. Symbols are optional - functionality works without them

##Advanced Usage

### Testing Token Tracking

Run the included test script:

```bash
python test_cli_tokens.py
```

This demonstrates:
- Multi-turn interactions
- Token accumulation
- Session statistics

### Integrating with External Tools

Use the CLIFormatter in other Python scripts:

```python
from agent.ui_formatter import CLIFormatter

# In your code
CLIFormatter.print_header()
CLIFormatter.print_interaction_summary(
    user_message="Question",
    response="Answer",
    token_usage={"prompt_tokens": 10, "completion_tokens": 50, "total_tokens": 60},
    total_session_tokens=150
)
```

## API Reference

See [TOKEN_TRACKING.md](TOKEN_TRACKING.md) for complete token tracking API.

### CLIFormatter Methods

```python
# Output formatting
CLIFormatter.print_header()                    # NOVA header
CLIFormatter.print_separator(char="-")         # Separator line
CLIFormatter.print_user_message(msg)           # User message
CLIFormatter.print_nova_message(msg)           # NOVA response

# Token information
CLIFormatter.print_token_info(token_usage)     # Single response tokens
CLIFormatter.print_cumulative_tokens(int)      # Session total

# Status messages
CLIFormatter.print_error(msg)                  # Error
CLIFormatter.print_success(msg)                # Success
CLIFormatter.print_info(msg)                   # Info
CLIFormatter.print_thinking(msg)               # Loading/thinking

# Input/Output
CLIFormatter.get_user_input()                  # Styled input prompt
CLIFormatter.print_usage_stats(dict)           # Statistics table
CLIFormatter.print_interaction_summary(...)    # Complete interaction
```

## Next Steps

1. **Configure API Key**: Set `OPENAI_API_KEY` in `.env` to see real token counts
2. **Explore Token Patterns**: Notice which questions use more tokens
3. **Monitor Costs**: Track session tokens to understand API spending
4. **Customize UI**: Modify colors/symbols in `agent/ui_formatter.py`
