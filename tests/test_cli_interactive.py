#!/usr/bin/env python3
"""Interactive CLI test with proper output formatting."""
import asyncio
from agent.graph import run_agent_once
from agent.ui_formatter import CLIFormatter

async def test():
    CLIFormatter.print_header()
    
    # Test message 1
    user_input_1 = "hello"
    print(f"> {user_input_1}")
    CLIFormatter.print_thinking()
    
    state = await run_agent_once(user_input_1)
    messages = state.get("messages", [])
    token_usage = state.get("token_usage")
    total_tokens = state.get("total_tokens", 0)
    
    if messages:
        response = messages[-1].get("content", "")
        CLIFormatter.print_interaction_summary(
            user_message=user_input_1,
            response=response,
            token_usage=token_usage,
            total_session_tokens=total_tokens
        )
    
    # Test message 2
    user_input_2 = "what can you do?"
    print(f"> {user_input_2}")
    CLIFormatter.print_thinking()
    
    state = await run_agent_once(user_input_2, state)
    messages = state.get("messages", [])
    token_usage = state.get("token_usage")
    total_tokens = state.get("total_tokens", 0)
    
    if messages:
        response = messages[-1].get("content", "")
        CLIFormatter.print_interaction_summary(
            user_message=user_input_2,
            response=response,
            token_usage=token_usage,
            total_session_tokens=total_tokens
        )
    
    print()
    CLIFormatter.print_usage_stats({
        "Total Messages": 2,
        "Total Tokens": total_tokens,
    })

asyncio.run(test())
