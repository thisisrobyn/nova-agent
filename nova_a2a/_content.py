"""Shared helper for flattening LLM message content into plain text.

Both the workers (:mod:`nova_a2a.worker`) and the merge step
(:mod:`nova_a2a.aggregator`) read the final text out of an ``AIMessage``
returned by a chat model. A reasoning model puts a list of typed blocks in
``content`` instead of a string, and stringifying that list verbatim leaks
its Python repr — signature and all — into what the user reads.
"""

from __future__ import annotations


def content_to_text(content: object) -> str:
    """Extract only the ``text`` blocks from an LLM response's ``content``."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type", "text") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts).strip()
    return "" if content is None else str(content)
