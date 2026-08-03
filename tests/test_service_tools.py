"""Tests for the provider MCP servers and their agent integration."""

from __future__ import annotations

import pytest

from connections import credentials, crypto, store
from connections.prompt import build_services_block
from connections.store import ServiceConnection
from nova_mcp.builtin import get_service_tools
from nova_mcp.servers import github, google, microsoft


@pytest.fixture
def connections_db(tmp_path, monkeypatch):
    """Throwaway connections database with a known encryption key.

    Provider credentials fall back to the environment, and ``connections``
    loads ``.env`` on import — so a developer with real credentials configured
    would otherwise see different results from CI.
    """
    from cryptography.fernet import Fernet

    monkeypatch.setenv("CONNECTIONS_DB_PATH", str(tmp_path / "connections.db"))
    monkeypatch.setenv("NOVA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    for provider in ("GOOGLE", "MICROSOFT", "GITHUB"):
        monkeypatch.delenv(f"{provider}_CLIENT_ID", raising=False)
        monkeypatch.delenv(f"{provider}_CLIENT_SECRET", raising=False)
    monkeypatch.setattr(crypto, "_fernet", None)
    yield
    monkeypatch.setattr(crypto, "_fernet", None)


async def _configure(*providers: str) -> None:
    """Register OAuth app credentials for the given providers."""
    await store.init_connections_db()
    for provider in providers:
        await credentials.save_credentials(provider, "client-id", "client-secret")


async def _connect(provider: str, email: str = "user@example.com") -> None:
    """Pretend the user completed the OAuth flow for a provider."""
    await store.save_connection(
        ServiceConnection(
            provider=provider, account_email=email, access_token="token-123"
        )
    )


# ── MCP servers ──────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "module,expected_name",
    [(google, "nova-google"), (microsoft, "nova-microsoft"), (github, "nova-github")],
)
async def test_servers_register_their_tools(module, expected_name):
    """Every function in TOOLS must be reachable over MCP."""
    assert module.mcp.name == expected_name

    registered = await module.mcp.list_tools()
    assert {t.name for t in registered} == {fn.__name__ for fn in module.TOOLS}


def test_tool_names_are_provider_prefixed():
    """Prefixes keep the model from confusing Google and Microsoft tools."""
    for module, prefix in ((google, "google_"), (microsoft, "microsoft_"), (github, "github_")):
        for fn in module.TOOLS:
            assert fn.__name__.startswith(prefix)


# ── Binding into the agent ───────────────────────────────────

@pytest.mark.asyncio
async def test_no_tools_without_configured_providers(connections_db):
    await store.init_connections_db()
    assert await get_service_tools() == []


@pytest.mark.asyncio
async def test_configured_but_disconnected_contributes_no_tools(connections_db):
    """Tool schemas are expensive — an unusable service must not cost any.

    A disconnected service is reported through the system prompt instead.
    """
    await _configure("google", "microsoft", "github")

    assert await get_service_tools() == []


@pytest.mark.asyncio
async def test_only_connected_providers_contribute_tools(connections_db):
    await _configure("google", "github")
    await _connect("github")

    names = {t.name for t in await get_service_tools()}

    assert names == {fn.__name__ for fn in github.TOOLS}
    assert not any(n.startswith("google_") for n in names)


@pytest.mark.asyncio
async def test_tools_expose_their_argument_schema(connections_db):
    await _configure("google")
    await _connect("google")

    send = next(t for t in await get_service_tools() if t.name == "google_send_email")

    assert set(send.args) == {"to", "subject", "body", "cc"}
    assert "Recipient" in send.args["to"]["description"]


@pytest.mark.asyncio
async def test_calendar_events_can_be_updated_and_deleted(connections_db):
    """Listing exposes ids precisely so update/delete can target an event."""
    await _configure("google", "microsoft")
    await _connect("google")
    await _connect("microsoft")

    names = {t.name for t in await get_service_tools()}

    assert "google_delete_calendar_event" in names
    assert "google_update_calendar_event" in names
    assert "microsoft_delete_calendar_event" in names
    assert "microsoft_update_calendar_event" in names


# ── Not-connected behaviour ──────────────────────────────────

@pytest.mark.asyncio
async def test_tool_reports_not_connected_instead_of_raising(connections_db):
    """Safety net for a token revoked between binding and the call.

    The tool must yield a refusal the agent can relay, never an exception.
    """
    await _configure("google")

    result = await google.google_send_email("a@b.com", "Hi", "Body")

    assert result.startswith("NOT_CONNECTED")
    assert "Google" in result
    assert "connections panel" in result


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "coro",
    [
        lambda: google.google_list_emails(),
        lambda: microsoft.microsoft_send_email("a@b.com", "s", "b"),
        lambda: github.github_list_repositories(),
    ],
)
async def test_every_provider_degrades_gracefully(connections_db, coro):
    await _configure("google", "microsoft", "github")
    assert (await coro()).startswith("NOT_CONNECTED")


# ── Prompt context ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_unconfigured_providers_are_still_reported(connections_db):
    """Staying silent is what let the model invent 'google:calendar:create'.

    With no tools bound and no mention of the services, the agent had nothing
    telling it these capabilities are conditional.
    """
    await store.init_connections_db()

    block = await build_services_block()

    assert "Google: NOT AVAILABLE" in block
    assert "Microsoft: NOT AVAILABLE" in block
    assert "GitHub: NOT AVAILABLE" in block
    assert "Never invent, guess or improvise a tool name" in block


@pytest.mark.asyncio
async def test_block_distinguishes_unavailable_from_disconnected(connections_db):
    """'Not registered by the admin' and 'not signed in' need different answers."""
    await _configure("google")

    block = await build_services_block()

    assert "Google: NOT CONNECTED" in block
    assert "Microsoft: NOT AVAILABLE" in block


@pytest.mark.asyncio
async def test_block_marks_disconnected_providers(connections_db):
    await _configure("google")

    block = await build_services_block()

    assert "Google: NOT CONNECTED" in block
    assert "Never claim to have sent" in block
    # Nothing to disambiguate against yet.
    assert "which one they mean" not in block


@pytest.mark.asyncio
async def test_single_provider_is_used_without_asking(connections_db):
    await _configure("google", "microsoft")
    await _connect("google", "ana@gmail.com")

    block = await build_services_block()

    assert "Google: CONNECTED as ana@gmail.com" in block
    assert "Microsoft: NOT CONNECTED" in block
    assert "only connected account" in block
    assert "which one they mean" not in block


@pytest.mark.asyncio
async def test_two_overlapping_providers_trigger_disambiguation(connections_db):
    """'Send an email' with both connected must ask which service to use."""
    await _configure("google", "microsoft")
    await _connect("google")
    await _connect("microsoft")

    block = await build_services_block()

    assert "which one they mean" in block
    assert "Google or Microsoft" in block
    assert "before calling any tool" in block


@pytest.mark.asyncio
async def test_github_alone_does_not_trigger_disambiguation(connections_db):
    """GitHub does not overlap with the mail providers."""
    await _configure("google", "github")
    await _connect("github")

    block = await build_services_block()

    assert "GitHub: CONNECTED" in block
    assert "which one they mean" not in block
