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


class SessionSummary(BaseModel):
    """Lightweight summary of a persisted chat session (for the sidebar list)."""

    session_id: str
    title: str
    message_count: int = 0
    created_at: float = 0.0  # epoch seconds
    updated_at: float = 0.0  # epoch seconds


class SessionListResponse(BaseModel):
    """List of persisted chat sessions, newest first."""

    sessions: List[SessionSummary] = Field(default_factory=list)


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
    """Current LLM configuration (provider-aware)."""

    provider: str = "ollama"
    model_name: str = "gemma3:4b"
    temperature: float = 0.7
    ollama_base_url: str = "http://localhost:11434"
    model_tiers: Dict[str, List[str]] = Field(default_factory=dict)
    openai_key_set: bool = False
    anthropic_key_set: bool = False
    openai_key_masked: str = ""
    anthropic_key_masked: str = ""


class SettingsUpdate(BaseModel):
    """Partial update for LLM settings."""

    provider: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    ollama_base_url: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None


class OllamaStatusResponse(BaseModel):
    """Real-time Ollama reachability."""

    running: bool = False
    base_url: str = "http://localhost:11434"


class OllamaStartResponse(BaseModel):
    """Result of a best-effort Ollama start."""

    started: bool = False
    already_running: bool = False
    error: Optional[str] = None


class OllamaCatalogModel(BaseModel):
    """A downloadable Ollama model with metadata."""

    name: str
    tier: str = "unknown"
    provider: str = "Ollama (local)"
    size_gb: float = 0.0
    downloaded: bool = False


class OllamaCatalogResponse(BaseModel):
    """Catalogue of known Ollama models."""

    models: List[OllamaCatalogModel] = Field(default_factory=list)


class OllamaPullRequest(BaseModel):
    """Request to download an Ollama model."""

    model: str = Field(..., min_length=1)


class ProviderTestRequest(BaseModel):
    """Validate an API key and list available models."""

    provider: str = Field(..., description="openai | anthropic")
    api_key: str = Field(..., min_length=1)


class ProviderModel(BaseModel):
    """A cloud-provider chat model."""

    id: str
    display_name: str = ""


class ProviderTestResponse(BaseModel):
    """Result of an API-key validation."""

    valid: bool = False
    models: List[ProviderModel] = Field(default_factory=list)
    error: Optional[str] = None


# ── Memory schemas ───────────────────────────────────────────

class FactResponse(BaseModel):
    """A single memory fact."""

    id: Optional[int] = None
    key: str
    value: str
    source_session: Optional[str] = None
    confidence: float = 1.0
    updated_at: Optional[str] = None


class FactListResponse(BaseModel):
    """List of stored memory facts."""

    facts: List[FactResponse] = Field(default_factory=list)
    count: int = 0


class EpisodeResponse(BaseModel):
    """A single episodic memory record."""

    id: Optional[int] = None
    session_id: str
    summary: str
    key_topics: List[str] = Field(default_factory=list)
    message_count: int = 0
    created_at: Optional[str] = None


class EpisodeListResponse(BaseModel):
    """List of episodic memory records."""

    episodes: List[EpisodeResponse] = Field(default_factory=list)
    count: int = 0


class MemoryClearResponse(BaseModel):
    """Result of a memory clear operation."""

    deleted_count: int = 0
    message: str = ""


# ── Document schemas ─────────────────────────────────────────

class DocumentResponse(BaseModel):
    """Metadata for an uploaded document."""

    id: str
    name: str
    file_type: str
    size_bytes: int
    chunk_count: int = 0
    status: str = "pending"
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DocumentListResponse(BaseModel):
    """List of documents in the knowledge base."""

    documents: List[DocumentResponse] = Field(default_factory=list)
    count: int = 0


class DocumentDeleteResponse(BaseModel):
    """Result of a document deletion."""

    deleted: bool = False
    message: str = ""


# ── Scheduler schemas ────────────────────────────────────────

class ScheduledTaskCreate(BaseModel):
    """Request to create a new scheduled task."""

    name: str = Field(..., min_length=1, max_length=200, description="Task name")
    prompt: str = Field(..., min_length=1, description="Prompt sent to the NOVA agent")
    trigger_type: str = Field(..., pattern=r"^(cron|interval)$", description="'cron' or 'interval'")
    trigger_args: Dict[str, Any] = Field(..., description="APScheduler trigger kwargs")
    enabled: bool = Field(default=True, description="Whether the task is active")


class ScheduledTaskUpdate(BaseModel):
    """Partial update for a scheduled task."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    prompt: Optional[str] = Field(None, min_length=1)
    trigger_type: Optional[str] = Field(None, pattern=r"^(cron|interval)$")
    trigger_args: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class ScheduledTaskResponse(BaseModel):
    """A scheduled task returned by the API."""

    id: str
    name: str
    prompt: str
    trigger_type: str
    trigger_args: Dict[str, Any]
    enabled: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None


class ScheduledTaskListResponse(BaseModel):
    """List of scheduled tasks."""

    tasks: List[ScheduledTaskResponse] = Field(default_factory=list)
    count: int = 0


class TaskExecutionResponse(BaseModel):
    """A single task execution record."""

    id: str
    task_id: str
    started_at: str
    finished_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    status: str = "running"
    result_summary: Optional[str] = None
    error: Optional[str] = None
    tokens_used: Optional[int] = None


class TaskExecutionListResponse(BaseModel):
    """List of task execution records."""

    executions: List[TaskExecutionResponse] = Field(default_factory=list)
    count: int = 0


# ── GitHub Roadmap ──────────────────────────────────────

class RoadmapLabel(BaseModel):
    """Label on a GitHub issue."""

    name: str
    color: str


class RoadmapIssue(BaseModel):
    """An issue/item in the project roadmap."""

    title: str
    number: Optional[int] = None
    url: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    size: Optional[str] = None
    labels: List[RoadmapLabel] = Field(default_factory=list)


class RoadmapIteration(BaseModel):
    """A project iteration (e.g. Q2, Q3)."""

    id: str
    title: str
    start_date: Optional[str] = None
    duration: Optional[int] = None
    end_date: Optional[str] = None
    items: List[RoadmapIssue] = Field(default_factory=list)


class RoadmapResponse(BaseModel):
    """Full roadmap response with iterations and items."""

    project_title: str
    project_description: Optional[str] = None
    project_url: str
    iterations: List[RoadmapIteration] = Field(default_factory=list)
    backlog: List[RoadmapIssue] = Field(default_factory=list)
