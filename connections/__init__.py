"""NOVA external service connections.

Manages OAuth 2.0 connections to third-party services (Google, Microsoft,
GitHub) so that the agent can act on the user's behalf through the
provider-specific MCP servers in ``nova_mcp/servers/``.

Responsibilities are split across:

- ``providers``   -- static registry of supported OAuth providers
- ``credentials`` -- the OAuth *app* client id/secret (database or env)
- ``crypto``      -- symmetric encryption for secrets at rest
- ``store``       -- SQLite persistence + automatic access-token refresh
- ``oauth``       -- authorization URL building and code/refresh exchanges
- ``github_app``  -- one-click GitHub App registration via manifest

Typical use from an MCP server::

    from connections import get_access_token

    token = await get_access_token("google")
    if token is None:
        return "NOT_CONNECTED: google"
"""

from __future__ import annotations

from dotenv import load_dotenv

# Loaded here, at package level, rather than only in ``api/main.py``.
# Everything below reads configuration from the environment — above all
# ``NOVA_ENCRYPTION_KEY`` — and this package is also imported by processes that
# never go through the API: the standalone MCP servers in
# ``nova_mcp/servers/`` and the CLI. Without this they would fall back to the
# auto-generated ``data/.connection_key`` and be unable to decrypt anything the
# API stored, reporting every service as disconnected.
load_dotenv()

from connections.credentials import (  # noqa: E402  (must follow load_dotenv)
    ProviderCredentials,
    delete_credentials,
    get_credentials,
    save_credentials,
)
from connections.providers import PROVIDERS, OAuthProvider, get_provider  # noqa: E402
from connections.store import (  # noqa: E402
    ServiceConnection,
    delete_connection,
    delete_connections_for_provider,
    get_access_token,
    get_connection,
    init_connections_db,
    list_connections,
    save_connection,
)

__all__ = [
    "PROVIDERS",
    "OAuthProvider",
    "ProviderCredentials",
    "ServiceConnection",
    "delete_connection",
    "delete_connections_for_provider",
    "delete_credentials",
    "get_access_token",
    "get_connection",
    "get_credentials",
    "get_provider",
    "init_connections_db",
    "list_connections",
    "save_connection",
    "save_credentials",
]
