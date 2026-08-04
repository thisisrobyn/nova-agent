"""Outbound A2A calls — talking to an agent that is not in this process.

The counterpart of :mod:`nova_a2a.worker`. A worker executes a task by running
a graph locally; this executes one by sending it to another agent's endpoint
over JSON-RPC and reading the answer back. Both return the same
:class:`~nova_a2a.models.Task`, which is the whole point of having modelled the
protocol properly from the start: the orchestrator does not know or care which
of the two ran.

Only ``message/send`` is implemented. ``message/stream`` would let a remote
agent's tool calls appear in the diagram the way a local worker's do, and is
the obvious next step — but a remote agent that answers at all is worth more
than one that narrates and is not there yet.

Reference: https://a2a-protocol.org/latest/specification/#messagesend
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.stdlib.get_logger(__name__)

#: Ceiling on a single remote call. Deliberately generous: the peer is running
#: its own agent loop, not answering a database query.
_SEND_TIMEOUT_SECONDS = 120.0


def _text_of(payload: Any) -> str:
    """Pull the readable text out of whatever shape the peer answered with.

    The specification allows a result to be a Message or a Task, each holding
    parts that may be text, files or structured data. Only text is consumed
    here, and anything else is skipped rather than stringified into the answer.
    """
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload

    if isinstance(payload, dict):
        # A Task carries its output under `artifacts`; a Message under `parts`.
        for artifact in payload.get("artifacts") or []:
            text = _text_of(artifact)
            if text:
                return text
        for key in ("message", "status"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                text = _text_of(nested)
                if text:
                    return text
        parts: List[Dict[str, Any]] = payload.get("parts") or []
        chunks = [
            str(part.get("text", ""))
            for part in parts
            if isinstance(part, dict) and part.get("kind", "text") == "text"
        ]
        return "\n".join(chunk for chunk in chunks if chunk).strip()

    return ""


async def send_message(endpoint: str, text: str, context_id: str = "") -> Optional[str]:
    """Send *text* to a remote agent and return its reply.

    Args:
        endpoint: The peer's A2A URL, as advertised on its Agent Card.
        text: The task, in natural language.
        context_id: Groups several sends into one conversation on the peer's
            side. NOVA passes its run id, so a remote agent sees the turn the
            way the local workers do.

    Returns:
        The reply text, or ``None`` when the peer could not be reached or
        answered with something unusable. Never raises: a remote agent is the
        least reliable component in the system and must fail like any other
        task, not take the run down.
    """
    import httpx

    request = {
        "jsonrpc": "2.0",
        "id": uuid.uuid4().hex,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": text}],
                "messageId": uuid.uuid4().hex,
                **({"contextId": context_id} if context_id else {}),
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=_SEND_TIMEOUT_SECONDS) as client:
            response = await client.post(endpoint, json=request)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        logger.warning("remote agent call failed", endpoint=endpoint, error=str(exc))
        return None

    if isinstance(payload, dict) and payload.get("error"):
        logger.warning("remote agent returned an error", endpoint=endpoint, error=payload["error"])
        return None

    answer = _text_of((payload or {}).get("result"))
    if not answer:
        logger.warning("remote agent returned no text", endpoint=endpoint)
        return None

    logger.info("remote agent answered", endpoint=endpoint, chars=len(answer))
    return answer
