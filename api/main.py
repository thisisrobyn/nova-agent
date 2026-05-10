"""NOVA FastAPI application.

Run with::

    uvicorn api.main:create_app --factory --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.logging_config import configure_logging
from api.middleware import CorrelationIdMiddleware
from api.routes import router

load_dotenv()

# Configure structured logging before any log statements
configure_logging()

logger = structlog.stdlib.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup / shutdown of long-lived resources."""

    # ── Initialize memory database ────────────────────────────────
    try:
        from memory import init_memory

        await init_memory()
    except Exception as exc:
        logger.error("failed to initialize memory database", error=str(exc))

    # ── Load MCP tools ────────────────────────────────────────────
    try:
        from nova_mcp.client import load_mcp_tools
        from agent.graph import set_mcp_tools

        tools = await load_mcp_tools()
        if tools:
            set_mcp_tools(tools)
            logger.info(
                "MCP tools registered in agent graph",
                tools=[t.name for t in tools],
            )
    except Exception as exc:
        logger.warning("MCP tools not loaded", error=str(exc))

    logger.info("NOVA API started")
    yield
    logger.info("NOVA API shutting down")


def create_app() -> FastAPI:
    """Application factory for ``uvicorn api.main:create_app --factory``."""

    application = FastAPI(
        title="NOVA Agent API",
        description="REST API for the NOVA conversational AI agent",
        version="0.3.0",
        lifespan=lifespan,
    )

    # ── Middleware (order matters: outermost first) ────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(CorrelationIdMiddleware)

    # ── Routes ────────────────────────────────────────────────────
    application.include_router(router)

    @application.get("/health")
    async def health() -> dict:
        """Health check endpoint."""
        return {"status": "ok", "service": "nova-agent"}

    return application


# Backwards-compatible module-level app for ``uvicorn api.main:app``
app = create_app()
