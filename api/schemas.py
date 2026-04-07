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


class SettingsResponse(BaseModel):
    """Current LLM configuration."""

    openai_api_key_masked: str = ""
    has_api_key: bool = False
    model_name: str = "gpt-4.1-mini"
    temperature: float = 0.7
    available_models: List[str] = Field(default_factory=list)
    openai_api_base: str = ""


class SettingsUpdate(BaseModel):
    """Partial update for LLM settings."""

    openai_api_key: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    openai_api_base: Optional[str] = None


# ── API Key schemas ──────────────────────────────────────────

class CreateApiKeyRequest(BaseModel):
    """Request to create a new API key."""

    key_name: str = Field(default="Default", max_length=64, description="Friendly name for the key")


class ApiKeyResponse(BaseModel):
    """Full API key (returned only on creation)."""

    api_key: str
    key_name: str
    created_at: int


class ApiKeyListItem(BaseModel):
    """Masked API key for listing."""

    api_key_masked: str
    api_key_id: str
    key_name: str
    created_at: int
    is_active: bool


class ApiKeyListResponse(BaseModel):
    """List of user's API keys."""

    keys: List[ApiKeyListItem] = Field(default_factory=list)
