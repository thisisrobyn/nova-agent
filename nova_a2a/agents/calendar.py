"""Calendar agent — scheduling, and nothing else.

Serves whichever calendar the user has connected: the Google and Microsoft
tools are both listed, and the ones that are not bound simply never appear in
this agent's belt.
"""

from __future__ import annotations

from nova_a2a.agents._common import AgentSpec, skill

SPEC = AgentSpec(
    id="calendar",
    name="Calendar agent",
    description="Creates, moves and cancels events on the user's connected calendars.",
    skills=(
        skill(
            "calendar.schedule",
            "Schedule an event",
            "Create a calendar event, resolving relative dates and checking availability.",
            tags=("calendar", "scheduling"),
            examples=(
                "Book a 30-minute review with Ana on Thursday",
                "Create an interview next Tuesday at 13:40",
            ),
        ),
        skill(
            "calendar.read",
            "Read the calendar",
            "List or search existing events in a date range.",
            tags=("calendar",),
            examples=("What do I have on Friday afternoon?",),
        ),
    ),
    tool_names=(
        "microsoft_list_calendar_events",
        "microsoft_create_calendar_event",
        "microsoft_update_calendar_event",
        "microsoft_delete_calendar_event",
        "google_list_calendar_events",
        "google_create_calendar_event",
        "google_update_calendar_event",
        "google_delete_calendar_event",
        # Scheduling is date arithmetic; give it the clock rather than hoping
        # the model gets "next Tuesday" right on its own.
        "get_current_datetime",
        "convert_timezone",
    ),
    requires_any=("google", "microsoft"),
    instructions=(
        "Resolve every relative date against the date table in this prompt before "
        "calling a tool. If the request names a provider ('my Microsoft calendar'), "
        "use that provider's tools and no other. If it does not, and both are "
        "connected, use the one the user mentioned most recently in the "
        "conversation; if that is still ambiguous, say so rather than guessing. "
        "After creating or moving an event, report its final date and time and "
        "the Markdown link the tool returned, so the user reaches it in one "
        "click. Keep the event id to yourself for follow-up calls — never print "
        "it in the answer."
    ),
)
