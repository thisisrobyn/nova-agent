import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def count_tokens_for_message(content: str, model: str = "gpt-4-mini") -> int:
    """Count tokens in a message using tiktoken.
    
    Args:
        content: The message content to count tokens for.
        model: The model name to use for encoding (default: gpt-4-mini).
        
    Returns:
        The number of tokens in the content.
    """
    try:
        import tiktoken
        encoding = tiktoken.encoding_for_model(model)
        tokens = encoding.encode(content)
        return len(tokens)
    except Exception as e:
        logger.warning(f"Failed to count tokens with tiktoken: {e}. Using approximation.")
        return len(content) // 4


def extract_token_usage(llm_response: Dict[str, Any]) -> Optional[Dict[str, int]]:
    """Extract token usage information from an LLM response.
    
    Args:
        llm_response: The response object from the LLM (typically from invoke()).
        
    Returns:
        A dictionary with 'prompt_tokens', 'completion_tokens', and 'total_tokens',
        or None if token information is not available.
    """
    try:
        if hasattr(llm_response, 'response_metadata'):
            metadata = llm_response.response_metadata
            if 'usage' in metadata:
                usage = metadata['usage']
                return {
                    'prompt_tokens': usage.get('prompt_tokens', 0),
                    'completion_tokens': usage.get('completion_tokens', 0),
                    'total_tokens': usage.get('total_tokens', 0),
                }
        
        if hasattr(llm_response, 'token_usage'):
            return llm_response.token_usage
            
        return None
    except Exception as e:
        logger.debug(f"Failed to extract token usage: {e}")
        return None


def format_token_usage(token_usage: Optional[Dict[str, int]]) -> str:
    """Format token usage information for display.
    
    Args:
        token_usage: The token usage dictionary from extract_token_usage().
        
    Returns:
        A formatted string showing token usage.
    """
    if not token_usage:
        return "Token usage: Not available"
    
    return (
        f"Tokens used -> "
        f"prompt: {token_usage.get('prompt_tokens', 0)} | "
        f"completion: {token_usage.get('completion_tokens', 0)} | "
        f"total: {token_usage.get('total_tokens', 0)}"
    )


def log_message_tokens(
    role: str,
    content: str,
    token_usage: Optional[Dict[str, int]] = None,
    model: str = "gpt-4-mini"
) -> Dict[str, Any]:
    """Log and return token information for a message.
    
    Args:
        role: The message role ('user', 'assistant', etc.).
        content: The message content.
        token_usage: Optional token usage from API response.
        model: The model name for token counting.
        
    Returns:
        A dictionary with message info and token counts.
    """
    message_tokens = count_tokens_for_message(content, model)
    
    result = {
        'role': role,
        'content': content,
        'message_tokens': message_tokens,
        'api_tokens': token_usage,
    }
    
    if token_usage:
        logger.info(f"[{role.upper()}] {format_token_usage(token_usage)}")
    else:
        logger.info(f"[{role.upper()}] Estimated tokens: {message_tokens}")
    
    return result
