"""JWT and API-key authentication for NOVA API.

Validates Cognito JWT tokens and nova-sk-* API keys.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwk, jwt

logger = logging.getLogger(__name__)

COGNITO_REGION = os.getenv("AWS_REGION", "us-east-1")
COGNITO_POOL_ID = os.getenv("COGNITO_POOL_ID", "us-east-1_7JyhPlOoW")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "53vn2vlsppua8ucjlq3ogvv5qp")

_JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
    f"{COGNITO_POOL_ID}/.well-known/jwks.json"
)
_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}"

# Cached JWKS keys
_jwks_cache: dict | None = None
_jwks_cache_ts: float = 0
_JWKS_TTL = 3600  # refresh every hour


async def _get_jwks() -> dict:
    """Download and cache Cognito JWKS."""
    global _jwks_cache, _jwks_cache_ts
    if _jwks_cache and (time.time() - _jwks_cache_ts) < _JWKS_TTL:
        return _jwks_cache
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(_JWKS_URL, timeout=5)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_cache_ts = time.time()
            return _jwks_cache
    except Exception as exc:
        logger.warning("Failed to fetch JWKS: %s", exc)
        if _jwks_cache:
            return _jwks_cache
        raise HTTPException(status_code=503, detail="Auth service unavailable")


async def _decode_jwt(token: str) -> dict:
    """Validate and decode a Cognito JWT id_token."""
    jwks_data = await _get_jwks()
    headers = jwt.get_unverified_headers(token)
    kid = headers.get("kid")

    key = None
    for k in jwks_data.get("keys", []):
        if k["kid"] == kid:
            key = k
            break
    if not key:
        raise HTTPException(status_code=401, detail="Invalid token key")

    try:
        public_key = jwk.construct(key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            issuer=_ISSUER,
        )
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


class AuthenticatedUser:
    """Represents the current authenticated user."""

    def __init__(self, sub: str, email: str, name: str, auth_method: str = "jwt"):
        self.sub = sub
        self.email = email
        self.name = name
        self.auth_method = auth_method  # "jwt" or "api_key"


async def get_current_user(request: Request) -> AuthenticatedUser:
    """FastAPI dependency: extract user from Authorization header.

    Supports:
      - Bearer <jwt>       → Cognito id_token
      - Bearer nova-sk-*   → API key (validated against DynamoDB)
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = auth_header[7:].strip()

    # API key flow
    if token.startswith("nova-sk-"):
        from api.db import validate_api_key

        key_data = await validate_api_key(token)
        if not key_data:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key")
        return AuthenticatedUser(
            sub=key_data["user_id"],
            email=key_data.get("user_email", ""),
            name=key_data.get("user_name", "API User"),
            auth_method="api_key",
        )

    # JWT flow
    payload = await _decode_jwt(token)
    return AuthenticatedUser(
        sub=payload.get("sub", ""),
        email=payload.get("email", ""),
        name=payload.get("name", payload.get("email", "")),
        auth_method="jwt",
    )


async def get_optional_user(request: Request) -> Optional[AuthenticatedUser]:
    """Like get_current_user but returns None instead of 401."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
