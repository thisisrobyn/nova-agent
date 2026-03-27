#!/usr/bin/env python3
"""Test to validate CLI output format."""
import asyncio
from agent.graph import run_agent_once
from agent.ui_formatter import CLIFormatter

async def test():
    CLIFormatter.print_header()
    
    user_input = "what is 2+2?"
    print(f"> {user_input}")
    CLIFormatter.print_thinking()
    
    state = await run_agent_once(user_input)
    messages = state.get("messages", [])
    token_usage = state.get("token_usage")
    total_tokens = state.get("total_tokens", 0)
    
    print("\n[DEBUG] Messages in state:", len(messages))
    print("[DEBUG] Last message role:", messages[-1].get("role") if messages else "N/A")
    print("[DEBUG] Token usage:", token_usage)
    print()
    
    if messages:
        # Get the assistant's response (last message after run_agent_once)
        response = messages[-1].get("content", "")
        print(f"[DEBUG] Response length: {len(response)}")
        print(f"[DEBUG] Response preview: {response[:50]}...")
        print()
        
        CLIFormatter.print_interaction_summary(
            user_message=user_input,
            response=response,
            token_usage=token_usage,
            total_session_tokens=total_tokens
        )

asyncio.run(test())
