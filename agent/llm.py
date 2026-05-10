"""LLM client initialisation for NOVA.

Exposes a module-level ``llm`` singleton and helpers for runtime
reconfiguration via the Settings panel.

Uses Ollama as the local LLM provider — no external API keys required.
"""

import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from langchain_ollama import ChatOllama

logger = logging.getLogger(__name__)

load_dotenv()

# ── Ollama model catalogue (tier → list of known model names) ────────

OLLAMA_MODEL_TIERS: dict[str, list[str]] = {
    "basic": [
        "gemma3:1b",
        "llama3.2:1b",
        "qwen3:1.7b",
        "phi4-mini",
        "deepseek-r1:1.5b",
        "smollm2:1.7b",
    ],
    "intermediate": [
        "gemma3:4b",
        "llama3.2:3b",
        "llama3.1:8b",
        "qwen3:8b",
        "mistral",
        "phi4",
        "deepseek-r1:8b",
    ],
    "advanced": [
        "gemma4:27b",
        "llama3.3:70b",
        "qwen3:32b",
        "deepseek-r1:32b",
        "command-r:35b",
    ],
}

# Flat reverse lookup: model_name → tier
_MODEL_TO_TIER: dict[str, str] = {
    m: tier for tier, models in OLLAMA_MODEL_TIERS.items() for m in models
}

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME: str = os.getenv("NOVA_MODEL_NAME", "gemma3:4b")
TEMPERATURE: float = float(os.getenv("NOVA_TEMPERATURE", "0.7"))
KEEP_ALIVE: int = int(os.getenv("NOVA_KEEP_ALIVE", "-1"))
NUM_CTX: int | None = int(os.getenv("NOVA_NUM_CTX")) if os.getenv("NOVA_NUM_CTX") else None
LLM_TIMEOUT: float = float(os.getenv("NOVA_LLM_TIMEOUT", "120"))

llm: ChatOllama | None = None


def _build_ollama_kwargs() -> dict:
    """Build kwargs dict for ChatOllama, including optional parameters."""
    kwargs: dict = {
        "model": MODEL_NAME,
        "temperature": TEMPERATURE,
        "base_url": OLLAMA_BASE_URL,
        "keep_alive": KEEP_ALIVE,
        "client_kwargs": {"timeout": httpx.Timeout(LLM_TIMEOUT)},
        "async_client_kwargs": {"timeout": httpx.Timeout(LLM_TIMEOUT)},
    }
    if NUM_CTX is not None:
        kwargs["num_ctx"] = NUM_CTX
    return kwargs


try:
    llm = ChatOllama(**_build_ollama_kwargs())
    logger.info(
        "ChatOllama initialised – model=%s base_url=%s keep_alive=%s timeout=%s",
        MODEL_NAME,
        OLLAMA_BASE_URL,
        KEEP_ALIVE,
        LLM_TIMEOUT,
    )
except Exception as e:
    logger.error("Failed to initialise ChatOllama: %s", e)


def get_llm() -> ChatOllama | None:
    """Return the configured LLM instance (may be ``None``)."""
    return llm


async def list_ollama_models() -> list[dict[str, Any]]:
    """Query the local Ollama instance for downloaded models.

    Returns a list of dicts with ``name``, ``size``, ``modified_at``,
    and ``tier`` (basic / intermediate / advanced / unknown).
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Cannot reach Ollama at %s: %s", OLLAMA_BASE_URL, exc)
        return []

    models: list[dict[str, Any]] = []
    for m in data.get("models", []):
        name: str = m.get("name", "")
        # Determine tier from catalogue; fall back to "unknown"
        tier = _MODEL_TO_TIER.get(name, "unknown")
        models.append({
            "name": name,
            "size": m.get("size", 0),
            "modified_at": m.get("modified_at", ""),
            "tier": tier,
        })
    return sorted(models, key=lambda x: x["name"])


def get_settings() -> dict:
    """Return current LLM / Ollama settings."""
    return {
        "model_name": MODEL_NAME,
        "temperature": TEMPERATURE,
        "ollama_base_url": OLLAMA_BASE_URL,
        "model_tiers": OLLAMA_MODEL_TIERS,
    }


def reinitialize_llm(
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
    ollama_base_url: Optional[str] = None,
) -> bool:
    """Reinitialize the LLM with new parameters and persist to ``.env``."""
    global llm, MODEL_NAME, TEMPERATURE, OLLAMA_BASE_URL

    if model_name is not None:
        MODEL_NAME = model_name
        os.environ["NOVA_MODEL_NAME"] = model_name
        _update_env_file("NOVA_MODEL_NAME", model_name)

    if temperature is not None:
        TEMPERATURE = temperature
        os.environ["NOVA_TEMPERATURE"] = str(temperature)
        _update_env_file("NOVA_TEMPERATURE", str(temperature))

    if ollama_base_url is not None:
        OLLAMA_BASE_URL = ollama_base_url
        os.environ["OLLAMA_BASE_URL"] = ollama_base_url
        _update_env_file("OLLAMA_BASE_URL", ollama_base_url)

    try:
        llm = ChatOllama(**_build_ollama_kwargs())
        logger.info(
            "LLM reinitialised – model=%s base_url=%s temp=%.2f",
            MODEL_NAME,
            OLLAMA_BASE_URL,
            TEMPERATURE,
        )
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