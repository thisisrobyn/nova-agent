"""Persistence for OAuth service connections.

Stores one row per (user, provider) in ``data/nova_connections.db`` with the
access/refresh tokens encrypted at rest.  ``get_access_token`` is the entry
point used by the provider MCP servers: it transparently refreshes an
expired access token before returning it.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import aiosqlite
import structlog

from connections.crypto import decrypt, encrypt

logger = structlog.stdlib.get_logger(__name__)

_DEFAULT_DB_PATH = os.path.join("data", "nova_connections.db")

#: Identifier used when the API cannot resolve an authenticated user.
LOCAL_USER_ID = "local"

#: Refresh the access token this many seconds before it actually expires.
_REFRESH_MARGIN_SECONDS = 120

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS service_connections (
    user_id       TEXT    NOT NULL,
    provider      TEXT    NOT NULL,
    account_email TEXT,
    account_name  TEXT,
    access_token  TEXT    NOT NULL,   -- Fernet-encrypted
    refresh_token TEXT,               -- Fernet-encrypted
    expires_at    REAL,               -- epoch seconds, NULL = never expires
    scopes        TEXT,               -- space-delimited granted scopes
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
);

-- OAuth *application* credentials, registered once per deployment.
-- Rows here take precedence over the matching environment variables.
CREATE TABLE IF NOT EXISTS provider_credentials (
    provider      TEXT    PRIMARY KEY,
    client_id     TEXT    NOT NULL,
    client_secret TEXT    NOT NULL,   -- Fernet-encrypted
    extra         TEXT,               -- JSON: tenant_id, app slug, ...
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def get_db_path() -> str:
    """Return the connections database path (overridable for tests)."""
    return os.getenv("CONNECTIONS_DB_PATH", _DEFAULT_DB_PATH)


@dataclass
class ServiceConnection:
    """A stored OAuth connection between a NOVA user and a service."""

    provider: str
    user_id: str = LOCAL_USER_ID
    account_email: Optional[str] = None
    account_name: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[float] = None
    scopes: Optional[str] = None

    @property
    def is_expired(self) -> bool:
        """True when the access token is expired (or about to be)."""
        if self.expires_at is None:
            return False
        return time.time() >= (self.expires_at - _REFRESH_MARGIN_SECONDS)


async def init_connections_db() -> None:
    """Create the connections database and table if they don't exist."""
    db_path = get_db_path()
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.executescript(_SCHEMA_SQL)
        await db.commit()

    logger.info("connections database initialized", path=db_path)


def _row_to_connection(row: aiosqlite.Row) -> ServiceConnection:
    """Map a database row to a :class:`ServiceConnection` (tokens decrypted)."""
    return ServiceConnection(
        provider=row["provider"],
        user_id=row["user_id"],
        account_email=row["account_email"],
        account_name=row["account_name"],
        access_token=decrypt(row["access_token"]) if row["access_token"] else None,
        refresh_token=decrypt(row["refresh_token"]) if row["refresh_token"] else None,
        expires_at=row["expires_at"],
        scopes=row["scopes"],
    )


async def save_connection(conn: ServiceConnection) -> None:
    """Insert or update a connection, encrypting the tokens.

    A ``None`` refresh token never overwrites a stored one -- providers such
    as Google omit it on subsequent consents.
    """
    existing = await get_connection(conn.provider, conn.user_id)
    refresh = conn.refresh_token or (existing.refresh_token if existing else None)

    async with aiosqlite.connect(get_db_path()) as db:
        await db.execute(
            """
            INSERT INTO service_connections
                (user_id, provider, account_email, account_name,
                 access_token, refresh_token, expires_at, scopes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                account_email = excluded.account_email,
                account_name  = excluded.account_name,
                access_token  = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at    = excluded.expires_at,
                scopes        = excluded.scopes,
                updated_at    = CURRENT_TIMESTAMP
            """,
            (
                conn.user_id,
                conn.provider,
                conn.account_email,
                conn.account_name,
                encrypt(conn.access_token or ""),
                encrypt(refresh) if refresh else None,
                conn.expires_at,
                conn.scopes,
            ),
        )
        await db.commit()

    logger.info(
        "service connection saved",
        provider=conn.provider,
        account=conn.account_email,
    )


async def get_connection(
    provider: str, user_id: str = LOCAL_USER_ID
) -> ServiceConnection | None:
    """Return the stored connection for a provider, or ``None``."""
    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM service_connections WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        ) as cursor:
            row = await cursor.fetchone()

    return _row_to_connection(row) if row else None


async def list_connections(user_id: str = LOCAL_USER_ID) -> List[ServiceConnection]:
    """Return every stored connection for a user."""
    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM service_connections WHERE user_id = ? ORDER BY provider",
            (user_id,),
        ) as cursor:
            rows = await cursor.fetchall()

    return [_row_to_connection(r) for r in rows]


async def delete_connection(provider: str, user_id: str = LOCAL_USER_ID) -> bool:
    """Remove a stored connection.  Returns True when a row was deleted."""
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute(
            "DELETE FROM service_connections WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        )
        await db.commit()
        deleted = cursor.rowcount > 0

    if deleted:
        logger.info("service connection deleted", provider=provider)
    return deleted


async def list_connected_providers() -> List[str]:
    """Providers that at least one user has an active connection to.

    Drives which service tools get bound into the (process-wide) agent graph;
    whose token a given call uses is decided per request from
    :mod:`connections.context`.
    """
    async with aiosqlite.connect(get_db_path()) as db:
        async with db.execute(
            "SELECT DISTINCT provider FROM service_connections"
        ) as cursor:
            rows = await cursor.fetchall()
    return [r[0] for r in rows]


async def migrate_local_connections(target_user_id: str) -> int:
    """Re-assign single-user connections to a real account.

    Before per-user isolation, every connection was stored under
    :data:`LOCAL_USER_ID`. Those rows are claimed by the configured
    administrator rather than by whoever signs in first — otherwise the first
    stranger to log in to a public deployment would inherit the operator's
    mailbox.

    Returns the number of rows moved.
    """
    if not target_user_id or target_user_id == LOCAL_USER_ID:
        return 0

    async with aiosqlite.connect(get_db_path()) as db:
        # Skip any provider the target already connected on their own.
        cursor = await db.execute(
            """
            UPDATE service_connections
               SET user_id = ?
             WHERE user_id = ?
               AND provider NOT IN (
                   SELECT provider FROM service_connections WHERE user_id = ?
               )
            """,
            (target_user_id, LOCAL_USER_ID, target_user_id),
        )
        await db.commit()
        moved = cursor.rowcount

    if moved:
        logger.info("migrated local connections to owner", count=moved)
    return moved


async def delete_connections_for_provider(provider: str) -> int:
    """Remove every user's connection to a provider.  Returns the row count.

    Used when the provider's application credentials are cleared: without them
    the stored tokens can no longer be refreshed, so keeping them would only
    show a connection that silently fails.
    """
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute(
            "DELETE FROM service_connections WHERE provider = ?", (provider,)
        )
        await db.commit()
        return cursor.rowcount


async def get_access_token(
    provider: str, user_id: str = LOCAL_USER_ID
) -> str | None:
    """Return a usable access token for ``provider``.

    Refreshes the token when it has expired and a refresh token is available.
    Returns ``None`` when the user has not connected the service, or when the
    stored credentials can no longer be renewed -- callers should surface that
    to the user as "not signed in" rather than as an error.
    """
    conn = await get_connection(provider, user_id)
    if conn is None or not conn.access_token:
        return None

    if not conn.is_expired:
        return conn.access_token

    if not conn.refresh_token:
        logger.warning("access token expired and no refresh token", provider=provider)
        return None

    # Imported lazily: ``oauth`` depends on this module for persistence.
    from connections.oauth import refresh_access_token

    try:
        refreshed = await refresh_access_token(provider, conn)
    except Exception as exc:  # network / provider errors must not crash a tool
        logger.error("token refresh failed", provider=provider, error=str(exc))
        return None

    if refreshed is None:
        return None

    await save_connection(refreshed)
    return refreshed.access_token
