"""OAuth 2.0 authorization-code flow helpers.

NOVA acts as a *confidential* client: the browser only ever sees the
authorization URL, while the code-for-token exchange happens server-side so
the client secret never reaches the frontend.

Flow:

1. ``build_authorize_url`` -- the UI opens this in a popup.
2. The provider redirects back to ``/api/v1/connections/{provider}/callback``.
3. ``exchange_code`` -- swaps the code for tokens and identifies the account.
4. ``refresh_access_token`` -- called from the store when a token expires.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Dict
from urllib.parse import urlencode

import httpx
import structlog

from connections.credentials import ProviderCredentials, get_credentials
from connections.providers import OAuthProvider, get_provider, resolve_url
from connections.store import LOCAL_USER_ID, ServiceConnection

logger = structlog.stdlib.get_logger(__name__)

#: How long an unused ``state`` value stays valid.
_STATE_TTL_SECONDS = 600

_HTTP_TIMEOUT = 15


class OAuthError(Exception):
    """Raised when a provider rejects an authorization or token request."""


@dataclass
class _PendingAuth:
    """A state token issued for an in-flight authorization request."""

    provider: str
    user_id: str
    created_at: float
    #: UI language, so the popup's result page matches the rest of the app.
    lang: str = "en"


# In-process store of pending ``state`` values.  The API runs as a single
# process, so a dict is sufficient; a restart simply invalidates in-flight
# authorizations, which the user can retry.
_pending: Dict[str, _PendingAuth] = {}


def _prune_pending() -> None:
    """Drop state tokens that have outlived their TTL."""
    now = time.time()
    for state in [s for s, p in _pending.items() if now - p.created_at > _STATE_TTL_SECONDS]:
        _pending.pop(state, None)


def issue_state(
    provider_id: str, user_id: str = LOCAL_USER_ID, lang: str = "en"
) -> str:
    """Register and return a fresh single-use ``state`` value."""
    _prune_pending()
    state = secrets.token_urlsafe(32)
    _pending[state] = _PendingAuth(provider_id, user_id, time.time(), lang)
    return state


async def _require_credentials(provider: OAuthProvider) -> ProviderCredentials:
    """Return the provider's app credentials or explain what is missing."""
    creds = await get_credentials(provider.id)
    if creds is None:
        raise OAuthError(
            f"{provider.label} is not set up yet — register the application "
            f"and save its client id and secret first"
        )
    return creds


async def build_authorize_url(
    provider_id: str, user_id: str = LOCAL_USER_ID, lang: str = "en"
) -> tuple[str, str]:
    """Build the provider's authorization URL and register its ``state``.

    Args:
        provider_id: One of the ids in :data:`connections.providers.PROVIDERS`.
        user_id: NOVA user the resulting connection will belong to.
        lang: UI language, carried through so the callback page matches it.

    Returns:
        A ``(authorize_url, state)`` tuple.

    Raises:
        OAuthError: If the provider is unknown or has not been set up.
    """
    provider = get_provider(provider_id)
    if provider is None:
        raise OAuthError(f"Unknown provider: {provider_id}")

    creds = await _require_credentials(provider)
    state = issue_state(provider.id, user_id, lang)

    params = {
        "client_id": creds.client_id,
        "redirect_uri": provider.redirect_uri,
        "response_type": "code",
        "state": state,
        **provider.extra_authorize_params,
    }
    # GitHub Apps derive access from their configured permissions and reject
    # an empty ``scope``; every other provider requires one.
    if provider.scopes:
        params["scope"] = provider.scope_string

    base = resolve_url(provider.authorize_url, creds.tenant_id)
    return f"{base}?{urlencode(params)}", state


def consume_state(state: str) -> _PendingAuth | None:
    """Validate and single-use consume a ``state`` value from a callback."""
    _prune_pending()
    return _pending.pop(state, None)


async def _post_token_request(
    provider: OAuthProvider, creds: ProviderCredentials, data: dict
) -> dict:
    """POST to the provider's token endpoint and return the parsed payload."""
    headers = {"Accept": "application/json"}
    url = resolve_url(provider.token_url, creds.tenant_id)
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.post(url, data=data, headers=headers)

    try:
        payload = resp.json()
    except ValueError:
        raise OAuthError(f"{provider.label} returned a non-JSON token response")

    # GitHub answers 200 with an ``error`` field instead of a 4xx status.
    if resp.status_code >= 400 or "error" in payload:
        detail = payload.get("error_description") or payload.get("error") or resp.text
        raise OAuthError(f"{provider.label} token request failed: {detail}")

    return payload


async def _fetch_account_info(provider: OAuthProvider, access_token: str) -> tuple[str | None, str | None]:
    """Return ``(email, display_name)`` for the account that granted access."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(provider.userinfo_url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        # Identity is cosmetic -- never fail the connection because of it.
        logger.warning("could not fetch account info", provider=provider.id, error=str(exc))
        return None, None

    if provider.id == "google":
        return data.get("email"), data.get("name")
    if provider.id == "microsoft":
        return data.get("mail") or data.get("userPrincipalName"), data.get("displayName")
    if provider.id == "github":
        return data.get("email"), data.get("name") or data.get("login")
    return None, None


def _expires_at(payload: dict) -> float | None:
    """Convert a token payload's ``expires_in`` into an absolute timestamp."""
    expires_in = payload.get("expires_in")
    if expires_in is None:
        return None
    try:
        return time.time() + float(expires_in)
    except (TypeError, ValueError):
        return None


async def exchange_code(
    provider_id: str, code: str, user_id: str = LOCAL_USER_ID
) -> ServiceConnection:
    """Exchange an authorization code for tokens and identify the account.

    Args:
        provider_id: Provider the code came from.
        code: The ``code`` query parameter from the callback.
        user_id: NOVA user the connection belongs to.

    Returns:
        A populated :class:`ServiceConnection` ready to be persisted.

    Raises:
        OAuthError: If the provider rejects the exchange.
    """
    provider = get_provider(provider_id)
    if provider is None:
        raise OAuthError(f"Unknown provider: {provider_id}")

    creds = await _require_credentials(provider)
    payload = await _post_token_request(
        provider,
        creds,
        {
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": provider.redirect_uri,
        },
    )

    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthError(f"{provider.label} did not return an access token")

    email, name = await _fetch_account_info(provider, access_token)

    return ServiceConnection(
        provider=provider.id,
        user_id=user_id,
        account_email=email,
        account_name=name,
        access_token=access_token,
        refresh_token=payload.get("refresh_token"),
        expires_at=_expires_at(payload),
        scopes=payload.get("scope") or provider.scope_string,
    )


async def refresh_access_token(
    provider_id: str, conn: ServiceConnection
) -> ServiceConnection | None:
    """Renew an expired access token using the stored refresh token.

    Returns the updated connection, or ``None`` when the provider does not
    support refreshing (the user must re-authorize).

    Raises:
        OAuthError: If the provider rejects the refresh request.
    """
    provider = get_provider(provider_id)
    if provider is None or not provider.supports_refresh or not conn.refresh_token:
        return None

    creds = await _require_credentials(provider)
    payload = await _post_token_request(
        provider,
        creds,
        {
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "refresh_token": conn.refresh_token,
            "grant_type": "refresh_token",
        },
    )

    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthError(f"{provider.label} refresh did not return an access token")

    logger.info("access token refreshed", provider=provider.id)

    conn.access_token = access_token
    # Providers may rotate the refresh token; keep the old one when they don't.
    conn.refresh_token = payload.get("refresh_token") or conn.refresh_token
    conn.expires_at = _expires_at(payload)
    return conn
