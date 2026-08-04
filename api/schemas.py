"""Pydantic request/response schemas for the NOVA REST API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Incoming chat message from the client."""

    message: str = Field(..., min_length=1, description="User message text")
    session_id: str = Field(default="default", description="Session identifier")


class ToolInfo(BaseModel):
    """Metadata about a tool invocation."""

    name: str
    result: str


class A2ATaskState(BaseModel):
    """A plan task merged with its execution outcome, for history rehydration.

    ``state`` stays "pending" for a task that never got to run — useful when a
    turn was cancelled mid-plan.
    """

    id: str
    skill: str
    goal: str
    depends_on: List[str] = Field(default_factory=list)
    agent: Optional[str] = None
    state: Literal["pending", "working", "completed", "failed", "canceled", "skipped"] = "pending"
    artifact: Optional[str] = None
    error: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    #: Tools the agent called, so a reloaded run still shows its activity.
    tools: List[ToolInfo] = Field(default_factory=list)
    #: What this agent's share of the turn cost.
    token_usage: Optional[Dict[str, Any]] = None
    #: Why an execution budget cut the task short, when one did.
    budget_note: Optional[str] = None


class ChatMessage(BaseModel):
    """A single message in the conversation history."""

    role: str  # "user" | "assistant" | "tool"
    content: str
    tools_used: List[ToolInfo] = Field(default_factory=list)
    token_usage: Optional[Dict[str, Any]] = None
    #: Wall-clock seconds the assistant took to produce this message.
    elapsed_seconds: Optional[float] = None
    #: The orchestrator plan that produced this reply, if it was orchestrated.
    plan: List[A2ATaskState] = Field(default_factory=list)
    #: Identifier of the orchestrated turn behind this reply, for correlating
    #: it with the logs and events that run emitted.
    run_id: Optional[str] = None


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
    #: Whether a background generation is still running for this session.
    #: Lets a client that reloaded mid-turn — its SSE connection is gone,
    #: but the server-side task keeps running — poll until it settles.
    is_generating: bool = False


class A2APlanTask(BaseModel):
    """One task in an orchestrator plan."""

    id: str
    skill: str
    goal: str
    depends_on: List[str] = Field(default_factory=list)
    agent: Optional[str] = None
    #: Set on a task the planner emitted to repair an earlier failure.
    repairs: Optional[str] = None


class A2APlanEvent(BaseModel):
    """Planner result emitted during a streaming run."""

    type: Literal["plan"] = "plan"
    tasks: List[A2APlanTask] = Field(default_factory=list)


class A2ATaskStartEvent(BaseModel):
    """Signal that an agent started work on a task."""

    type: Literal["task_start"] = "task_start"
    id: str
    agent: str
    skill: str
    goal: str


class A2ATaskEndEvent(BaseModel):
    """Signal that an agent finished a task."""

    type: Literal["task_end"] = "task_end"
    id: str
    agent: str
    state: Literal["completed", "failed", "canceled", "skipped"]
    artifact: Optional[str] = None
    error: Optional[str] = None
    elapsed_seconds: Optional[float] = None
    token_usage: Optional[Dict[str, Any]] = None
    #: Why an execution budget stopped this agent, when one did.
    note: Optional[str] = None


class A2ATaskRetryEvent(BaseModel):
    """Signal that a transient failure is being attempted again."""

    type: Literal["task_retry"] = "task_retry"
    id: str
    agent: str
    attempt: int
    of: int
    error: Optional[str] = None


class A2AReplanEvent(BaseModel):
    """Signal that the planner replaced failed tasks with a different approach."""

    type: Literal["replan"] = "replan"
    round: int
    tasks: List[A2APlanTask] = Field(default_factory=list)


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
    api_key: Optional[str] = Field(
        None, description="If omitted, the already-stored key for this provider is used."
    )


class ProviderModel(BaseModel):
    """A cloud-provider chat model."""

    id: str
    display_name: str = ""


class ProviderTestResponse(BaseModel):
    """Result of an API-key validation."""

    valid: bool = False
    models: List[ProviderModel] = Field(default_factory=list)
    error: Optional[str] = None


# ── Host resource metrics ────────────────────────────────────

class CpuMetrics(BaseModel):
    """CPU load on the machine running the API."""

    percent: float = 0.0
    per_core: List[float] = Field(default_factory=list)
    cores_logical: Optional[int] = None
    cores_physical: Optional[int] = None
    frequency_mhz: Optional[float] = None
    #: Only Linux-like hosts expose this; Windows reports nothing readable.
    temperature_celsius: Optional[float] = None


class MemoryMetrics(BaseModel):
    """Physical RAM usage on the API host."""

    total_bytes: int = 0
    used_bytes: int = 0
    available_bytes: int = 0
    percent: float = 0.0


class SwapMetrics(BaseModel):
    """Swap usage, omitted entirely on hosts without swap."""

    total_bytes: int = 0
    used_bytes: int = 0
    percent: float = 0.0


class GpuMetrics(BaseModel):
    """A single GPU as reported by the vendor tooling.

    Every counter is optional: ``nvidia-smi`` returns ``[N/A]`` for fields a
    given card or driver does not expose (power draw on laptop GPUs, for one).
    """

    index: int
    name: str
    utilization_percent: Optional[float] = None
    memory_used_bytes: Optional[int] = None
    memory_total_bytes: Optional[int] = None
    memory_percent: Optional[float] = None
    temperature_celsius: Optional[float] = None
    power_watts: Optional[float] = None


class ProcessMetrics(BaseModel):
    """NOVA's own footprint inside the host totals."""

    pid: int
    memory_bytes: int = 0
    #: Already divided by the logical core count, so it shares the 0–100 axis.
    cpu_percent: float = 0.0
    threads: int = 0


class DiskMetrics(BaseModel):
    """A mounted volume the host could run out of space on."""

    device: str = ""
    mountpoint: str = ""
    fstype: str = ""
    total_bytes: int = 0
    used_bytes: int = 0
    free_bytes: int = 0
    percent: float = 0.0
    #: True for the volume holding the local model weights — the one whose
    #: filling up actually stops NOVA from working.
    holds_models: bool = False


class DiskIoMetrics(BaseModel):
    """Host-wide disk throughput, derived from the gap between two polls."""

    read_bytes_per_sec: float = 0.0
    write_bytes_per_sec: float = 0.0


class NetworkMetrics(BaseModel):
    """Host-wide network throughput, derived from the gap between two polls."""

    sent_bytes_per_sec: float = 0.0
    received_bytes_per_sec: float = 0.0


class SystemMetricsResponse(BaseModel):
    """A point-in-time snapshot of the API host's resources."""

    #: Epoch seconds — the x value the UI plots this sample at.
    timestamp: float
    #: False when the counters could not be read at all; ``error`` says why.
    available: bool = False
    error: Optional[str] = None
    platform: str = ""
    hostname: str = ""
    uptime_seconds: Optional[float] = None
    cpu: Optional[CpuMetrics] = None
    memory: Optional[MemoryMetrics] = None
    swap: Optional[SwapMetrics] = None
    gpus: List[GpuMetrics] = Field(default_factory=list)
    #: Which tool produced ``gpus`` ("nvidia-smi"), or None when no GPU was found.
    gpu_backend: Optional[str] = None
    disks: List[DiskMetrics] = Field(default_factory=list)
    #: None until a second poll gives the rates something to diff against.
    disk_io: Optional[DiskIoMetrics] = None
    network: Optional[NetworkMetrics] = None
    #: Resolved location of the model weights, if one was found.
    models_path: Optional[str] = None
    process: Optional[ProcessMetrics] = None


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


# ── External service connections (OAuth) ────────────────

class ConnectionStatus(BaseModel):
    """Connection state for a single external service provider."""

    provider: str
    label: str
    description: str = ""
    #: True when the server has OAuth app credentials for this provider.
    configured: bool = False
    #: Where those credentials came from: "database", "environment" or None.
    credentials_source: Optional[str] = None
    #: True when the current user has an active connection.
    connected: bool = False
    account_email: Optional[str] = None
    account_name: Optional[str] = None
    #: Scopes actually granted by the connected account.
    scopes: List[str] = Field(default_factory=list)
    #: Scopes NOVA asks for when connecting.
    required_scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[float] = None
    #: Redirect URI to register in the provider's developer console.
    redirect_uri: str
    #: Developer console where the app is registered.
    console_url: str = ""
    #: True when NOVA can register the app automatically (GitHub only).
    supports_auto_setup: bool = False


class ConnectionListResponse(BaseModel):
    """Connection state for every supported provider."""

    connections: List[ConnectionStatus] = Field(default_factory=list)
    #: Whether the caller may register OAuth applications (operator action).
    is_admin: bool = False


class AuthorizeUrlResponse(BaseModel):
    """Authorization URL the UI should open in a popup."""

    provider: str
    authorize_url: str
    state: str


class ProviderCredentialsUpdate(BaseModel):
    """OAuth application credentials entered from the setup wizard."""

    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    #: Microsoft only — Azure tenant to authenticate against.
    tenant_id: Optional[str] = None


class GitHubManifestResponse(BaseModel):
    """Everything the UI needs to submit a GitHub App manifest form."""

    #: GitHub page the form must POST to.
    registration_url: str
    #: JSON-encoded manifest, submitted as the ``manifest`` form field.
    manifest: str
    state: str
