"""NOVA FastAPI application.

Run with::

    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Silence noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("langsmith").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup / shutdown of long-lived resources (MCP tools)."""
    try:
        from nova_mcp.client import load_mcp_tools
        from agent.graph import set_mcp_tools

        tools = await load_mcp_tools()
        if tools:
            set_mcp_tools(tools)
            logger.info("MCP tools registered in agent graph: %s",
                        [t.name for t in tools])
    except Exception as exc:
        logger.warning("MCP tools not loaded: %s", exc)

    yield


app = FastAPI(
    title="NOVA Agent API",
    description="REST API for the NOVA conversational AI agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "nova-agent"}
