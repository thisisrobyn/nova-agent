"""Identity of the user the agent is currently acting for.

The agent graph is a process-wide singleton, but the OAuth tokens it uses
belong to individual users. The chat endpoints set this context variable from
the request's JWT, and the service tools read it when resolving an access
token — so two users talking to the same NOVA process each act on their own
accounts.

A :class:`~contextvars.ContextVar` fits because ``asyncio`` snapshots the
context when a task is created: the background task that runs the graph (and
every tool call inside it) inherits the id of the request that spawned it,
with no cross-talk between concurrent sessions.
"""

from __future__ import annotations

from contextvars import ContextVar

from connections.store import LOCAL_USER_ID

#: The Cognito ``sub`` of the requesting user, or the shared local id when
#: authentication is not in play (development, CLI, standalone MCP servers).
current_user_id: ContextVar[str] = ContextVar("nova_current_user_id", default=LOCAL_USER_ID)


def set_current_user(user_id: str | None) -> None:
    """Bind the acting user for this request context."""
    current_user_id.set(user_id or LOCAL_USER_ID)


def get_current_user() -> str:
    """The user id every service tool should act as right now."""
    return current_user_id.get()
