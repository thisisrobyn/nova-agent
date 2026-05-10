"""FastAPI middleware for request tracing and observability.

``CorrelationIdMiddleware`` generates a UUID per request, binds it to
structlog's contextvars, and adds an ``X-Correlation-ID`` response header
so every log line emitted during a request can be correlated.
"""

from __future__ import annotations

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique correlation ID to every request."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        correlation_id = request.headers.get(
            "X-Correlation-ID", str(uuid.uuid4())
        )

        # Bind to structlog contextvars so all downstream logs include it
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(correlation_id=correlation_id)

        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response
