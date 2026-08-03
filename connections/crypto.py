"""Symmetric encryption for OAuth tokens at rest.

Tokens are encrypted with Fernet (AES-128-CBC + HMAC) before being written
to SQLite so that a leaked database file does not expose live credentials.

The key is read from ``NOVA_ENCRYPTION_KEY``.  When that variable is not
set, a key is generated once and persisted to ``data/.connection_key`` so
local development works without extra setup.  Production deployments should
always set the environment variable explicitly.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

import structlog
from cryptography.fernet import Fernet, InvalidToken

logger = structlog.stdlib.get_logger(__name__)

_KEY_FILE = Path("data") / ".connection_key"

_fernet: Fernet | None = None


def _load_or_create_key() -> bytes:
    """Return the Fernet key, generating and persisting one if needed."""
    env_key = os.getenv("NOVA_ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes().strip()

    key = Fernet.generate_key()
    _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _KEY_FILE.write_bytes(key)
    try:
        # Best effort: owner read/write only (no-op on most Windows setups).
        _KEY_FILE.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass

    logger.warning(
        "generated a local token encryption key",
        path=str(_KEY_FILE),
        hint="set NOVA_ENCRYPTION_KEY in production",
    )
    return key


def _get_fernet() -> Fernet:
    """Return the process-wide Fernet instance (lazy init)."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def encrypt(value: str) -> str:
    """Encrypt a token for storage.  Returns a urlsafe base64 string."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str | None:
    """Decrypt a stored token.

    Returns ``None`` when the ciphertext cannot be read -- typically because
    the encryption key changed, in which case the connection must be
    re-authorized rather than crashing the request.
    """
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        logger.warning("failed to decrypt stored token", error=str(exc))
        return None
