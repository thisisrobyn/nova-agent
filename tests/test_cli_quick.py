#!/usr/bin/env python3
"""Quick CLI test without user input."""
import sys
from io import StringIO
import asyncio
from agent.graph import run_agent_once

# Test the agent without interactive input
async def test():
    print("\n  NOVA - Neural Orchestration & Agent")
    print("  type 'exit' to quit\n")
    
    user_input = "hello world"
    print(f"> {user_input}")
    print("~ Processing...")
    
    try:
        state = await run_agent_once(user_input)
        messages = state.get("messages", [])
        if messages:
            response = messages[-1].get("content", "")
            print(f"\n---\nYou\n{user_input}\n\nNOVA\n{response}\n---")
        else:
            print("No response")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
