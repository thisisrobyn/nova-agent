"""OAuth *application* credentials for each provider.

These are the ``client_id`` / ``client_secret`` issued once per deployment
when the NOVA app is registered with a provider -- not the per-user tokens
(those live in :mod:`connections.store`).

Two sources are supported, in priority order:

1. the ``provider_credentials`` table, filled in from the setup wizard in the
   UI (client secrets encrypted at rest);
2. the ``*_CLIENT_ID`` / ``*_CLIENT_SECRET`` environment variables.

Storing them in the database means an operator can register a provider from
the UI without editing ``.env`` or restarting the API.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict

import aiosqlite
import structlog

from connections.crypto import decrypt, encrypt
from connections.providers import OAuthProvider, get_provider
from connections.store import get_db_path

logger = structlog.stdlib.get_logger(__name__)


@dataclass
class ProviderCredentials:
    """Registered OAuth application credentials for one provider."""

    provider: str
    client_id: str
    client_secret: str
    #: Provider-specific extras, e.g. ``{"tenant_id": "common"}`` for Microsoft
    #: or ``{"app_slug": "nova-agent"}`` for a GitHub App.
    extra: Dict[str, Any] = field(default_factory=dict)
    #: Where the values came from: ``"database"`` or ``"environment"``.
    source: str = "database"

    @property
    def tenant_id(self) -> str:
        """Azure AD tenant to authenticate against (Microsoft only)."""
        return str(self.extra.get("tenant_id") or "common")


def _from_environment(provider: OAuthProvider) -> ProviderCredentials | None:
    """Read credentials from environment variables, if both are present."""
    client_id = os.getenv(provider.client_id_env)
    client_secret = os.getenv(provider.client_secret_env)
    if not client_id or not client_secret:
        return None

    extra: Dict[str, Any] = {}
    if provider.id == "microsoft":
        extra["tenant_id"] = os.getenv("MICROSOFT_TENANT_ID", "common")

    return ProviderCredentials(
        provider=provider.id,
        client_id=client_id,
        client_secret=client_secret,
        extra=extra,
        source="environment",
    )


async def get_credentials(provider_id: str) -> ProviderCredentials | None:
    """Return the OAuth app credentials for a provider, or ``None``.

    Database rows win over environment variables so that credentials
    registered from the setup wizard take effect without a restart.
    """
    provider = get_provider(provider_id)
    if provider is None:
        return None

    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM provider_credentials WHERE provider = ?",
            (provider.id,),
        ) as cursor:
            row = await cursor.fetchone()

    if row is None:
        return _from_environment(provider)

    secret = decrypt(row["client_secret"])
    if secret is None:
        # Key rotated: the stored row is unusable, fall back to the env.
        logger.warning("stored client secret is unreadable", provider=provider.id)
        return _from_environment(provider)

    try:
        extra = json.loads(row["extra"]) if row["extra"] else {}
    except json.JSONDecodeError:
        extra = {}

    return ProviderCredentials(
        provider=provider.id,
        client_id=row["client_id"],
        client_secret=secret,
        extra=extra,
        source="database",
    )


async def save_credentials(
    provider_id: str,
    client_id: str,
    client_secret: str,
    extra: Dict[str, Any] | None = None,
) -> None:
    """Persist OAuth app credentials, encrypting the secret."""
    async with aiosqlite.connect(get_db_path()) as db:
        await db.execute(
            """
            INSERT INTO provider_credentials
                (provider, client_id, client_secret, extra, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(provider) DO UPDATE SET
                client_id     = excluded.client_id,
                client_secret = excluded.client_secret,
                extra         = excluded.extra,
                updated_at    = CURRENT_TIMESTAMP
            """,
            (
                provider_id,
                client_id,
                encrypt(client_secret),
                json.dumps(extra) if extra else None,
            ),
        )
        await db.commit()

    logger.info("provider credentials saved", provider=provider_id)


async def delete_credentials(provider_id: str) -> bool:
    """Remove stored credentials.  Returns True when a row was deleted."""
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute(
            "DELETE FROM provider_credentials WHERE provider = ?",
            (provider_id,),
        )
        await db.commit()
        return cursor.rowcount > 0
