"""Shared plumbing for the provider MCP servers.

Centralises three things every provider tool needs:

- resolving (and transparently refreshing) the user's access token;
- issuing authenticated JSON requests;
- turning failures into text the agent can relay to the user, since MCP tools
  must never raise into the agent loop.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable

import httpx
import structlog

from connections import get_access_token
from connections.providers import get_provider

logger = structlog.stdlib.get_logger(__name__)

_HTTP_TIMEOUT = 30


class ServiceError(Exception):
    """A failure already phrased for the agent to relay to the user."""


def not_connected_message(provider_id: str) -> str:
    """Instruction returned when the user has not connected a service.

    Phrased as a directive because it is consumed by the LLM, not shown
    verbatim: the agent must relay the reason in the user's own language
    instead of retrying or inventing a result.
    """
    provider = get_provider(provider_id)
    label = provider.label if provider else provider_id
    return (
        f"NOT_CONNECTED: The user is not signed in to {label}, so this action "
        f"cannot be performed. Do not retry and do not invent a result. Tell "
        f"the user — in their own language — that you cannot do this because "
        f"their {label} account is not connected, and that they can connect it "
        f"from the connections panel in the sidebar."
    )


async def require_token(provider_id: str) -> str:
    """Return a usable access token for the *current* user.

    The acting user comes from :mod:`connections.context`, set per request by
    the chat endpoints — this is what keeps one user's tool calls out of
    another user's mailbox on a shared deployment.

    Raises:
        ServiceError: When this user has not connected the service.
    """
    from connections.context import get_current_user

    token = await get_access_token(provider_id, get_current_user())
    if not token:
        raise ServiceError(not_connected_message(provider_id))
    return token


async def call_api(
    provider_id: str,
    method: str,
    url: str,
    *,
    params: Dict[str, Any] | None = None,
    json: Any | None = None,
    extra_headers: Dict[str, str] | None = None,
) -> Any:
    """Make an authenticated request and return the decoded JSON body.

    Args:
        provider_id: Connection whose access token authorizes the call.
        method: HTTP verb.
        url: Absolute endpoint URL.
        params: Query-string parameters.
        json: JSON request body.
        extra_headers: Provider-specific headers (e.g. GitHub's ``Accept``).

    Returns:
        The parsed JSON body, or ``None`` for empty responses.

    Raises:
        ServiceError: For any failure, already phrased for the user.
    """
    token = await require_token(provider_id)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.request(
                method, url, params=params, json=json, headers=headers
            )
    except httpx.RequestError as exc:
        raise ServiceError(f"Could not reach the {provider_id} API: {exc}") from exc

    if resp.status_code == 401:
        # The token was accepted by our store but rejected upstream — most
        # often a revoked grant, which the user fixes by reconnecting.
        raise ServiceError(
            f"AUTH_EXPIRED: {provider_id} rejected the stored credentials. Tell "
            f"the user their {provider_id} session is no longer valid and that "
            f"they need to reconnect the service from the connections panel."
        )
    if resp.status_code == 403:
        raise ServiceError(
            f"PERMISSION_DENIED: {provider_id} refused this action. The connected "
            f"account may lack permission, or the required scope was not granted. "
            f"Details: {_error_detail(resp)}"
        )
    if resp.status_code == 404:
        raise ServiceError(f"NOT_FOUND: {_error_detail(resp)}")
    if resp.status_code >= 400:
        raise ServiceError(
            f"The {provider_id} API returned {resp.status_code}: {_error_detail(resp)}"
        )

    if not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def _error_detail(resp: httpx.Response) -> str:
    """Extract a human-readable message from an error response."""
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:300]

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)
        if isinstance(error, str):
            return str(data.get("error_description") or error)
        if "message" in data:
            return str(data["message"])
    return str(data)[:300]


# ── Output formatting ────────────────────────────────────────

def bullet_list(items: Iterable[str], empty: str) -> str:
    """Render results as a bullet list, or a message when there are none."""
    rendered = [f"- {item}" for item in items]
    return "\n".join(rendered) if rendered else empty


def truncate(text: str | None, limit: int = 200) -> str:
    """Collapse whitespace and cut long text so results stay token-cheap."""
    if not text:
        return ""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"
