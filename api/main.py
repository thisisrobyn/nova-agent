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
from api.routes_connections import router as connections_router

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

    # ── Initialize external service connections ───────────────────
    try:
        from connections import init_connections_db
        from connections.admin import owner_sub
        from connections.store import migrate_local_connections

        await init_connections_db()

        # Connections predating per-user isolation live under a shared "local"
        # id. Hand them to the configured operator, never to whoever signs in
        # first, so a public deployment cannot leak them to a stranger.
        owner = owner_sub()
        if owner:
            moved = await migrate_local_connections(owner)
            if moved:
                logger.info("claimed pre-isolation connections", count=moved)
    except Exception as exc:
        logger.error("failed to initialize connections database", error=str(exc))

    # ── Bind Google / Microsoft / GitHub tools ────────────────────
    try:
        from agent.graph import reload_service_tools

        count = await reload_service_tools()
        logger.info("service tools registered in agent graph", count=count)
    except Exception as exc:
        logger.warning("service tools not loaded", error=str(exc))

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

    # ── Start scheduler ─────────────────────────────────────────
    try:
        from scheduler import get_scheduler

        scheduler = get_scheduler()
        await scheduler.start()
        logger.info("scheduler started")
    except Exception as exc:
        logger.warning("scheduler not started", error=str(exc))

    logger.info("NOVA API started")
    yield

    # ── Shutdown scheduler ────────────────────────────────────────
    try:
        from scheduler import get_scheduler

        get_scheduler().shutdown()
    except Exception:
        pass

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
    application.include_router(connections_router)

    @application.get("/health")
    async def health() -> dict:
        """Health check endpoint with subsystem status."""
        subsystems: dict = {}

        # Scheduler status
        try:
            from scheduler import get_scheduler
            sched = get_scheduler()
            subsystems["scheduler"] = "running" if sched.is_running else "stopped"
        except Exception:
            subsystems["scheduler"] = "unavailable"

        # Memory status
        try:
            from memory import get_memory_manager
            mm = get_memory_manager()
            subsystems["memory"] = "ok" if mm else "unavailable"
        except Exception:
            subsystems["memory"] = "unavailable"

        # Ollama connectivity
        try:
            import httpx
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(f"{ollama_url}/api/tags")
                subsystems["ollama"] = "connected" if resp.status_code == 200 else "error"
        except Exception:
            subsystems["ollama"] = "unreachable"

        overall = "ok" if subsystems.get("ollama") == "connected" else "degraded"

        return {
            "status": overall,
            "service": "nova-agent",
            "version": "0.3.0",
            "subsystems": subsystems,
        }

    return application


# Backwards-compatible module-level app for ``uvicorn api.main:app``
app = create_app()
