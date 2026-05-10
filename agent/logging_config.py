"""Structured logging configuration using structlog.

- **development**: colored console renderer, human-readable output.
- **production**: JSON renderer for log aggregation.

Call ``configure_logging()`` once at application startup (before any
log statements) -- typically from ``api/main.py`` lifespan or CLI entry.

Uses ``structlog.contextvars`` so that context bound in middleware
(e.g. correlation IDs) propagates through the entire async call chain.
"""

from __future__ import annotations

import logging
import os
import sys

import structlog


def configure_logging() -> None:
    """Set up structlog + stdlib logging integration."""

    env = os.getenv("NOVA_ENV", "development").lower()
    is_dev = env != "production"
    log_level_name = os.getenv("NOVA_LOG_LEVEL", "INFO" if not is_dev else "DEBUG")
    log_level = getattr(logging, log_level_name.upper(), logging.INFO)

    # Shared processors applied to every log entry
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if is_dev:
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(
            colors=sys.stderr.isatty(),
        )
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            # Prepare the event dict for stdlib's ProcessorFormatter
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # stdlib formatter driven by structlog processors
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Silence noisy third-party loggers regardless of environment
    for name in (
        "httpx",
        "httpcore",
        "langsmith",
        "chromadb",
        "urllib3",
        "watchfiles",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)
