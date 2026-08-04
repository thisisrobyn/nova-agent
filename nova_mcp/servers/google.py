"""MCP server exposing the user's Google account to the agent.

Covers Gmail, Calendar, Drive, Sheets and Docs through the connection
established from NOVA's connections panel.

Run standalone::

    uv run python -m nova_mcp.servers.google
"""

from __future__ import annotations

import base64
import os
from email.message import EmailMessage
from typing import Any, Dict, List

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

PROVIDER = "google"

_GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
_CALENDAR = "https://www.googleapis.com/calendar/v3"
_DRIVE = "https://www.googleapis.com/drive/v3"
_SHEETS = "https://sheets.googleapis.com/v4/spreadsheets"
_DOCS = "https://docs.googleapis.com/v1/documents"


# ── Gmail ────────────────────────────────────────────────────

async def google_list_emails(max_results: int = 10, query: str = "") -> str:
    """List recent emails from the user's Gmail inbox.

    Args:
        max_results: How many messages to return (1-25).
        query: Optional Gmail search query such as 'from:ana@x.com is:unread' or 'subject:invoice newer_than:7d'. Leave empty for the newest messages.
    """
    try:
        params: Dict[str, Any] = {"maxResults": max(1, min(max_results, 25))}
        if query:
            params["q"] = query
        listing = await call_api(PROVIDER, "GET", f"{_GMAIL}/messages", params=params)

        ids = [m["id"] for m in (listing or {}).get("messages", [])]
        if not ids:
            return "No emails matched."

        lines: List[str] = []
        for message_id in ids:
            detail = await call_api(
                PROVIDER,
                "GET",
                f"{_GMAIL}/messages/{message_id}",
                params={
                    "format": "metadata",
                    "metadataHeaders": ["From", "Subject", "Date"],
                },
            )
            headers = {
                h["name"]: h["value"]
                for h in (detail or {}).get("payload", {}).get("headers", [])
            }
            lines.append(
                f"[{message_id}] {headers.get('Date', '?')} — "
                f"from {headers.get('From', '?')} — "
                f"{headers.get('Subject', '(no subject)')} — "
                f"{truncate((detail or {}).get('snippet'), 120)}"
            )
        return bullet_list(lines, "No emails matched.")
    except ServiceError as exc:
        return str(exc)


async def google_get_email(message_id: str) -> str:
    """Read the full body of one Gmail message.

    Args:
        message_id: Id from ``google_list_emails`` (the value in brackets).
    """
    try:
        detail = await call_api(
            PROVIDER, "GET", f"{_GMAIL}/messages/{message_id}", params={"format": "full"}
        )
    except ServiceError as exc:
        return str(exc)

    payload = (detail or {}).get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
    body = _extract_plain_body(payload) or detail.get("snippet", "")

    return (
        f"From: {headers.get('From', '?')}\n"
        f"To: {headers.get('To', '?')}\n"
        f"Date: {headers.get('Date', '?')}\n"
        f"Subject: {headers.get('Subject', '(no subject)')}\n\n"
        f"{truncate(body, 4000)}"
    )


def _extract_plain_body(payload: Dict[str, Any]) -> str:
    """Walk a Gmail MIME tree and return the first text/plain part."""
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", "replace")

    for part in payload.get("parts", []) or []:
        found = _extract_plain_body(part)
        if found:
            return found
    return ""


async def google_send_email(to: str, subject: str, body: str, cc: str = "") -> str:
    """Send an email from the user's Gmail account.

    Args:
        to: Recipient address, or several separated by commas.
        subject: Subject line.
        body: Plain-text message body.
        cc: Optional carbon-copy addresses, comma separated.
    """
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    if cc:
        message["Cc"] = cc
    message.set_content(body)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    try:
        sent = await call_api(
            PROVIDER, "POST", f"{_GMAIL}/messages/send", json={"raw": raw}
        )
    except ServiceError as exc:
        return str(exc)

    return f"Email sent to {to} (id {sent.get('id', '?')})."


# ── Calendar ─────────────────────────────────────────────────

async def google_list_calendar_events(
    max_results: int = 10, time_min: str = "", time_max: str = ""
) -> str:
    """List upcoming events from the user's primary Google Calendar.

    Args:
        max_results: How many events to return (1-25).
        time_min: Optional RFC3339 lower bound, e.g. "2026-08-02T00:00:00Z".
            Defaults to now.
        time_max: Optional RFC3339 upper bound.
    """
    from datetime import datetime, timezone

    params: Dict[str, Any] = {
        "maxResults": max(1, min(max_results, 25)),
        "singleEvents": "true",
        "orderBy": "startTime",
        "timeMin": time_min or datetime.now(timezone.utc).isoformat(),
    }
    if time_max:
        params["timeMax"] = time_max

    try:
        data = await call_api(
            PROVIDER, "GET", f"{_CALENDAR}/calendars/primary/events", params=params
        )
    except ServiceError as exc:
        return str(exc)

    lines = []
    for event in (data or {}).get("items", []):
        start = event.get("start", {})
        when = start.get("dateTime") or start.get("date") or "?"
        location = event.get("location")
        suffix = f" @ {location}" if location else ""
        # The id is what google_update/delete_calendar_event need.
        lines.append(
            f"[{event.get('id', '?')}] {when} — "
            f"{event.get('summary', '(no title)')}{suffix}"
        )

    return bullet_list(lines, "No upcoming events.")


async def google_create_calendar_event(
    summary: str,
    start: str,
    end: str,
    description: str = "",
    location: str = "",
    attendees: str = "",
) -> str:
    """Create an event in the user's primary Google Calendar.

    Args:
        summary: Event title.
        start: Start time in RFC3339, e.g. "2026-08-05T10:00:00+02:00".
        end: End time in RFC3339.
        description: Optional longer description.
        location: Optional location.
        attendees: Optional guest emails, comma separated.
    """
    body: Dict[str, Any] = {
        "summary": summary,
        "start": {"dateTime": start},
        "end": {"dateTime": end},
    }
    if description:
        body["description"] = description
    if location:
        body["location"] = location
    if attendees:
        body["attendees"] = [
            {"email": a.strip()} for a in attendees.split(",") if a.strip()
        ]

    try:
        event = await call_api(
            PROVIDER, "POST", f"{_CALENDAR}/calendars/primary/events", json=body
        )
    except ServiceError as exc:
        return str(exc)

    event = event or {}
    return event_result(
        "created", summary, event.get("id", ""), event.get("htmlLink", "")
    )


async def google_update_calendar_event(
    event_id: str,
    summary: str = "",
    start: str = "",
    end: str = "",
    description: str = "",
    location: str = "",
) -> str:
    """Change an existing event in the user's primary Google Calendar.

    Only the fields you pass are modified; leave the rest empty to keep them.
    Call google_list_calendar_events first to find the event id.

    Args:
        event_id: Id of the event, shown in brackets by google_list_calendar_events.
        summary: New title, if it should change.
        start: New start time in RFC3339, if it should change.
        end: New end time in RFC3339, if it should change.
        description: New description, if it should change.
        location: New location, if it should change.
    """
    patch: Dict[str, Any] = {}
    if summary:
        patch["summary"] = summary
    if start:
        patch["start"] = {"dateTime": start}
    if end:
        patch["end"] = {"dateTime": end}
    if description:
        patch["description"] = description
    if location:
        patch["location"] = location

    if not patch:
        return "Nothing to change — provide at least one field to update."

    try:
        event = await call_api(
            PROVIDER,
            "PATCH",
            f"{_CALENDAR}/calendars/primary/events/{event_id}",
            json=patch,
        )
    except ServiceError as exc:
        return str(exc)

    event = event or {}
    return event_result(
        "updated",
        summary or event.get("summary", ""),
        event.get("id", event_id),
        event.get("htmlLink", ""),
    )


async def google_delete_calendar_event(event_id: str) -> str:
    """Delete an event from the user's primary Google Calendar.

    Call google_list_calendar_events first to find the event id. Deleting one
    occurrence of a recurring event requires that occurrence's own id.

    Args:
        event_id: Id of the event, shown in brackets by google_list_calendar_events.
    """
    try:
        await call_api(
            PROVIDER, "DELETE", f"{_CALENDAR}/calendars/primary/events/{event_id}"
        )
    except ServiceError as exc:
        return str(exc)

    return f"Event {event_id} deleted."


# ── Drive, Sheets and Docs ───────────────────────────────────

async def google_list_drive_files(query: str = "", max_results: int = 15) -> str:
    """List files in the user's Google Drive.

    Args:
        query: Optional Drive query, e.g. "name contains 'budget'" or
            "mimeType='application/vnd.google-apps.spreadsheet'".
        max_results: How many files to return (1-50).
    """
    params: Dict[str, Any] = {
        "pageSize": max(1, min(max_results, 50)),
        "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
        "orderBy": "modifiedTime desc",
    }
    if query:
        params["q"] = query

    try:
        data = await call_api(PROVIDER, "GET", f"{_DRIVE}/files", params=params)
    except ServiceError as exc:
        return str(exc)

    lines = [
        f"{f.get('name', '?')} ({f.get('mimeType', '?').split('.')[-1]}) — "
        f"modified {f.get('modifiedTime', '?')} — {f.get('webViewLink', '')}"
        for f in (data or {}).get("files", [])
    ]
    return bullet_list(lines, "No files matched.")


async def google_create_spreadsheet(title: str, sheet_name: str = "Sheet1") -> str:
    """Create a new Google Sheets spreadsheet.

    Args:
        title: Name of the spreadsheet.
        sheet_name: Name of its first tab.
    """
    body = {
        "properties": {"title": title},
        "sheets": [{"properties": {"title": sheet_name}}],
    }
    try:
        sheet = await call_api(PROVIDER, "POST", _SHEETS, json=body)
    except ServiceError as exc:
        return str(exc)

    return (
        f"Spreadsheet '{title}' created (id {sheet.get('spreadsheetId')}): "
        f"{sheet.get('spreadsheetUrl', '')}"
    )


async def google_append_sheet_rows(
    spreadsheet_id: str, rows: str, sheet_name: str = "Sheet1"
) -> str:
    """Append rows to an existing Google Sheets spreadsheet.

    Args:
        spreadsheet_id: Id of the target spreadsheet.
        rows: Rows to append, one per line, with cells separated by a pipe character. For example a line reading 'Coffee|3.50' appends two cells.
        sheet_name: Tab to append to.
    """
    values = [line.split("|") for line in rows.splitlines() if line.strip()]
    if not values:
        return "No rows to append — provide at least one line."

    try:
        result = await call_api(
            PROVIDER,
            "POST",
            f"{_SHEETS}/{spreadsheet_id}/values/{sheet_name}:append",
            params={"valueInputOption": "USER_ENTERED"},
            json={"values": values},
        )
    except ServiceError as exc:
        return str(exc)

    updated = (result or {}).get("updates", {}).get("updatedRows", len(values))
    return f"Appended {updated} row(s) to '{sheet_name}'."


async def google_create_document(title: str, content: str = "") -> str:
    """Create a new Google Docs document.

    Args:
        title: Document title.
        content: Optional initial body text.
    """
    try:
        doc = await call_api(PROVIDER, "POST", _DOCS, json={"title": title})
        document_id = doc.get("documentId")

        if content and document_id:
            await call_api(
                PROVIDER,
                "POST",
                f"{_DOCS}/{document_id}:batchUpdate",
                json={
                    "requests": [
                        {"insertText": {"location": {"index": 1}, "text": content}}
                    ]
                },
            )
    except ServiceError as exc:
        return str(exc)

    return (
        f"Document '{title}' created: "
        f"https://docs.google.com/document/d/{document_id}/edit"
    )


# ── MCP server ───────────────────────────────────────────────

#: Single source of truth — registered with FastMCP below and bridged into
#: LangChain tools by :mod:`nova_mcp.builtin`.
TOOLS = [
    google_list_emails,
    google_get_email,
    google_send_email,
    google_list_calendar_events,
    google_create_calendar_event,
    google_update_calendar_event,
    google_delete_calendar_event,
    google_list_drive_files,
    google_create_spreadsheet,
    google_append_sheet_rows,
    google_create_document,
]

mcp = FastMCP(
    name="nova-google",
    instructions=(
        "Gmail, Calendar, Drive, Sheets and Docs for the Google account "
        "connected to NOVA."
    ),
)

for _fn in TOOLS:
    mcp.tool()(_fn)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    logger.info("starting NOVA Google MCP server", transport=transport)
    mcp.run(transport="sse" if transport == "http" else "stdio")
