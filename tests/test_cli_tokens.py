"""Quick test of the updated CLI with token tracking."""

import asyncio
from agent.graph import run_agent_once
from agent.ui_formatter import CLIFormatter

async def test_token_tracking():
    """Quick test to verify token tracking works."""
    CLIFormatter.print_header()
    
    # Test 1: Simple interaction
    CLIFormatter.print_thinking("Test 1: Simple greeting...")
    state = await run_agent_once("Hola", None)
    
    message = state.get("messages", [])[-1].get("content", "")
    token_usage = state.get("token_usage")
    total_tokens = state.get("total_tokens", 0)
    
    print()
    CLIFormatter.print_interaction_summary(
        user_message="Hola",
        response=message,
        token_usage=token_usage,
        total_session_tokens=total_tokens
    )
    
    # Test 2: Follow-up interaction
    CLIFormatter.print_thinking("Test 2: Follow-up question...")
    state = await run_agent_once("What is AI?", state)
    
    message = state.get("messages", [])[-1].get("content", "")
    token_usage = state.get("token_usage")
    total_tokens = state.get("total_tokens", 0)
    
    print()
    CLIFormatter.print_interaction_summary(
        user_message="What is AI?",
        response=message,
        token_usage=token_usage,
        total_session_tokens=total_tokens
    )
    
    # Print final stats
    print()
    CLIFormatter.print_success("All tests completed!")
    CLIFormatter.print_usage_stats({
        "Total Interactions": state.get("iteration_count", 0),
        "Total Tokens Used": total_tokens,
    })

if __name__ == "__main__":
    asyncio.run(test_token_tracking())
