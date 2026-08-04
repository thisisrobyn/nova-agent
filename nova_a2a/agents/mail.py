"""Mail agent — reads, searches and sends the user's email.

Serves whichever mailbox is connected: the Google and Microsoft tools are both
listed, and the ones that are not bound simply never appear in this agent's
belt.

The only worker that can do something the user cannot take back. Sending is
the one irreversible act in NOVA's tool set — a document can be deleted and an
event can be moved, but a delivered message is delivered — which is why the
brief below draws a hard line between reading and sending rather than leaving
it to the model's judgement.
"""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="mail",
    name="Mail agent",
    description="Reads, searches and sends messages in the user's connected mailboxes.",
    skills=(
        skill(
            "mail.read",
            "Read the inbox",
            "List recent messages, or open one and return its contents.",
            tags=("mail", "inbox"),
            examples=(
                "What arrived in my inbox this morning?",
                "Open the last message from Ana and tell me what she asks for",
            ),
        ),
        skill(
            "mail.search",
            "Search messages",
            "Find messages matching a sender, subject or phrase.",
            tags=("mail", "search"),
            examples=(
                "Find the thread about the Agentic Engineer role",
                "Any mail from the university about the thesis deadline?",
            ),
        ),
        skill(
            "mail.send",
            "Send a message",
            "Compose and send an email to named recipients.",
            tags=("mail", "send"),
            examples=(
                "Reply to Ana confirming Thursday at 10",
                "Send the summary to the team",
            ),
        ),
    ),
    tool_names=(
        "google_list_emails",
        "google_get_email",
        "google_send_email",
        "microsoft_list_emails",
        "microsoft_get_email",
        "microsoft_send_email",
        # "Mail from last week" is date arithmetic before it is a search.
        "get_current_datetime",
    ),
    requires_any=("google", "microsoft"),
    instructions=(
        "If the request names a provider ('my Outlook inbox'), use that provider's "
        "tools and no other. If it does not, and both are connected, use the one "
        "the user mentioned most recently in the conversation; if that is still "
        "ambiguous, say so rather than guessing.\n"
        "Sending is irreversible. Send only when the task explicitly asks you to, "
        "to the recipients it names — never to an address you inferred, and never "
        "as a helpful extra after a task that only asked you to read. If the task "
        "asks for a message to be sent but the recipient or the content is missing, "
        "fail the task and say what you were missing rather than filling the gap.\n"
        "When reporting what you read, give the sender, the subject and what the "
        "message actually asks for — the agents downstream consume this, so a list "
        "of subjects with no substance is not a result. Keep message ids to "
        "yourself for follow-up calls; never print them in the answer."
    ),
)
