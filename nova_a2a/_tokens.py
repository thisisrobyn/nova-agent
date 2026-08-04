"""Token-usage extraction, shared by the A2A worker and the aggregator.

Providers report the same numbers under three different shapes, and only one
of them is a LangChain convention:

* ``usage_metadata`` — LangChain's normalised field (``input_tokens`` /
  ``output_tokens`` / ``total_tokens``). Present on every recent chat model,
  Ollama included, and therefore the one to read first.
* ``response_metadata["usage"|"token_usage"]`` — the provider's own payload,
  passed through verbatim (OpenAI-style naming).
* ``response_metadata["prompt_eval_count"|"eval_count"]`` — Ollama's raw
  counters, which is all that is left on older ``langchain-ollama`` releases.

Reading only the second shape is why an orchestrated turn used to report zero
tokens and the UI hid its counter entirely.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from langchain_core.messages import AIMessage

Usage = Dict[str, int]

_KEYS = ("prompt_tokens", "completion_tokens", "total_tokens")


def _safe_int(value: object, default: int = 0) -> int:
    """Coerce token-numeric payloads into an int without raising."""
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _build(prompt: int, completion: int, total: int) -> Optional[Usage]:
    """Return a usage dict, or ``None`` when the provider reported nothing."""
    if not (prompt or completion or total):
        return None
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total or prompt + completion,
    }


def usage_from_message(message: Any) -> Optional[Usage]:
    """Read one message's token usage, whichever shape the provider used.

    Args:
        message: An LLM response message (or anything else — non-messages and
            messages without usage simply yield ``None``).

    Returns:
        A ``prompt_tokens`` / ``completion_tokens`` / ``total_tokens`` dict, or
        ``None`` when the provider reported no usage at all.
    """
    metadata = getattr(message, "usage_metadata", None)
    if isinstance(metadata, dict):
        usage = _build(
            _safe_int(metadata.get("input_tokens")),
            _safe_int(metadata.get("output_tokens")),
            _safe_int(metadata.get("total_tokens")),
        )
        if usage:
            return usage

    response_metadata = getattr(message, "response_metadata", None)
    if not isinstance(response_metadata, dict):
        return None

    reported = response_metadata.get("usage") or response_metadata.get("token_usage")
    if isinstance(reported, dict):
        prompt = _safe_int(reported.get("prompt_tokens", reported.get("input_tokens", 0)))
        completion = _safe_int(
            reported.get("completion_tokens", reported.get("output_tokens", 0))
        )
        usage = _build(prompt, completion, _safe_int(reported.get("total_tokens")))
        if usage:
            return usage

    return _build(
        _safe_int(response_metadata.get("prompt_eval_count")),
        _safe_int(response_metadata.get("eval_count")),
        0,
    )


def merge_usage(*usages: Optional[Usage]) -> Optional[Usage]:
    """Sum any number of usage dicts, ignoring the ones that are ``None``."""
    totals: Usage = {key: 0 for key in _KEYS}
    found = False
    for usage in usages:
        if not usage:
            continue
        found = True
        for key in _KEYS:
            totals[key] += _safe_int(usage.get(key))
    if not found:
        return None
    totals["total_tokens"] = totals["total_tokens"] or (
        totals["prompt_tokens"] + totals["completion_tokens"]
    )
    return totals


def collect_usage(messages: Iterable[object]) -> Optional[Usage]:
    """Accumulate the usage of every AI message in *messages*."""
    return merge_usage(
        *(usage_from_message(m) for m in messages if isinstance(m, AIMessage))
    )
