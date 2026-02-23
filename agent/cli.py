import asyncio
import logging
from agent.graph import run_agent_once
from agent.ui_formatter import CLIFormatter

logger = logging.getLogger(__name__)

def main():
    """Main CLI interface with token tracking and beautiful formatting."""
    CLIFormatter.print_header()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    state = None
    
    try:
        while True:
            try:
                user_input = CLIFormatter.get_user_input()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ("exit", "quit"):
                    CLIFormatter.print_info("Goodbye!")
                    if state:
                        total_tokens = state.get("total_tokens", 0)
                        iterations = state.get("iteration_count", 0)
                        if total_tokens > 0 or iterations > 0:
                            print()
                            CLIFormatter.print_usage_stats({
                                "Total Iterations": iterations,
                                "Total Tokens": total_tokens,
                            })
                    break
                
                CLIFormatter.print_thinking("Processing...")
                
                state = loop.run_until_complete(run_agent_once(user_input, state))
                
                # Extract response from state
                messages = state.get("messages", [])
                if not messages:
                    CLIFormatter.print_error("No response received")
                    continue
                    
                assistant = messages[-1]
                response_text = assistant.get("content", "")
                
                # Handle empty response
                if not response_text or "[" in response_text and "failed" in response_text.lower():
                    logger.error(f"Invalid response: {response_text}")
                    CLIFormatter.print_error("Failed to get a valid response")
                    continue
                
                token_usage = state.get("token_usage")
                total_tokens = state.get("total_tokens", 0)
                
                # Print interaction summary
                CLIFormatter.print_interaction_summary(
                    user_message=user_input,
                    response=response_text,
                    token_usage=token_usage,
                    total_session_tokens=total_tokens
                )
                
            except KeyboardInterrupt:
                print()
                CLIFormatter.print_info("Interrupted by user")
                break
            except Exception as e:
                CLIFormatter.print_error(str(e))
                logger.exception("Error in CLI loop")
                
    finally:
        loop.close()

if __name__ == "__main__":
    main()