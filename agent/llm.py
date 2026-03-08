"""LLM client initialisation for NOVA.

Exposes a module-level ``llm`` singleton and helpers for runtime
reconfiguration via the Settings panel.
"""

import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

load_dotenv()

AVAILABLE_MODELS: list[str] = [
    "gpt-4.1",
    "gpt-4.1-mini",
]

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


def get_settings() -> dict:
    """Return current LLM settings with a masked API key."""
    raw_key = os.getenv("OPENAI_API_KEY", "")
    masked = ("•" * 8 + raw_key[-4:]) if len(raw_key) > 4 else ""
    return {
        "openai_api_key_masked": masked,
        "has_api_key": bool(raw_key),
        "model_name": MODEL_NAME,
        "temperature": TEMPERATURE,
        "available_models": AVAILABLE_MODELS,
    }


def reinitialize_llm(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
) -> bool:
    """Reinitialize the LLM with new parameters and persist to ``.env``."""
    global llm, MODEL_NAME, TEMPERATURE

    if model_name is not None:
        MODEL_NAME = model_name
        os.environ["NOVA_MODEL_NAME"] = model_name
        _update_env_file("NOVA_MODEL_NAME", model_name)

    if temperature is not None:
        TEMPERATURE = temperature
        os.environ["NOVA_TEMPERATURE"] = str(temperature)
        _update_env_file("NOVA_TEMPERATURE", str(temperature))

    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
        _update_env_file("OPENAI_API_KEY", api_key)

    key = os.getenv("OPENAI_API_KEY")
    if not key:
        logger.warning("Cannot reinitialize LLM – no API key")
        return False

    try:
        llm = ChatOpenAI(
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            api_key=key,
        )
        logger.info("LLM reinitialised – model=%s temp=%.2f", MODEL_NAME, TEMPERATURE)
        return True
    except Exception as e:
        logger.error("Failed to reinitialize LLM: %s", e)
        return False


def _update_env_file(key: str, value: str) -> None:
    """Update (or append) a key in the project ``.env`` file."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        env_path.write_text(f"{key}={value}\n")
        return

    lines = env_path.read_text().splitlines()
    found = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}")

    env_path.write_text("\n".join(lines) + "\n")