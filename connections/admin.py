"""Who is allowed to register NOVA's OAuth applications.

Registering a provider is an *operator* action, not a user one: the
``client_id`` / ``client_secret`` identify NOVA itself and are shared by
everyone on the deployment. End users never see them — they only click
Connect and sign in with their own account.

``NOVA_ADMIN_SUBS`` holds the Cognito ``sub`` of each administrator, comma
separated. When it is empty the deployment is treated as single-user (local
development, a personal install) and everyone is an administrator; setting it
is what locks a public deployment down.
"""

from __future__ import annotations

import os
from typing import List


def admin_subs() -> List[str]:
    """Return the configured administrator Cognito subs."""
    raw = os.getenv("NOVA_ADMIN_SUBS", "")
    return [s.strip() for s in raw.split(",") if s.strip()]


def is_single_user_deployment() -> bool:
    """True when no administrator list is configured."""
    return not admin_subs()


def is_admin(user_sub: str | None) -> bool:
    """Whether ``user_sub`` may register or remove OAuth applications."""
    subs = admin_subs()
    if not subs:
        # No list configured: a personal or local install, where the only
        # person who can reach the API is the operator anyway.
        return True
    return bool(user_sub) and user_sub in subs


def owner_sub() -> str | None:
    """The first administrator, used to claim pre-isolation connections."""
    subs = admin_subs()
    return subs[0] if subs else None
