"""LLM client initialisation for NOVA.

Exposes a module-level ``llm`` singleton and helpers for runtime
reconfiguration via the Settings panel.

Supports three providers, selected via ``NOVA_PROVIDER``:
- ``ollama``    — local models via ``langchain-ollama`` (default, no API key)
- ``openai``    — cloud models via ``langchain-openai`` (needs ``OPENAI_API_KEY``)
- ``anthropic`` — cloud models via ``langchain-anthropic`` (needs ``ANTHROPIC_API_KEY``)
"""

import json
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

# Approximate download sizes in GB for catalogue models (shown before pulling).
OLLAMA_MODEL_SIZES_GB: dict[str, float] = {
    "gemma3:1b": 0.8, "llama3.2:1b": 1.3, "qwen3:1.7b": 1.4, "phi4-mini": 2.5,
    "deepseek-r1:1.5b": 1.1, "smollm2:1.7b": 1.8,
    "gemma3:4b": 3.3, "llama3.2:3b": 2.0, "llama3.1:8b": 4.9, "qwen3:8b": 5.2,
    "mistral": 4.1, "phi4": 9.1, "deepseek-r1:8b": 4.9,
    "gemma4:27b": 17.0, "llama3.3:70b": 43.0, "qwen3:32b": 20.0,
    "deepseek-r1:32b": 20.0, "command-r:35b": 20.0,
}

# Flat reverse lookup: model_name → tier
_MODEL_TO_TIER: dict[str, str] = {
    m: tier for tier, models in OLLAMA_MODEL_TIERS.items() for m in models
}

# ── Configuration (env defaults, overridden by runtime settings) ─────
#
# Runtime settings changed from the UI are persisted to ``data/settings.json``
# (NOT ``.env``): writing ``.env`` would make Vite's dev server reload the whole
# page on every settings change, since its ``envDir`` is the project root.

_SETTINGS_PATH = Path(__file__).resolve().parent.parent / "data" / "settings.json"

PROVIDER: str = os.getenv("NOVA_PROVIDER", "ollama").lower()
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME: str = os.getenv("NOVA_MODEL_NAME", "gemma3:4b")
TEMPERATURE: float = float(os.getenv("NOVA_TEMPERATURE", "0.7"))
KEEP_ALIVE: int = int(os.getenv("NOVA_KEEP_ALIVE", "-1"))
# Ollama defaults to a very small context window (2048 tokens on most models),
# and NOVA's system prompt plus ~40 tool schemas exceed even 8192: Ollama then
# truncates from the top, the model loses its instructions and tool definitions,
# and starts inventing pseudo-tools ("google:calendar:create event") with
# hallucinated dates. Empirically, with every service connected the same
# request that fails at 8192 produces a perfect tool call at 16384.
_DEFAULT_NUM_CTX = 16384
NUM_CTX: int = int(os.getenv("NOVA_NUM_CTX") or _DEFAULT_NUM_CTX)
LLM_TIMEOUT: float = float(os.getenv("NOVA_LLM_TIMEOUT", "120"))
# Thinking/reasoning mode for models that support it (qwen3, deepseek-r1...).
# "true" forces it on, "false" off, unset leaves the model's own default.
# Thinking costs seconds per turn but is measurably what makes small models
# get dates and tool arguments right — disable it only for chat-heavy use.
_reasoning_env = os.getenv("NOVA_REASONING", "").strip().lower()
REASONING: bool | None = (
    True if _reasoning_env == "true" else False if _reasoning_env == "false" else None
)
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

# Cloud endpoints are pinned explicitly. Left unset, the provider SDKs fall back
# to ANTHROPIC_BASE_URL / OPENAI_BASE_URL from the environment, which lets a
# local-LLM override (e.g. an Ollama URL exported for another tool) silently
# hijack the cloud path and send /v1/messages to localhost:11434.
ANTHROPIC_BASE_URL: str = os.getenv(
    "NOVA_ANTHROPIC_BASE_URL", "https://api.anthropic.com"
)
OPENAI_BASE_URL: str = os.getenv("NOVA_OPENAI_BASE_URL", "https://api.openai.com/v1")


def _load_persisted_settings() -> None:
    """Override config globals from ``data/settings.json`` if present."""
    global PROVIDER, MODEL_NAME, TEMPERATURE, OLLAMA_BASE_URL
    global OPENAI_API_KEY, ANTHROPIC_API_KEY
    try:
        data = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return
    PROVIDER = str(data.get("provider", PROVIDER)).lower()
    MODEL_NAME = data.get("model_name", MODEL_NAME)
    TEMPERATURE = float(data.get("temperature", TEMPERATURE))
    OLLAMA_BASE_URL = data.get("ollama_base_url", OLLAMA_BASE_URL)
    OPENAI_API_KEY = data.get("openai_api_key", OPENAI_API_KEY)
    ANTHROPIC_API_KEY = data.get("anthropic_api_key", ANTHROPIC_API_KEY)


def _persist_settings(updates: dict) -> None:
    """Merge ``updates`` into ``data/settings.json``."""
    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        current: dict = {}
        if _SETTINGS_PATH.exists():
            try:
                current = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                current = {}
        current.update(updates)
        _SETTINGS_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to persist settings: %s", exc)


_load_persisted_settings()

llm: Any | None = None


def _build_ollama_kwargs() -> dict:
    """Build kwargs dict for ChatOllama, including optional parameters."""
    kwargs: dict = {
        "model": MODEL_NAME,
        "temperature": TEMPERATURE,
        "base_url": OLLAMA_BASE_URL,
        "keep_alive": KEEP_ALIVE,
        "client_kwargs": {"timeout": httpx.Timeout(LLM_TIMEOUT)},
        "async_client_kwargs": {"timeout": httpx.Timeout(LLM_TIMEOUT)},
        "num_ctx": NUM_CTX,
    }
    if REASONING is not None:
        kwargs["reasoning"] = REASONING
    return kwargs


def _build_llm() -> Any | None:
    """Construct the LLM client for the active provider (or ``None`` on failure)."""
    try:
        if PROVIDER == "openai":
            if not OPENAI_API_KEY:
                logger.warning("OpenAI selected but OPENAI_API_KEY is not set")
                return None
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(
                model=MODEL_NAME,
                temperature=TEMPERATURE,
                api_key=OPENAI_API_KEY,
                base_url=OPENAI_BASE_URL,
                timeout=LLM_TIMEOUT,
            )

        if PROVIDER == "anthropic":
            if not ANTHROPIC_API_KEY:
                logger.warning("Anthropic selected but ANTHROPIC_API_KEY is not set")
                return None
            from langchain_anthropic import ChatAnthropic

            # NOTE: the newest Claude models (Opus 4.x, Sonnet 5, Fable 5) reject
            # ``temperature`` with a 400, so we omit it for the Anthropic path.
            return ChatAnthropic(
                model=MODEL_NAME,
                api_key=ANTHROPIC_API_KEY,
                base_url=ANTHROPIC_BASE_URL,
                timeout=LLM_TIMEOUT,
                max_tokens=4096,
            )

        # Default: Ollama (local)
        return ChatOllama(**_build_ollama_kwargs())
    except Exception as e:
        logger.error("Failed to initialise LLM for provider '%s': %s", PROVIDER, e)
        return None


llm = _build_llm()
if llm is not None:
    logger.info("LLM initialised – provider=%s model=%s", PROVIDER, MODEL_NAME)


def get_llm() -> Any | None:
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
        tier = _MODEL_TO_TIER.get(name, _MODEL_TO_TIER.get(name.split(":")[0], "unknown"))
        models.append({
            "name": name,
            "size": m.get("size", 0),
            "modified_at": m.get("modified_at", ""),
            "tier": tier,
        })
    return sorted(models, key=lambda x: x["name"])


def _mask(key: str) -> str:
    """Mask an API key for display (keeps a short prefix/suffix)."""
    if not key:
        return ""
    if len(key) <= 12:
        return "****"
    return f"{key[:6]}...{key[-4:]}"


def get_settings() -> dict:
    """Return current LLM / provider settings."""
    return {
        "provider": PROVIDER,
        "model_name": MODEL_NAME,
        "temperature": TEMPERATURE,
        "ollama_base_url": OLLAMA_BASE_URL,
        "model_tiers": OLLAMA_MODEL_TIERS,
        "openai_key_set": bool(OPENAI_API_KEY),
        "anthropic_key_set": bool(ANTHROPIC_API_KEY),
        "openai_key_masked": _mask(OPENAI_API_KEY),
        "anthropic_key_masked": _mask(ANTHROPIC_API_KEY),
    }


def reinitialize_llm(
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
    ollama_base_url: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    anthropic_api_key: Optional[str] = None,
) -> bool:
    """Reinitialize the LLM with new parameters and persist to ``.env``.

    Transactional: the candidate values are applied and the LLM is built
    first; globals and the ``.env`` file are only persisted when the build
    succeeds. On failure the previous configuration is restored untouched.
    """
    global llm, PROVIDER, MODEL_NAME, TEMPERATURE, OLLAMA_BASE_URL
    global OPENAI_API_KEY, ANTHROPIC_API_KEY

    snapshot = (PROVIDER, MODEL_NAME, TEMPERATURE, OLLAMA_BASE_URL,
                OPENAI_API_KEY, ANTHROPIC_API_KEY)

    # Apply candidates to the module globals so ``_build_llm`` sees them.
    if provider is not None:
        PROVIDER = provider.lower()
    if model_name is not None:
        MODEL_NAME = model_name
    if temperature is not None:
        TEMPERATURE = temperature
    if ollama_base_url is not None:
        OLLAMA_BASE_URL = ollama_base_url
    if openai_api_key is not None:
        OPENAI_API_KEY = openai_api_key
    if anthropic_api_key is not None:
        ANTHROPIC_API_KEY = anthropic_api_key

    candidate = _build_llm()
    if candidate is None:
        # Roll back — nothing is persisted.
        (PROVIDER, MODEL_NAME, TEMPERATURE, OLLAMA_BASE_URL,
         OPENAI_API_KEY, ANTHROPIC_API_KEY) = snapshot
        logger.error("LLM reinitialisation failed; configuration unchanged")
        return False

    # Commit: build succeeded — persist changed keys to data/settings.json.
    llm = candidate
    updates: dict = {}
    if provider is not None:
        updates["provider"] = PROVIDER
    if model_name is not None:
        updates["model_name"] = MODEL_NAME
    if temperature is not None:
        updates["temperature"] = TEMPERATURE
    if ollama_base_url is not None:
        updates["ollama_base_url"] = OLLAMA_BASE_URL
    if openai_api_key is not None:
        updates["openai_api_key"] = OPENAI_API_KEY
    if anthropic_api_key is not None:
        updates["anthropic_api_key"] = ANTHROPIC_API_KEY
    if updates:
        _persist_settings(updates)

    logger.info(
        "LLM reinitialised – provider=%s model=%s temp=%.2f",
        PROVIDER, MODEL_NAME, TEMPERATURE,
    )
    return True
