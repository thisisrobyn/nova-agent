"""Tests for the external service connections subsystem."""

from __future__ import annotations

import os
from urllib.parse import parse_qs, urlparse

import pytest

from connections import credentials, crypto, store
from connections.oauth import OAuthError, build_authorize_url, consume_state
from connections.providers import PROVIDERS, get_provider
from connections.store import ServiceConnection


@pytest.fixture
def connections_db(tmp_path, monkeypatch):
    """Point the store at a throwaway database with a known encryption key."""
    from cryptography.fernet import Fernet

    monkeypatch.setenv("CONNECTIONS_DB_PATH", str(tmp_path / "connections.db"))
    monkeypatch.setenv("NOVA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    # ``connections`` loads .env on import; a developer with real credentials
    # configured must not get different results from CI.
    for provider in ("GOOGLE", "MICROSOFT", "GITHUB"):
        monkeypatch.delenv(f"{provider}_CLIENT_ID", raising=False)
        monkeypatch.delenv(f"{provider}_CLIENT_SECRET", raising=False)
    monkeypatch.setattr(crypto, "_fernet", None)
    yield
    monkeypatch.setattr(crypto, "_fernet", None)


# ── Provider registry ────────────────────────────────────────

def test_all_providers_are_registered():
    assert set(PROVIDERS) == {"google", "microsoft", "github"}


def test_get_provider_is_case_insensitive():
    assert get_provider("GitHub") is PROVIDERS["github"]
    assert get_provider("nope") is None


def test_redirect_uri_derives_from_public_url(monkeypatch):
    monkeypatch.setenv("NOVA_PUBLIC_URL", "https://nova.example.com/")
    assert (
        PROVIDERS["google"].redirect_uri
        == "https://nova.example.com/api/v1/connections/google/callback"
    )


def test_github_supports_auto_setup():
    # Only GitHub can register its own application, via the manifest flow.
    assert PROVIDERS["github"].supports_auto_setup is True
    assert PROVIDERS["google"].supports_auto_setup is False
    assert PROVIDERS["microsoft"].supports_auto_setup is False


# ── Crypto ───────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip(connections_db):
    token = "ya29.a0AfH6SMB-secret-token"
    ciphertext = crypto.encrypt(token)

    assert ciphertext != token
    assert crypto.decrypt(ciphertext) == token


def test_decrypt_returns_none_for_garbage(connections_db):
    assert crypto.decrypt("not-a-valid-fernet-token") is None


# ── Store ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_and_get_connection(connections_db):
    await store.init_connections_db()
    await store.save_connection(
        ServiceConnection(
            provider="google",
            account_email="user@example.com",
            access_token="access-123",
            refresh_token="refresh-456",
            scopes="openid email",
        )
    )

    conn = await store.get_connection("google")
    assert conn is not None
    assert conn.account_email == "user@example.com"
    assert conn.access_token == "access-123"
    assert conn.refresh_token == "refresh-456"


@pytest.mark.asyncio
async def test_tokens_are_encrypted_at_rest(connections_db):
    import aiosqlite

    await store.init_connections_db()
    await store.save_connection(
        ServiceConnection(provider="github", access_token="ghp_plaintext")
    )

    async with aiosqlite.connect(store.get_db_path()) as db:
        async with db.execute("SELECT access_token FROM service_connections") as cur:
            (stored,) = await cur.fetchone()

    assert "ghp_plaintext" not in stored


@pytest.mark.asyncio
async def test_save_preserves_existing_refresh_token(connections_db):
    """Google omits the refresh token on re-consent; the stored one must survive."""
    await store.init_connections_db()
    await store.save_connection(
        ServiceConnection(provider="google", access_token="a1", refresh_token="r1")
    )
    await store.save_connection(
        ServiceConnection(provider="google", access_token="a2", refresh_token=None)
    )

    conn = await store.get_connection("google")
    assert conn.access_token == "a2"
    assert conn.refresh_token == "r1"


@pytest.mark.asyncio
async def test_delete_connection(connections_db):
    await store.init_connections_db()
    await store.save_connection(ServiceConnection(provider="github", access_token="t"))

    assert await store.delete_connection("github") is True
    assert await store.get_connection("github") is None
    assert await store.delete_connection("github") is False


@pytest.mark.asyncio
async def test_get_access_token_returns_none_when_not_connected(connections_db):
    await store.init_connections_db()
    assert await store.get_access_token("microsoft") is None


@pytest.mark.asyncio
async def test_get_access_token_returns_none_when_expired_without_refresh(connections_db):
    await store.init_connections_db()
    await store.save_connection(
        ServiceConnection(
            provider="google",
            access_token="stale",
            refresh_token=None,
            expires_at=0,  # epoch → long expired
        )
    )

    assert await store.get_access_token("google") is None


# ── Application credentials ──────────────────────────────────

@pytest.mark.asyncio
async def test_credentials_fall_back_to_environment(connections_db, monkeypatch):
    await store.init_connections_db()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "env-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "env-secret")

    creds = await credentials.get_credentials("google")
    assert creds.client_id == "env-id"
    assert creds.source == "environment"


@pytest.mark.asyncio
async def test_database_credentials_win_over_environment(connections_db, monkeypatch):
    await store.init_connections_db()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "env-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "env-secret")
    await credentials.save_credentials("google", "db-id", "db-secret")

    creds = await credentials.get_credentials("google")
    assert creds.client_id == "db-id"
    assert creds.client_secret == "db-secret"
    assert creds.source == "database"


@pytest.mark.asyncio
async def test_client_secret_is_encrypted_at_rest(connections_db):
    import aiosqlite

    await store.init_connections_db()
    await credentials.save_credentials("github", "id", "super-secret")

    async with aiosqlite.connect(store.get_db_path()) as db:
        async with db.execute("SELECT client_secret FROM provider_credentials") as cur:
            (stored,) = await cur.fetchone()

    assert "super-secret" not in stored


@pytest.mark.asyncio
async def test_microsoft_tenant_round_trips_through_extra(connections_db):
    await store.init_connections_db()
    await credentials.save_credentials(
        "microsoft", "id", "secret", extra={"tenant_id": "contoso.onmicrosoft.com"}
    )

    creds = await credentials.get_credentials("microsoft")
    assert creds.tenant_id == "contoso.onmicrosoft.com"


@pytest.mark.asyncio
async def test_delete_credentials(connections_db):
    await store.init_connections_db()
    await credentials.save_credentials("github", "id", "secret")

    assert await credentials.delete_credentials("github") is True
    assert await credentials.get_credentials("github") is None


@pytest.mark.asyncio
async def test_clearing_credentials_drops_user_connections(connections_db):
    await store.init_connections_db()
    await store.save_connection(ServiceConnection(provider="github", access_token="t"))

    assert await store.delete_connections_for_provider("github") == 1
    assert await store.get_connection("github") is None


# ── Authorization URL ────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_authorize_url_requires_credentials(connections_db, monkeypatch):
    await store.init_connections_db()
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)

    with pytest.raises(OAuthError, match="not set up"):
        await build_authorize_url("google")


@pytest.mark.asyncio
async def test_build_authorize_url_includes_scopes_and_state(connections_db):
    await store.init_connections_db()
    await credentials.save_credentials("google", "client-id", "client-secret")

    url, state = await build_authorize_url("google")
    params = parse_qs(urlparse(url).query)

    assert params["client_id"] == ["client-id"]
    assert params["state"] == [state]
    assert params["response_type"] == ["code"]
    # Offline access is what makes Google issue a refresh token.
    assert params["access_type"] == ["offline"]
    assert "https://www.googleapis.com/auth/gmail.send" in params["scope"][0]


@pytest.mark.asyncio
async def test_github_authorize_url_omits_scope(connections_db):
    """GitHub Apps derive access from their permissions and reject a scope."""
    await store.init_connections_db()
    await credentials.save_credentials("github", "client-id", "client-secret")

    url, _ = await build_authorize_url("github")
    assert "scope" not in parse_qs(urlparse(url).query)


@pytest.mark.asyncio
async def test_microsoft_tenant_is_substituted(connections_db):
    await store.init_connections_db()
    await credentials.save_credentials(
        "microsoft", "client-id", "secret", extra={"tenant_id": "contoso.onmicrosoft.com"}
    )

    url, _ = await build_authorize_url("microsoft")
    assert "{tenant}" not in url
    assert "contoso.onmicrosoft.com" in url


@pytest.mark.asyncio
async def test_state_is_single_use(connections_db):
    await store.init_connections_db()
    await credentials.save_credentials("github", "client-id", "client-secret")

    _, state = await build_authorize_url("github", user_id="user-42")

    pending = consume_state(state)
    assert pending is not None
    assert pending.provider == "github"
    assert pending.user_id == "user-42"
    # A replayed callback must not resolve.
    assert consume_state(state) is None


# ── GitHub App manifest ──────────────────────────────────────

def test_manifest_points_back_at_this_deployment(monkeypatch):
    from connections import github_app

    monkeypatch.setenv("NOVA_PUBLIC_URL", "https://nova.example.com")
    manifest = github_app.build_manifest("My NOVA")

    assert manifest["name"] == "My NOVA"
    assert manifest["redirect_url"].endswith("/api/v1/connections/github/setup/callback")
    assert manifest["callback_urls"] == [
        "https://nova.example.com/api/v1/connections/github/callback"
    ]
    # Creating repositories needs the administration permission.
    assert manifest["default_permissions"]["administration"] == "write"


def test_manifest_registration_url_supports_orgs():
    from connections import github_app

    assert github_app.registration_url() == "https://github.com/settings/apps/new"
    assert github_app.registration_url("acme") == (
        "https://github.com/organizations/acme/settings/apps/new"
    )
