"""DynamoDB operations for NOVA — API keys management."""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import time
from typing import Any, Optional

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger(__name__)

_REGION = os.getenv("AWS_REGION", "us-east-1")
_API_KEYS_TABLE = os.getenv("DYNAMODB_API_KEYS_TABLE", "nova-api-keys")

_dynamodb = None


def _get_table(table_name: str):
    """Lazy-init DynamoDB table resource."""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=_REGION)
    return _dynamodb.Table(table_name)


def _generate_api_key() -> str:
    """Generate a cryptographically secure API key."""
    random_part = secrets.token_hex(24)  # 48-char hex
    return f"nova-sk-{random_part}"


async def create_api_key(
    user_id: str,
    user_email: str,
    user_name: str,
    key_name: str = "Default",
) -> dict[str, Any]:
    """Create a new API key for a user.

    Returns the full key record including the raw key (only shown once).
    """
    api_key = _generate_api_key()
    now = int(time.time())

    item = {
        "api_key": api_key,
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "key_name": key_name,
        "created_at": now,
        "is_active": True,
    }

    table = _get_table(_API_KEYS_TABLE)
    table.put_item(Item=item)
    logger.info("API key created for user %s: %s...%s", user_id, api_key[:12], api_key[-4:])

    return item


async def list_api_keys(user_id: str) -> list[dict[str, Any]]:
    """List all API keys for a user (masks key values)."""
    table = _get_table(_API_KEYS_TABLE)

    resp = table.query(
        IndexName="user-index",
        KeyConditionExpression=Key("user_id").eq(user_id),
    )

    keys = []
    for item in resp.get("Items", []):
        raw = item.get("api_key", "")
        keys.append({
            "api_key_masked": f"{raw[:12]}...{raw[-4:]}" if len(raw) > 16 else "****",
            "api_key_id": hashlib.sha256(raw.encode()).hexdigest()[:16],
            "key_name": item.get("key_name", ""),
            "created_at": item.get("created_at", 0),
            "is_active": item.get("is_active", True),
        })

    return sorted(keys, key=lambda k: k["created_at"], reverse=True)


async def revoke_api_key(user_id: str, api_key_id: str) -> bool:
    """Revoke (delete) an API key by its short hash ID."""
    table = _get_table(_API_KEYS_TABLE)

    # Find the actual key by scanning user's keys
    resp = table.query(
        IndexName="user-index",
        KeyConditionExpression=Key("user_id").eq(user_id),
    )

    for item in resp.get("Items", []):
        raw = item.get("api_key", "")
        short_id = hashlib.sha256(raw.encode()).hexdigest()[:16]
        if short_id == api_key_id:
            table.delete_item(Key={"api_key": raw})
            logger.info("API key revoked for user %s: %s", user_id, short_id)
            return True

    return False


async def validate_api_key(api_key: str) -> Optional[dict[str, Any]]:
    """Validate an API key. Returns key data if valid, None otherwise."""
    table = _get_table(_API_KEYS_TABLE)

    try:
        resp = table.get_item(Key={"api_key": api_key})
        item = resp.get("Item")
        if item and item.get("is_active", False):
            return item
        return None
    except Exception as exc:
        logger.warning("API key validation error: %s", exc)
        return None


async def delete_user_keys(user_id: str) -> int:
    """Delete all API keys for a user (used on account deletion)."""
    table = _get_table(_API_KEYS_TABLE)

    resp = table.query(
        IndexName="user-index",
        KeyConditionExpression=Key("user_id").eq(user_id),
    )

    count = 0
    for item in resp.get("Items", []):
        table.delete_item(Key={"api_key": item["api_key"]})
        count += 1

    logger.info("Deleted %d API keys for user %s", count, user_id)
    return count
