"""Pydantic request/response schemas for the NOVA REST API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming chat message from the client."""

    message: str = Field(..., min_length=1, description="User message text")
    session_id: str = Field(default="default", description="Session identifier")


class ToolInfo(BaseModel):
    """Metadata about a tool invocation."""

    name: str
    result: str


class ChatMessage(BaseModel):
    """A single message in the conversation history."""

    role: str  # "user" | "assistant" | "tool"
    content: str
    tools_used: List[ToolInfo] = Field(default_factory=list)
    token_usage: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """Response returned after processing a chat message."""

    response: str
    tools_used: List[ToolInfo] = Field(default_factory=list)
    token_usage: Optional[Dict[str, Any]] = None
    total_tokens: int = 0
    iteration_count: int = 0


class HistoryResponse(BaseModel):
    """Full conversation history for a session."""

    session_id: str
    messages: List[ChatMessage] = Field(default_factory=list)
    total_tokens: int = 0
    iteration_count: int = 0


class TitleRequest(BaseModel):
    """Request to generate a chat title from the first message."""

    message: str = Field(..., min_length=1, description="First user message")


class TitleResponse(BaseModel):
    """Generated chat title."""

    title: str


# ── Ollama / Settings schemas ────────────────────────────────

class OllamaModel(BaseModel):
    """A model available in the local Ollama instance."""

    name: str
    size: int = 0
    modified_at: str = ""
    tier: str = "unknown"


class OllamaModelsResponse(BaseModel):
    """List of locally available Ollama models."""

    models: List[OllamaModel] = Field(default_factory=list)


class SettingsResponse(BaseModel):
    """Current LLM configuration (Ollama)."""

    model_name: str = "gemma3:4b"
    temperature: float = 0.7
    ollama_base_url: str = "http://localhost:11434"
    model_tiers: Dict[str, List[str]] = Field(default_factory=dict)


class SettingsUpdate(BaseModel):
    """Partial update for LLM settings."""

    model_name: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    ollama_base_url: Optional[str] = None
