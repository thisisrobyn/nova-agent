"""REST endpoints for connecting external services via OAuth 2.0.

The UI drives the flow entirely through this router:

1. ``POST /api/v1/connections/{provider}/authorize`` → authorization URL
2. the popup lands on ``GET /api/v1/connections/{provider}/callback``
3. ``GET  /api/v1/connections`` → connection state for every provider
4. ``DELETE /api/v1/connections/{provider}`` → revoke locally
"""

from __future__ import annotations

import html
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from api.auth import AuthenticatedUser, get_optional_user
from api.schemas import (
    AuthorizeUrlResponse,
    ConnectionListResponse,
    ConnectionStatus,
    GitHubManifestResponse,
    ProviderCredentialsUpdate,
)
from connections import github_app
from connections.admin import is_admin
from connections.credentials import delete_credentials, get_credentials, save_credentials
from connections.oauth import (
    OAuthError,
    build_authorize_url,
    consume_state,
    exchange_code,
    issue_state,
)
from connections.providers import PROVIDERS, get_provider
from connections.store import (
    LOCAL_USER_ID,
    delete_connection,
    delete_connections_for_provider,
    get_connection,
    save_connection,
)

logger = structlog.stdlib.get_logger(__name__)

router = APIRouter(prefix="/api/v1/connections", tags=["connections"])


def _user_id(user: AuthenticatedUser | None) -> str:
    """Resolve the storage key for the caller.

    Connections are per user: this is what keeps one account's mailbox out of
    another's session. The desktop/dev setup runs without Cognito, so it falls
    back to a single shared identity — acceptable there because only the
    operator can reach the API, and never reached once users authenticate.
    """
    return user.sub if user and user.sub else LOCAL_USER_ID


def _require_admin(user: AuthenticatedUser | None) -> None:
    """Reject callers who may not register OAuth applications.

    Hiding the setup wizard in the UI is a convenience; this is the check that
    actually protects it.
    """
    if not is_admin(user.sub if user else None):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only an administrator can register service applications. "
                "Sign in to a connected service from the connections panel "
                "instead."
            ),
        )


# Copy for the pages the OAuth popup lands on.  These are rendered by the API
# rather than the UI, so they carry their own translations; the language
# travels with the ``state`` issued when the flow started.
_POPUP_TEXT: dict[str, dict[str, str]] = {
    "en": {
        "unknown_title": "Unknown service",
        "unknown_body": "There is no provider named {provider}.",
        "cancelled_title": "{provider} sign-in cancelled",
        "failed_title": "{provider} sign-in failed",
        "no_code": "The provider did not return an authorization code.",
        "expired": "This authorization link has expired. Please try connecting again.",
        "unexpected": "Unexpected error: {error}",
        "connected_title": "{provider} connected",
        "connected_body": "NOVA is now connected to {account}. You can close this window.",
        "account_fallback": "your account",
        "gh_failed_title": "GitHub App not created",
        "gh_no_code": "GitHub did not return a registration code.",
        "gh_expired": "This setup link has expired. Please start the setup again.",
        "gh_created_title": "GitHub App created",
        "gh_created_body": "'{name}' is registered and its credentials are stored. You can now connect your GitHub account.",
    },
    "es": {
        "unknown_title": "Servicio desconocido",
        "unknown_body": "No existe ningún proveedor llamado {provider}.",
        "cancelled_title": "Inicio de sesión con {provider} cancelado",
        "failed_title": "Error al iniciar sesión con {provider}",
        "no_code": "El proveedor no devolvió un código de autorización.",
        "expired": "Este enlace de autorización ha caducado. Vuelve a intentar la conexión.",
        "unexpected": "Error inesperado: {error}",
        "connected_title": "{provider} conectado",
        "connected_body": "NOVA ya está conectado a {account}. Puedes cerrar esta ventana.",
        "account_fallback": "tu cuenta",
        "gh_failed_title": "No se creó la GitHub App",
        "gh_no_code": "GitHub no devolvió un código de registro.",
        "gh_expired": "Este enlace de configuración ha caducado. Vuelve a empezar la configuración.",
        "gh_created_title": "GitHub App creada",
        "gh_created_body": "'{name}' está registrada y sus credenciales guardadas. Ya puedes conectar tu cuenta de GitHub.",
    },
}


def _text(lang: str, key: str, **kwargs: str) -> str:
    """Look up popup copy, falling back to English for unknown languages."""
    catalog = _POPUP_TEXT.get(lang, _POPUP_TEXT["en"])
    template = catalog.get(key) or _POPUP_TEXT["en"].get(key, key)
    return template.format(**kwargs) if kwargs else template


def _browser_lang(request: Request) -> str:
    """Best-effort language from ``Accept-Language``.

    Used for callbacks that fail before the ``state`` — which carries the UI
    language — can be resolved.
    """
    header = request.headers.get("Accept-Language", "")
    for part in header.split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in _POPUP_TEXT:
            return code
    return "en"


async def _rebind_service_tools() -> None:
    """Re-bind the agent's service tools after a connection changes.

    Tools exist only for services the user is signed into, so this runs on
    connect, disconnect and whenever a provider's application credentials are
    added or removed.

    Failures are logged but never surfaced: the change itself was saved, and
    the tools are re-bound again on the next restart.
    """
    try:
        from agent.graph import reload_service_tools

        await reload_service_tools()
    except Exception as exc:
        logger.warning("could not rebind service tools", error=str(exc))


def _popup_result_page(title: str, message: str, ok: bool) -> HTMLResponse:
    """Render the page the OAuth popup lands on before closing itself."""
    accent = "#22c55e" if ok else "#ef4444"
    payload = "true" if ok else "false"
    body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <style>
    body {{
      margin: 0; min-height: 100vh; display: flex; align-items: center;
      justify-content: center; background: #0b0f14; color: #e5e7eb;
      font-family: ui-sans-serif, system-ui, sans-serif; text-align: center;
    }}
    .card {{ max-width: 26rem; padding: 2rem; }}
    h1 {{ font-size: 1.05rem; margin: 0 0 .5rem; color: {accent}; }}
    p {{ font-size: .85rem; line-height: 1.5; color: #9ca3af; margin: 0; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{html.escape(title)}</h1>
    <p>{html.escape(message)}</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage(
        {{ source: 'nova-oauth', ok: {payload} }},
        window.location.origin,
      );
      setTimeout(function () {{ window.close(); }}, 1200);
    }}
  </script>
</body>
</html>"""
    return HTMLResponse(content=body)


@router.get("", response_model=ConnectionListResponse)
async def list_service_connections(
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> ConnectionListResponse:
    """Return the connection state of every supported provider."""
    uid = _user_id(user)
    statuses: list[ConnectionStatus] = []

    for provider in PROVIDERS.values():
        conn = await get_connection(provider.id, uid)
        creds = await get_credentials(provider.id)
        statuses.append(
            ConnectionStatus(
                provider=provider.id,
                label=provider.label,
                description=provider.description,
                configured=creds is not None,
                credentials_source=creds.source if creds else None,
                connected=conn is not None and bool(conn.access_token),
                account_email=conn.account_email if conn else None,
                account_name=conn.account_name if conn else None,
                scopes=(conn.scopes or "").split() if conn else [],
                required_scopes=provider.scopes,
                expires_at=conn.expires_at if conn else None,
                redirect_uri=provider.redirect_uri,
                console_url=provider.console_url,
                supports_auto_setup=provider.supports_auto_setup,
            )
        )

    return ConnectionListResponse(
        connections=statuses,
        is_admin=is_admin(user.sub if user else None),
    )


@router.post("/{provider_id}/authorize", response_model=AuthorizeUrlResponse)
async def authorize_provider(
    provider_id: str,
    lang: str = Query("en", description="UI language for the callback page"),
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> AuthorizeUrlResponse:
    """Return the provider's authorization URL for the UI to open."""
    if get_provider(provider_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    try:
        url, state = await build_authorize_url(provider_id, _user_id(user), lang)
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return AuthorizeUrlResponse(provider=provider_id, authorize_url=url, state=state)


# ── Application setup (operator-facing) ─────────────────────

@router.put("/{provider_id}/credentials")
async def set_provider_credentials(
    provider_id: str,
    body: ProviderCredentialsUpdate,
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict:
    """Store the OAuth application credentials for a provider.

    Saved to the encrypted database rather than ``.env``, so they take effect
    immediately without restarting the API.
    """
    _require_admin(user)

    provider = get_provider(provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    extra: dict = {}
    if provider.id == "microsoft" and body.tenant_id:
        extra["tenant_id"] = body.tenant_id.strip()

    await save_credentials(
        provider.id,
        body.client_id.strip(),
        body.client_secret.strip(),
        extra=extra or None,
    )
    await _rebind_service_tools()
    return {"provider": provider.id, "configured": True}


@router.delete("/{provider_id}/credentials")
async def clear_provider_credentials(
    provider_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict:
    """Forget the stored application credentials for a provider.

    Every user's connection is dropped too: without the app credentials those
    tokens can no longer be refreshed.
    """
    _require_admin(user)

    provider = get_provider(provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    deleted = await delete_credentials(provider.id)
    dropped = await delete_connections_for_provider(provider.id)
    await _rebind_service_tools()
    return {"provider": provider.id, "deleted": deleted, "connections_dropped": dropped}


@router.post("/github/setup/manifest", response_model=GitHubManifestResponse)
async def github_manifest(
    name: str = Query("NOVA Agent", description="App name shown on GitHub"),
    org: str | None = Query(None, description="Register under this organization"),
    lang: str = Query("en", description="UI language for the callback page"),
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> GitHubManifestResponse:
    """Return the GitHub App manifest for the UI to submit as a form."""
    _require_admin(user)

    state = issue_state("github", _user_id(user), lang)
    return GitHubManifestResponse(
        registration_url=github_app.registration_url(org),
        manifest=json.dumps(github_app.build_manifest(name)),
        state=state,
    )


@router.get("/github/setup/callback", response_class=HTMLResponse)
async def github_manifest_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
) -> HTMLResponse:
    """Convert the manifest code into stored GitHub App credentials."""
    lang = _browser_lang(request)

    if not code or not state:
        return _popup_result_page(
            _text(lang, "gh_failed_title"), _text(lang, "gh_no_code"), False
        )

    pending = consume_state(state)
    if pending is None or pending.provider != "github":
        return _popup_result_page(
            _text(lang, "gh_failed_title"), _text(lang, "gh_expired"), False
        )

    lang = pending.lang

    try:
        app = await github_app.convert_manifest_code(code)
    except github_app.GitHubAppError as exc:
        logger.error("github manifest conversion failed", error=str(exc))
        return _popup_result_page(_text(lang, "gh_failed_title"), str(exc), False)

    await _rebind_service_tools()
    return _popup_result_page(
        _text(lang, "gh_created_title"),
        _text(lang, "gh_created_body", name=str(app.get("name") or "NOVA")),
        True,
    )


@router.get("/{provider_id}/callback", response_class=HTMLResponse)
async def oauth_callback(
    request: Request,
    provider_id: str,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
) -> HTMLResponse:
    """Handle the OAuth redirect: exchange the code and store the tokens."""
    lang = _browser_lang(request)

    provider = get_provider(provider_id)
    if provider is None:
        return _popup_result_page(
            _text(lang, "unknown_title"),
            _text(lang, "unknown_body", provider=provider_id),
            False,
        )

    if error:
        logger.warning("oauth callback returned an error", provider=provider_id, error=error)
        return _popup_result_page(
            _text(lang, "cancelled_title", provider=provider.label),
            error_description or error,
            False,
        )

    if not code or not state:
        return _popup_result_page(
            _text(lang, "failed_title", provider=provider.label),
            _text(lang, "no_code"),
            False,
        )

    pending = consume_state(state)
    if pending is None or pending.provider != provider_id:
        return _popup_result_page(
            _text(lang, "failed_title", provider=provider.label),
            _text(lang, "expired"),
            False,
        )

    # From here on the UI language travelled with the state, so prefer it.
    lang = pending.lang

    try:
        conn = await exchange_code(provider_id, code, pending.user_id)
        await save_connection(conn)
    except OAuthError as exc:
        logger.error("oauth code exchange failed", provider=provider_id, error=str(exc))
        return _popup_result_page(
            _text(lang, "failed_title", provider=provider.label), str(exc), False
        )
    except Exception as exc:
        logger.exception("unexpected error during oauth callback", provider=provider_id)
        return _popup_result_page(
            _text(lang, "failed_title", provider=provider.label),
            _text(lang, "unexpected", error=str(exc)),
            False,
        )

    await _rebind_service_tools()

    account = (
        conn.account_email or conn.account_name or _text(lang, "account_fallback")
    )
    return _popup_result_page(
        _text(lang, "connected_title", provider=provider.label),
        _text(lang, "connected_body", account=account),
        True,
    )


@router.delete("/{provider_id}")
async def disconnect_provider(
    provider_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> dict:
    """Remove the stored tokens for a provider."""
    if get_provider(provider_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    deleted = await delete_connection(provider_id, _user_id(user))
    await _rebind_service_tools()
    return {"provider": provider_id, "disconnected": deleted}
