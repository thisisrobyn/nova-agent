"""Low-level LLM generation helper.

Wraps the configured ChatOpenAI instance with multiple call-pattern
fallbacks and automatic token usage extraction / estimation.
"""

import asyncio
import logging
from typing import Any, Dict, Optional, Tuple

from tools.token_counter import count_tokens_for_message

logger = logging.getLogger(__name__)

async def generate(text: str, max_tokens: int = 512, return_tokens: bool = False) -> Any:
    """Generate a response using the configured LLM client or return an echo fallback.

    The function attempts several common call patterns to support multiple LLM client
    implementations (callable objects, `predict`, `generate`, LangChain chat models, ...).

    Args:
        text: Input prompt or user message.
        max_tokens: Approximate token limit (best-effort).
        return_tokens: If True, returns a tuple of (response, token_usage). 
                      If False, returns only the response string.

    Returns:
        The LLM-generated text or a fallback echo.
        If return_tokens=True, returns a tuple: (response_text, token_usage_dict)
    """
    try:
        from agent.llm import llm

        if llm is None:
            raise ImportError("LLM not configured")

        loop = asyncio.get_event_loop()

        def sync_call() -> Any:
            try:
                # 1) Modern LangChain: use invoke() with HumanMessage
                if hasattr(llm, "invoke"):
                    from langchain_core.messages import HumanMessage
                    result = llm.invoke([HumanMessage(content=text)])
                    logger.debug(f"LLM invoke() successful, result type: {type(result).__name__}")
                    return result
                
                # 3) Common method names
                if hasattr(llm, "predict"):
                    result = llm.predict(text)
                    logger.debug(f"LLM predict() successful, result type: {type(result).__name__}")
                    return result
                
                # 4) Legacy generate() with proper Message handling
                if hasattr(llm, "generate"):
                    from langchain_core.messages import HumanMessage
                    result = llm.generate([HumanMessage(content=text)])
                    logger.debug(f"LLM generate() successful, result type: {type(result).__name__}")
                    return result
                
                logger.error("No suitable LLM method found (no invoke, predict, or generate)")
                raise AttributeError("LLM object has no suitable method")
                
            except Exception as e:
                logger.exception(f"LLM sync call failed: {e}")
                return None

        result = await loop.run_in_executor(None, sync_call)

        if result is None:
            error_msg = "LLM returned None - no valid response"
            logger.error(error_msg)
            response_text = error_msg
            token_usage = None
        else:
            token_usage = None
            response_text = None
            
            # Extract token usage first (if available)
            if hasattr(result, 'response_metadata'):
                try:
                    metadata = result.response_metadata
                    if isinstance(metadata, dict) and 'usage' in metadata:
                        usage = metadata['usage']
                        token_usage = {
                            'prompt_tokens': usage.get('prompt_tokens', 0),
                            'completion_tokens': usage.get('completion_tokens', 0),
                            'total_tokens': usage.get('total_tokens', 0),
                        }
                        logger.debug(f"Extracted token usage: {token_usage}")
                except Exception as e:
                    logger.debug(f"Failed to extract token usage: {e}")
            
            # Extract response text (in priority order)
            # 1) LangChain AIMessage with content attribute (string) - PRIMARY METHOD
            if hasattr(result, "content") and isinstance(result.content, str):
                response_text = result.content
                logger.debug(f"Response extracted from content attribute (len={len(response_text)})")
            
            # 2) Direct string result
            elif isinstance(result, str):
                response_text = result
                logger.debug(f"Response extracted as direct string (len={len(response_text)})")
            
            # 3) LangChain result with generations
            elif hasattr(result, "generations"):
                try:
                    gen = result.generations[0][0]
                    if hasattr(gen, "text"):
                        response_text = gen.text
                    else:
                        response_text = str(gen)
                    logger.debug(f"Response extracted from generations (len={len(response_text)})")
                except Exception as e:
                    logger.debug(f"Failed to unwrap generations: {e}")
            
            # 4) Object with text attribute
            if response_text is None and hasattr(result, "text"):
                response_text = str(result.text)
                logger.debug(f"Response extracted from text attribute (len={len(response_text)})")
            
            # Final fallback
            if response_text is None:
                response_text = f"[Extraction failed: unexpected type {type(result).__name__}]"
                logger.error(f"Could not extract text from result of type {type(result).__name__}")

        # If we don't have token_usage from the API, estimate using tiktoken
        if token_usage is None and response_text and not response_text.startswith("["):
            try:
                estimated_tokens = count_tokens_for_message(response_text, model="gpt-4-mini")
                prompt_tokens = count_tokens_for_message(text, model="gpt-4-mini")
                token_usage = {
                    'prompt_tokens': prompt_tokens,
                    'completion_tokens': estimated_tokens,
                    'total_tokens': prompt_tokens + estimated_tokens,
                }
                logger.debug(f"Using estimated tokens: {token_usage}")
            except Exception as e:
                logger.debug(f"Failed to estimate tokens: {e}")

        if return_tokens:
            return (response_text, token_usage)
        else:
            return response_text
    except Exception:
        logger.exception("Using LLM fallback")
        error_response = f"Echo: {text}"
        fallback_token_usage = None
        try:
            prompt_tokens = count_tokens_for_message(text, model="gpt-4-mini")
            completion_tokens = count_tokens_for_message(error_response, model="gpt-4-mini")
            fallback_token_usage = {
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': prompt_tokens + completion_tokens,
            }
        except Exception:
            pass
        
        if return_tokens:
            return (error_response, fallback_token_usage)
        else:
            return error_response