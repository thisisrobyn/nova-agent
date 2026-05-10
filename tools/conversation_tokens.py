"""Token counting tool for NOVA.

Allows the agent to count tokens in the current conversation
so users can see how much context is being consumed.
"""

import logging

from langchain_core.tools import tool

from tools.token_counter import count_tokens_for_message

logger = logging.getLogger(__name__)


@tool
def count_conversation_tokens(conversation: str) -> str:
    """Count the tokens in a conversation or text.

    Use this tool when the user asks how many tokens a conversation has
    used, or wants to know the token count of a given text.  Pass the
    full conversation text (or the specific text to measure).

    Args:
        conversation: The text or conversation content to count tokens for.

    Returns:
        A breakdown of the token count.
    """
    try:
        total = count_tokens_for_message(conversation)

        # Break down by rough message boundaries if present
        lines = conversation.strip().split('\n')
        word_count = len(conversation.split())
        char_count = len(conversation)

        return (
            f"Token count: {total:,}\n"
            f"Characters: {char_count:,}\n"
            f"Words: {word_count:,}\n"
            f"Lines: {len(lines):,}"
        )
    except Exception as e:
        logger.error("count_conversation_tokens failed: %s", e)
        return f"Error counting tokens: {e}"
