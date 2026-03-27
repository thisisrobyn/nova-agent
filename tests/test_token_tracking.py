#!/usr/bin/env python3
"""Test token tracking in the CLI."""
import asyncio
from agent.graph import run_agent_once
from agent.ui_formatter import CLIFormatter

async def test():
    print("\n  Testing Token Tracking\n")
    
    # First message
    print("=" * 60)
    user_input_1 = "What is 2 + 2?"
    print(f"> {user_input_1}")
    
    state = await run_agent_once(user_input_1)
    messages = state.get("messages", [])
    token_usage_1 = state.get("token_usage")
    total_tokens_1 = state.get("total_tokens", 0)
    
    print(f"\nResponse from state:")
    if messages:
        response = messages[-1].get("content", "")
        print(f"NOVA: {response}")
    
    print(f"\nToken Usage after message 1:")
    print(f"  Current token_usage: {token_usage_1}")
    print(f"  Total tokens: {total_tokens_1}")
    
    CLIFormatter.print_interaction_summary(
        user_message=user_input_1,
        response=messages[-1].get("content", "") if messages else "",
        token_usage=token_usage_1,
        total_session_tokens=total_tokens_1
    )
    
    # Second message
    print("\n" + "=" * 60)
    user_input_2 = "What is 5 * 3?"
    print(f"> {user_input_2}")
    
    state = await run_agent_once(user_input_2, state)
    messages = state.get("messages", [])
    token_usage_2 = state.get("token_usage")
    total_tokens_2 = state.get("total_tokens", 0)
    
    print(f"\nResponse from state:")
    if messages:
        response = messages[-1].get("content", "")
        print(f"NOVA: {response}")
    
    print(f"\nToken Usage after message 2:")
    print(f"  Current token_usage: {token_usage_2}")
    print(f"  Total tokens: {total_tokens_2}")
    
    CLIFormatter.print_interaction_summary(
        user_message=user_input_2,
        response=messages[-1].get("content", "") if messages else "",
        token_usage=token_usage_2,
        total_session_tokens=total_tokens_2
    )
    
    # Final stats
    print("\n" + "=" * 60)
    print("Final Session Statistics:")
    CLIFormatter.print_usage_stats({
        "Total Messages": len([m for m in messages if m.get('role') == 'user']),
        "Total Tokens": total_tokens_2,
    })

asyncio.run(test())
