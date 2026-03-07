"""Date and time utilities for NOVA.

Provides the agent with tools to retrieve the current date/time
and convert between time zones.
"""

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from langchain_core.tools import tool

logger = logging.getLogger(__name__)


@tool
def get_current_datetime(timezone_name: str = "UTC") -> str:
    """Return the current date and time in the given time zone.

    Args:
        timezone_name: IANA time zone name (e.g. 'Europe/Madrid', 'US/Eastern').
            Defaults to 'UTC'.

    Returns:
        A human-readable date/time string including the time zone.
    """
    try:
        tz = ZoneInfo(timezone_name)
        now = datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S %Z (UTC%z)")
    except Exception as e:
        logger.error("get_current_datetime failed: %s", e)
        return f"Error: unable to get time for zone '{timezone_name}' – {e}"


@tool
def convert_timezone(
    time_str: str,
    from_tz: str = "UTC",
    to_tz: str = "Europe/Madrid",
) -> str:
    """Convert a time string from one time zone to another.

    Args:
        time_str: Time in 'HH:MM' or 'YYYY-MM-DD HH:MM:SS' format.
        from_tz: Source IANA time zone. Defaults to 'UTC'.
        to_tz: Target IANA time zone. Defaults to 'Europe/Madrid'.

    Returns:
        The converted time as a readable string.
    """
    try:
        source = ZoneInfo(from_tz)
        target = ZoneInfo(to_tz)

        # Try full datetime first, then time-only
        for fmt in ("%Y-%m-%d %H:%M:%S", "%H:%M:%S", "%H:%M"):
            try:
                dt = datetime.strptime(time_str, fmt)
                break
            except ValueError:
                continue
        else:
            return f"Error: unrecognised time format '{time_str}'. Use HH:MM or YYYY-MM-DD HH:MM:SS."

        dt = dt.replace(tzinfo=source)
        converted = dt.astimezone(target)
        return converted.strftime("%Y-%m-%d %H:%M:%S %Z (UTC%z)")
    except Exception as e:
        logger.error("convert_timezone failed: %s", e)
        return f"Error: {e}"
