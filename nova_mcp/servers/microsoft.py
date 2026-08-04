"""MCP server exposing the user's Microsoft account to the agent.

Covers Outlook mail, Calendar and OneDrive through Microsoft Graph, using the
connection established from NOVA's connections panel.

Run standalone::

    uv run python -m nova_mcp.servers.microsoft
"""

from __future__ import annotations

import os
from typing import Any, Dict

import structlog
from fastmcp import FastMCP

from nova_mcp.servers._common import (
    ServiceError,
    bullet_list,
    call_api,
    event_result,
    truncate,
)

logger = structlog.stdlib.get_logger(__name__)

PROVIDER = "microsoft"

_GRAPH = "https://graph.microsoft.com/v1.0"


def _recipients(addresses: str) -> list[dict]:
    """Turn a comma-separated address list into Graph recipient objects."""
    return [
        {"emailAddress": {"address": a.strip()}}
        for a in addresses.split(",")
        if a.strip()
    ]


# ── Outlook mail ─────────────────────────────────────────────

async def microsoft_list_emails(max_results: int = 10, search: str = "") -> str:
    """List recent emails from the user's Outlook inbox.

    Args:
        max_results: How many messages to return (1-25).
        search: Optional free-text search over the mailbox, e.g. "invoice".
    """
    params: Dict[str, Any] = {
        "$top": max(1, min(max_results, 25)),
        "$select": "id,subject,from,receivedDateTime,bodyPreview,isRead",
    }
    if search:
        # $search and $orderby cannot be combined in Graph.
        params["$search"] = f'"{search}"'
    else:
        params["$orderby"] = "receivedDateTime desc"

    try:
        data = await call_api(PROVIDER, "GET", f"{_GRAPH}/me/messages", params=params)
    except ServiceError as exc:
        return str(exc)

    lines = []
    for msg in (data or {}).get("value", []):
        sender = (
            msg.get("from", {}).get("emailAddress", {}).get("address", "?")
            if msg.get("from")
            else "?"
        )
        unread = "" if msg.get("isRead", True) else " [unread]"
        lines.append(
            f"[{msg.get('id', '?')}] {msg.get('receivedDateTime', '?')} — "
            f"from {sender} — {msg.get('subject', '(no subject)')}{unread} — "
            f"{truncate(msg.get('bodyPreview'), 120)}"
        )
    return bullet_list(lines, "No emails matched.")


async def microsoft_get_email(message_id: str) -> str:
    """Read the full body of one Outlook message.

    Args:
        message_id: Id from ``microsoft_list_emails`` (the value in brackets).
    """
    try:
        msg = await call_api(
            PROVIDER,
            "GET",
            f"{_GRAPH}/me/messages/{message_id}",
            params={"$select": "subject,from,toRecipients,receivedDateTime,body"},
        )
    except ServiceError as exc:
        return str(exc)

    sender = (msg.get("from") or {}).get("emailAddress", {}).get("address", "?")
    to = ", ".join(
        r.get("emailAddress", {}).get("address", "?")
        for r in msg.get("toRecipients", [])
    )
    body = (msg.get("body") or {}).get("content", "")

    return (
        f"From: {sender}\n"
        f"To: {to or '?'}\n"
        f"Date: {msg.get('receivedDateTime', '?')}\n"
        f"Subject: {msg.get('subject', '(no subject)')}\n\n"
        f"{truncate(body, 4000)}"
    )


async def microsoft_send_email(to: str, subject: str, body: str, cc: str = "") -> str:
    """Send an email from the user's Outlook account.

    Args:
        to: Recipient address, or several separated by commas.
        subject: Subject line.
        body: Plain-text message body.
        cc: Optional carbon-copy addresses, comma separated.
    """
    message: Dict[str, Any] = {
        "subject": subject,
        "body": {"contentType": "Text", "content": body},
        "toRecipients": _recipients(to),
    }
    if cc:
        message["ccRecipients"] = _recipients(cc)

    try:
        await call_api(
            PROVIDER,
            "POST",
            f"{_GRAPH}/me/sendMail",
            json={"message": message, "saveToSentItems": True},
        )
    except ServiceError as exc:
        return str(exc)

    return f"Email sent to {to}."


# ── Calendar ─────────────────────────────────────────────────

async def microsoft_list_calendar_events(
    max_results: int = 10, start: str = "", end: str = ""
) -> str:
    """List upcoming events from the user's Outlook calendar.

    Args:
        max_results: How many events to return (1-25).
        start: Optional ISO-8601 lower bound, e.g. "2026-08-02T00:00:00Z".
            Defaults to now.
        end: Optional ISO-8601 upper bound. Defaults to 30 days ahead.
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    params = {
        "startDateTime": start or now.isoformat(),
        "endDateTime": end or (now + timedelta(days=30)).isoformat(),
        "$top": max(1, min(max_results, 25)),
        "$orderby": "start/dateTime",
        "$select": "id,subject,start,end,location,organizer",
    }

    try:
        data = await call_api(
            PROVIDER, "GET", f"{_GRAPH}/me/calendarView", params=params
        )
    except ServiceError as exc:
        return str(exc)

    lines = []
    for event in (data or {}).get("value", []):
        when = (event.get("start") or {}).get("dateTime", "?")
        location = (event.get("location") or {}).get("displayName")
        suffix = f" @ {location}" if location else ""
        # The id is what microsoft_update/delete_calendar_event need.
        lines.append(
            f"[{event.get('id', '?')}] {when} — "
            f"{event.get('subject', '(no title)')}{suffix}"
        )

    return bullet_list(lines, "No upcoming events.")


async def microsoft_create_calendar_event(
    subject: str,
    start: str,
    end: str,
    body: str = "",
    location: str = "",
    attendees: str = "",
    timezone_name: str = "UTC",
) -> str:
    """Create an event in the user's Outlook calendar.

    Args:
        subject: Event title.
        start: Start time in ISO-8601, e.g. "2026-08-05T10:00:00".
        end: End time in ISO-8601.
        body: Optional longer description.
        location: Optional location.
        attendees: Optional guest emails, comma separated.
        timezone_name: IANA time zone the start/end times are expressed in.
    """
    payload: Dict[str, Any] = {
        "subject": subject,
        "start": {"dateTime": start, "timeZone": timezone_name},
        "end": {"dateTime": end, "timeZone": timezone_name},
    }
    if body:
        payload["body"] = {"contentType": "Text", "content": body}
    if location:
        payload["location"] = {"displayName": location}
    if attendees:
        payload["attendees"] = [
            {"emailAddress": {"address": a.strip()}, "type": "required"}
            for a in attendees.split(",")
            if a.strip()
        ]

    try:
        event = await call_api(PROVIDER, "POST", f"{_GRAPH}/me/events", json=payload)
    except ServiceError as exc:
        return str(exc)

    event = event or {}
    return event_result(
        "created", subject, event.get("id", ""), event.get("webLink", "")
    )


async def microsoft_update_calendar_event(
    event_id: str,
    subject: str = "",
    start: str = "",
    end: str = "",
    location: str = "",
    timezone_name: str = "UTC",
) -> str:
    """Change an existing event in the user's Outlook calendar.

    Only the fields you pass are modified; leave the rest empty to keep them.
    Call microsoft_list_calendar_events first to find the event id.

    Args:
        event_id: Id of the event, shown in brackets by microsoft_list_calendar_events.
        subject: New title, if it should change.
        start: New start time in ISO-8601, if it should change.
        end: New end time in ISO-8601, if it should change.
        location: New location, if it should change.
        timezone_name: IANA time zone the new start/end times are expressed in.
    """
    patch: Dict[str, Any] = {}
    if subject:
        patch["subject"] = subject
    if start:
        patch["start"] = {"dateTime": start, "timeZone": timezone_name}
    if end:
        patch["end"] = {"dateTime": end, "timeZone": timezone_name}
    if location:
        patch["location"] = {"displayName": location}

    if not patch:
        return "Nothing to change — provide at least one field to update."

    try:
        event = await call_api(
            PROVIDER, "PATCH", f"{_GRAPH}/me/events/{event_id}", json=patch
        )
    except ServiceError as exc:
        return str(exc)

    event = event or {}
    return event_result(
        "updated",
        subject or event.get("subject", ""),
        event.get("id", event_id),
        event.get("webLink", ""),
    )


async def microsoft_delete_calendar_event(event_id: str) -> str:
    """Delete an event from the user's Outlook calendar.

    Call microsoft_list_calendar_events first to find the event id.

    Args:
        event_id: Id of the event, shown in brackets by microsoft_list_calendar_events.
    """
    try:
        await call_api(PROVIDER, "DELETE", f"{_GRAPH}/me/events/{event_id}")
    except ServiceError as exc:
        return str(exc)

    return f"Event {event_id} deleted."


# ── OneDrive ─────────────────────────────────────────────────

async def microsoft_list_files(folder_path: str = "", max_results: int = 20) -> str:
    """List files and folders in the user's OneDrive.

    Args:
        folder_path: Folder to list, e.g. "Documents/Reports". Empty for root.
        max_results: How many entries to return (1-50).
    """
    if folder_path:
        url = f"{_GRAPH}/me/drive/root:/{folder_path.strip('/')}:/children"
    else:
        url = f"{_GRAPH}/me/drive/root/children"

    try:
        data = await call_api(
            PROVIDER,
            "GET",
            url,
            params={"$top": max(1, min(max_results, 50))},
        )
    except ServiceError as exc:
        return str(exc)

    lines = []
    for item in (data or {}).get("value", []):
        kind = "folder" if "folder" in item else "file"
        size = item.get("size", 0)
        lines.append(
            f"{item.get('name', '?')} ({kind}, {size} bytes) — "
            f"modified {item.get('lastModifiedDateTime', '?')}"
        )
    return bullet_list(lines, "This folder is empty.")


# ── MCP server ───────────────────────────────────────────────

TOOLS = [
    microsoft_list_emails,
    microsoft_get_email,
    microsoft_send_email,
    microsoft_list_calendar_events,
    microsoft_create_calendar_event,
    microsoft_update_calendar_event,
    microsoft_delete_calendar_event,
    microsoft_list_files,
]

mcp = FastMCP(
    name="nova-microsoft",
    instructions=(
        "Outlook mail, Calendar and OneDrive for the Microsoft account "
        "connected to NOVA."
    ),
)

for _fn in TOOLS:
    mcp.tool()(_fn)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    logger.info("starting NOVA Microsoft MCP server", transport=transport)
    mcp.run(transport="sse" if transport == "http" else "stdio")
