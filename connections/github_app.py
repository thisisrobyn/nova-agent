"""One-click GitHub App registration via the app-manifest flow.

GitHub is the only one of the three providers that lets an application
register *itself*: NOVA posts a manifest describing the app it wants, the
operator clicks "Create GitHub App", and GitHub redirects back with a
temporary code that converts into the app's ``client_id`` and
``client_secret``.  No copy-pasting from a developer console.

See https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
"""

from __future__ import annotations

from typing import Any, Dict

import httpx
import structlog

from connections.credentials import save_credentials
from connections.providers import GITHUB, get_public_url

logger = structlog.stdlib.get_logger(__name__)

_CONVERSION_URL = "https://api.github.com/app-manifests/{code}/conversions"
_HTTP_TIMEOUT = 15

#: Repository permissions the app requests.  ``administration`` is what makes
#: creating new repositories possible; the rest cover reading and writing code,
#: issues and pull requests.
_DEFAULT_PERMISSIONS: Dict[str, str] = {
    "metadata": "read",
    "contents": "write",
    "issues": "write",
    "pull_requests": "write",
    "administration": "write",
}


class GitHubAppError(Exception):
    """Raised when GitHub rejects the manifest conversion."""


def manifest_redirect_url() -> str:
    """Where GitHub sends the operator after the app is created."""
    return f"{get_public_url()}/api/v1/connections/github/setup/callback"


def registration_url(org: str | None = None) -> str:
    """Return the GitHub page the manifest form must be submitted to."""
    if org:
        return f"https://github.com/organizations/{org}/settings/apps/new"
    return "https://github.com/settings/apps/new"


def build_manifest(name: str = "NOVA Agent") -> Dict[str, Any]:
    """Build the GitHub App manifest describing NOVA.

    Args:
        name: App name shown on GitHub.  Must be unique across GitHub, so the
            operator may need to adjust it if it is already taken.
    """
    public_url = get_public_url()
    return {
        "name": name,
        "url": public_url,
        # Where GitHub returns the temporary conversion code.
        "redirect_url": manifest_redirect_url(),
        # Where user-to-server authorizations come back to.
        "callback_urls": [GITHUB.redirect_uri],
        "description": "Neural Orchestration & Virtual Agent — repository access for the NOVA agent.",
        "public": False,
        "default_permissions": _DEFAULT_PERMISSIONS,
        "default_events": [],
        # A user access token only reaches repositories where the app is
        # *installed*, so installing must double as authorizing — otherwise
        # users authorize, never install, and every repo listing comes back
        # empty. https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
        "request_oauth_on_install": True,
    }


def install_url(app_slug: str) -> str:
    """Where a user installs the app on their account, granting repo access."""
    return f"https://github.com/apps/{app_slug}/installations/new"


async def convert_manifest_code(code: str) -> Dict[str, Any]:
    """Exchange a manifest code for the created app's credentials.

    The credentials are persisted immediately so the provider becomes usable
    without any further operator action.

    Returns:
        A summary of the created app (``name``, ``slug``, ``html_url``).

    Raises:
        GitHubAppError: If GitHub rejects the conversion or omits credentials.
    """
    headers = {"Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.post(_CONVERSION_URL.format(code=code), headers=headers)

    try:
        data = resp.json()
    except ValueError:
        raise GitHubAppError("GitHub returned a non-JSON response")

    if resp.status_code >= 400:
        raise GitHubAppError(data.get("message") or f"HTTP {resp.status_code}")

    client_id = data.get("client_id")
    client_secret = data.get("client_secret")
    if not client_id or not client_secret:
        raise GitHubAppError("GitHub did not return app credentials")

    await save_credentials(
        GITHUB.id,
        client_id,
        client_secret,
        extra={
            "app_id": data.get("id"),
            "app_slug": data.get("slug"),
            "app_url": data.get("html_url"),
            "owner": (data.get("owner") or {}).get("login"),
        },
    )

    logger.info("github app registered from manifest", slug=data.get("slug"))

    return {
        "name": data.get("name"),
        "slug": data.get("slug"),
        "html_url": data.get("html_url"),
    }
