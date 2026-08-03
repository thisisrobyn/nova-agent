"""Static registry of the OAuth providers NOVA can connect to.

Each :class:`OAuthProvider` describes everything needed to run the
authorization-code flow against a service and to identify the account that
granted access.  Client credentials are never stored here -- they are read
from environment variables at call time (see ``.env.example``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List

# Public base URL used to build OAuth redirect URIs.  Must match exactly what
# is registered in each provider's console.  The default targets the Vite dev
# server, which proxies /api to the API so the OAuth popup shares an origin
# with the UI; deployments override it with their real domain.
DEFAULT_PUBLIC_URL = "http://localhost:5173"


def get_public_url() -> str:
    """Return the public base URL of the API (no trailing slash)."""
    return os.getenv("NOVA_PUBLIC_URL", DEFAULT_PUBLIC_URL).rstrip("/")


@dataclass(frozen=True)
class OAuthProvider:
    """Configuration for a single OAuth 2.0 provider."""

    id: str
    label: str
    authorize_url: str
    token_url: str
    scopes: List[str]
    client_id_env: str
    client_secret_env: str
    userinfo_url: str
    #: Extra query params appended to the authorization request.
    extra_authorize_params: Dict[str, str] = field(default_factory=dict)
    #: Whether the provider can issue refresh tokens.
    supports_refresh: bool = True
    #: URL of the developer console where the app is registered.
    console_url: str = ""
    #: True when NOVA can register the app for the operator automatically.
    supports_auto_setup: bool = False
    #: Human-readable summary shown in the UI.
    description: str = ""

    @property
    def redirect_uri(self) -> str:
        """Redirect URI to register in the provider's developer console."""
        return f"{get_public_url()}/api/v1/connections/{self.id}/callback"

    @property
    def scope_string(self) -> str:
        """Space-delimited scope list for the authorization request."""
        return " ".join(self.scopes)


GOOGLE = OAuthProvider(
    id="google",
    label="Google",
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    token_url="https://oauth2.googleapis.com/token",
    scopes=[
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/documents",
    ],
    client_id_env="GOOGLE_CLIENT_ID",
    client_secret_env="GOOGLE_CLIENT_SECRET",
    userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
    # access_type=offline + prompt=consent are required to receive a refresh
    # token; without them Google only returns one on the very first consent.
    extra_authorize_params={
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    },
    console_url="https://console.cloud.google.com/apis/credentials",
    # Google deliberately exposes no API for creating OAuth clients, so the
    # operator has to register the app by hand once.
    supports_auto_setup=False,
    description="Gmail, Calendar, Drive, Sheets and Docs",
)

MICROSOFT = OAuthProvider(
    id="microsoft",
    label="Microsoft",
    # Tenant is resolved lazily in ``build_authorize_url`` via ``{tenant}``.
    authorize_url="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    token_url="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scopes=[
        "offline_access",
        "openid",
        "email",
        "profile",
        "User.Read",
        "Mail.Read",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Files.ReadWrite",
    ],
    client_id_env="MICROSOFT_CLIENT_ID",
    client_secret_env="MICROSOFT_CLIENT_SECRET",
    userinfo_url="https://graph.microsoft.com/v1.0/me",
    console_url="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    # Registration is scriptable through the Azure CLI, but not callable from
    # here without the operator's Azure credentials.
    supports_auto_setup=False,
    description="Outlook mail, Calendar and OneDrive",
)

GITHUB = OAuthProvider(
    id="github",
    label="GitHub",
    # GitHub Apps use the very same user-to-server OAuth endpoints as OAuth
    # Apps; what differs is that access comes from the app's configured
    # permissions rather than from a ``scope`` parameter.
    authorize_url="https://github.com/login/oauth/authorize",
    token_url="https://github.com/login/oauth/access_token",
    scopes=[],
    client_id_env="GITHUB_CLIENT_ID",
    client_secret_env="GITHUB_CLIENT_SECRET",
    userinfo_url="https://api.github.com/user",
    console_url="https://github.com/settings/apps",
    # The app-manifest flow lets NOVA register the GitHub App in one click and
    # receive the credentials back automatically.
    supports_auto_setup=True,
    description="Repositories, issues and pull requests",
)

PROVIDERS: Dict[str, OAuthProvider] = {
    GOOGLE.id: GOOGLE,
    MICROSOFT.id: MICROSOFT,
    GITHUB.id: GITHUB,
}


def get_provider(provider_id: str) -> OAuthProvider | None:
    """Return the provider config for ``provider_id`` (``None`` if unknown)."""
    return PROVIDERS.get(provider_id.lower())


def resolve_url(url: str, tenant: str = "common") -> str:
    """Substitute runtime placeholders (currently only Microsoft's tenant)."""
    return url.replace("{tenant}", tenant)
