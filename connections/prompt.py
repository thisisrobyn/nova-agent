"""Connection state as system-prompt context.

The agent has to behave differently depending on which services the user has
signed into:

- a service that is not connected must produce a plain refusal, never an
  invented result;
- a request that could be served by more than one connected provider
  ("send an email") must be disambiguated before acting;
- a request that only one connected provider can serve should just work.

None of that is knowable from the tool list alone, so the current state is
injected into the system prompt on every turn.
"""

from __future__ import annotations

import structlog

from connections.credentials import get_credentials
from connections.providers import PROVIDERS
from connections.store import LOCAL_USER_ID, get_connection

logger = structlog.stdlib.get_logger(__name__)

#: Providers that offer overlapping capabilities, so a bare "send an email"
#: or "check my calendar" is ambiguous when more than one is connected.
_OVERLAPPING = ("google", "microsoft")


async def build_services_block(user_id: str | None = None) -> str:
    """Render the connected-services section of the system prompt.

    Always lists every provider, including ones that are not set up. Staying
    silent about them is what lets a model invent a plausible-sounding tool
    name (``google:calendar:create event``) instead of simply reporting that
    the account is not connected.
    """
    if user_id is None:
        # Whoever the current request is acting for (see connections.context).
        from connections.context import get_current_user

        user_id = get_current_user()

    try:
        lines: list[str] = []
        connected: list[str] = []

        for provider in PROVIDERS.values():
            creds = await get_credentials(provider.id)
            if creds is None:
                lines.append(
                    f"- {provider.label}: NOT AVAILABLE — this NOVA install has "
                    f"not registered a {provider.label} application yet, so it "
                    f"cannot be connected at all right now."
                )
                continue

            conn = await get_connection(provider.id, user_id)
            if conn and conn.access_token:
                account = conn.account_email or conn.account_name or "connected account"
                lines.append(f"- {provider.label}: CONNECTED as {account}")
                connected.append(provider.id)
            else:
                lines.append(
                    f"- {provider.label}: NOT CONNECTED — the user has not "
                    f"signed in yet."
                )
    except Exception:
        logger.warning("could not build services context", exc_info=True)
        return ""

    overlapping_connected = [p for p in _OVERLAPPING if p in connected]

    rules = [
        "- You only have tools for services marked CONNECTED. For any other "
        "service you have NO tools at all.",
        "- Never invent, guess or improvise a tool name. If no tool exists for "
        "what the user asked, do not attempt a call: answer directly instead.",
        "- When the user asks for something in a service that is NOT CONNECTED "
        "or NOT AVAILABLE, give one short answer: you cannot do it because that "
        "account is not connected, and they can connect it from the connections "
        "panel in the sidebar. Never claim to have sent, read, created or "
        "changed anything there, and do not ask them for more details about a "
        "request you cannot carry out.",
        "- Never ask the user for passwords, API keys or tokens. Signing in "
        "happens only through the connections panel.",
    ]

    if len(overlapping_connected) > 1:
        labels = " or ".join(PROVIDERS[p].label for p in overlapping_connected)
        rules.append(
            f"- {labels} both cover email, calendar and files. If the user asks "
            f"for one of those WITHOUT naming a service (for example 'send an "
            f"email' or 'what's on my calendar'), ask which one they mean "
            f"({labels}) and wait for their answer before calling any tool. Do "
            f"not guess. If they do name a service, use that one directly."
        )
    elif len(overlapping_connected) == 1:
        label = PROVIDERS[overlapping_connected[0]].label
        rules.append(
            f"- {label} is the only connected account for email, calendar and "
            f"files, so use it directly for those requests without asking which "
            f"service to use."
        )

    return (
        "\n\n--- CONNECTED SERVICES ---\n"
        + "\n".join(lines)
        + "\n\nRules:\n"
        + "\n".join(rules)
        + "\n--- END CONNECTED SERVICES ---\n"
    )
