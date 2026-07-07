"""Ollama process control and cloud-provider model discovery.

Powers the Settings panel:
- real-time Ollama status (``ollama_status``)
- best-effort start of the local Ollama server (``start_ollama``)
- streaming model download with progress (``stream_pull``)
- a downloadable-model catalogue (``build_catalog``)
- API-key validation + model listing for OpenAI / Anthropic
  (``list_provider_models``)
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from typing import Any, AsyncGenerator

import httpx

from agent.llm import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL_SIZES_GB,
    OLLAMA_MODEL_TIERS,
    list_ollama_models,
)

logger = logging.getLogger(__name__)

# Anthropic requires a version header on every request.
_ANTHROPIC_VERSION = "2023-06-01"


# ── Ollama status / lifecycle ────────────────────────────────────────

async def ollama_status() -> dict[str, Any]:
    """Return real-time Ollama reachability."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
            resp.raise_for_status()
        return {"running": True, "base_url": OLLAMA_BASE_URL}
    except Exception:
        return {"running": False, "base_url": OLLAMA_BASE_URL}


async def start_ollama() -> dict[str, Any]:
    """Best-effort start of the local ``ollama serve`` process.

    If Ollama is already running (or a service already owns the port), the
    spawn fails harmlessly and we still report success once it responds.
    """
    status = await ollama_status()
    if status["running"]:
        return {"started": True, "already_running": True}

    try:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        return {
            "started": False,
            "error": "Ollama is not installed or not on PATH.",
        }
    except Exception as exc:  # pragma: no cover - platform dependent
        logger.warning("Failed to spawn 'ollama serve': %s", exc)

    # Poll until it responds (up to ~10s).
    for _ in range(20):
        await asyncio.sleep(0.5)
        if (await ollama_status())["running"]:
            return {"started": True, "already_running": False}

    return {"started": False, "error": "Ollama did not start in time."}


async def stream_pull(model: str) -> AsyncGenerator[str, None]:
    """Stream ``ollama pull`` progress as SSE ``data:`` lines.

    Relays Ollama's JSON progress objects (``status``, ``total``,
    ``completed``) and emits a final ``done`` / ``error`` event.
    """
    payload = {"name": model, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{OLLAMA_BASE_URL}/api/pull", json=payload
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    yield _sse({"type": "error", "message": body[:300]})
                    return
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if "error" in obj:
                        yield _sse({"type": "error", "message": obj["error"]})
                        return
                    yield _sse({
                        "type": "progress",
                        "status": obj.get("status", ""),
                        "total": obj.get("total", 0),
                        "completed": obj.get("completed", 0),
                    })
        yield _sse({"type": "done", "model": model})
    except Exception as exc:
        logger.warning("Ollama pull failed for %s: %s", model, exc)
        yield _sse({"type": "error", "message": str(exc)})


def _sse(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj)}\n\n"


async def build_catalog() -> list[dict[str, Any]]:
    """Return the known-model catalogue, flagging which are already downloaded."""
    downloaded = {m["name"] for m in await list_ollama_models()}
    catalog: list[dict[str, Any]] = []
    for tier, names in OLLAMA_MODEL_TIERS.items():
        for name in names:
            catalog.append({
                "name": name,
                "tier": tier,
                "provider": "Ollama (local)",
                "size_gb": OLLAMA_MODEL_SIZES_GB.get(name, 0.0),
                "downloaded": name in downloaded,
            })
    return catalog


# ── Cloud provider validation + model listing ────────────────────────

async def list_provider_models(provider: str, api_key: str) -> dict[str, Any]:
    """Validate an API key and list available chat models for the provider.

    Returns ``{"valid": bool, "models": [...], "error": str | None}``.
    """
    provider = provider.lower()
    if not api_key:
        return {"valid": False, "models": [], "error": "API key is required."}

    try:
        if provider == "openai":
            return await _list_openai_models(api_key)
        if provider == "anthropic":
            return await _list_anthropic_models(api_key)
        return {"valid": False, "models": [], "error": f"Unknown provider: {provider}"}
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        msg = "Invalid API key." if code in (401, 403) else f"HTTP {code}"
        return {"valid": False, "models": [], "error": msg}
    except Exception as exc:
        return {"valid": False, "models": [], "error": str(exc)}


async def _list_openai_models(api_key: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

    models = []
    for m in data.get("data", []):
        mid = m.get("id", "")
        # Keep chat-capable models; drop embeddings/audio/image/moderation.
        if not (mid.startswith("gpt-") or mid.startswith("o1") or mid.startswith("o3")
                or mid.startswith("o4") or mid.startswith("chatgpt")):
            continue
        if any(x in mid for x in ("embedding", "audio", "realtime", "image",
                                  "tts", "whisper", "moderation", "transcribe")):
            continue
        models.append({"id": mid, "display_name": mid})

    models.sort(key=lambda x: x["id"], reverse=True)
    return {"valid": True, "models": models, "error": None}


async def _list_anthropic_models(api_key: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": _ANTHROPIC_VERSION,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

    models = [
        {"id": m.get("id", ""), "display_name": m.get("display_name", m.get("id", ""))}
        for m in data.get("data", [])
        if m.get("id")
    ]
    return {"valid": True, "models": models, "error": None}
