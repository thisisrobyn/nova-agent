"""LLM client initialisation for NOVA.

Exposes a module-level ``llm`` singleton and a helper
``get_llm()`` that returns the instance (useful for lazy access).
"""

import logging
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

load_dotenv()

MODEL_NAME: str = os.getenv("NOVA_MODEL_NAME", "gpt-4.1-mini")
TEMPERATURE: float = float(os.getenv("NOVA_TEMPERATURE", "0.7"))

_api_key = os.getenv("OPENAI_API_KEY")

llm: ChatOpenAI | None = None

if _api_key:
    try:
        llm = ChatOpenAI(
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            api_key=_api_key,
        )
        logger.info("ChatOpenAI initialised – model=%s", MODEL_NAME)
    except Exception as e:
        logger.error("Failed to initialise ChatOpenAI: %s", e)
else:
    logger.warning("OPENAI_API_KEY not set – LLM unavailable")


def get_llm() -> ChatOpenAI | None:
    """Return the configured LLM instance (may be ``None``)."""
    return llm