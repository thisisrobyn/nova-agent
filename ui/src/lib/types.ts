export interface ToolInfo {
  name: string;
  result: string;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

/**
 * Lifecycle of one plan task. Mirrors `nova_a2a.models.TaskState`, minus the
 * states that never reach the UI — `canceled` does, whenever a run is stopped
 * mid-plan, and omitting it left the diagram rendering an undefined style.
 */
export type AgentTaskState =
  | 'pending'
  | 'working'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'skipped';

/** A plan task merged with its execution outcome, as persisted with a message. */
export interface AgentTaskStateSnapshot {
  id: string;
  skill: string;
  goal: string;
  depends_on: string[];
  agent?: string | null;
  state: AgentTaskState;
  artifact?: string | null;
  error?: string | null;
  elapsed_seconds?: number | null;
  /** Tools this agent called — what the activity log replays after a reload. */
  tools?: ToolInfo[];
  /** This agent's share of the turn's token cost. */
  token_usage?: TokenUsage | null;
  /** Why an execution budget cut this agent short, when one did. */
  budget_note?: string | null;
}

/**
 * Live runtime state of one plan task, as the diagram renders it.
 *
 * The single definition on purpose: this shape is written by the SSE handlers,
 * stored per run, snapshotted onto a message and rehydrated from history, and
 * a field added to only three of those four places is a silent data loss.
 */
export interface AgentTaskRuntimeState {
  state: AgentTaskState;
  agent?: string;
  skill?: string;
  goal?: string;
  artifact?: string;
  error?: string;
  elapsed_seconds?: number;
  /** Tools this task's agent has called so far, in order. */
  tools?: { name: string; result?: string }[];
  /** This agent's share of the turn's token cost. */
  token_usage?: TokenUsage;
  /** Set when an execution budget stopped this agent early. */
  budget_note?: string;
  /** Attempt currently running, when this task had to be retried. */
  attempt?: number;
  /** Attempts the retry policy allows in total. */
  attempts_allowed?: number;
  /** Id of the failed task this one was planned to replace. */
  repairs?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tools_used: ToolInfo[];
  token_usage: TokenUsage | null;
  /** Wall-clock seconds the assistant took to produce this message. */
  elapsed_seconds?: number | null;
  /** The orchestrator plan that produced this reply, if it was orchestrated. */
  plan?: AgentTaskStateSnapshot[];
  /** Identifier of the orchestrated turn that produced this reply. */
  run_id?: string | null;
}

export interface ChatResponse {
  response: string;
  tools_used: ToolInfo[];
  token_usage: TokenUsage | null;
  total_tokens: number;
  iteration_count: number;
}

export interface HistoryResponse {
  session_id: string;
  messages: ChatMessage[];
  total_tokens: number;
  iteration_count: number;
  /** Whether a background generation is still running server-side for this session. */
  is_generating?: boolean;
}

export interface SessionSummary {
  session_id: string;
  title: string;
  message_count: number;
  created_at: number; // epoch seconds
  updated_at: number; // epoch seconds
}

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export type Theme = 'light' | 'dark';

/* ── Settings ─────────────────────────────────────────────── */

export type LLMProvider = 'ollama' | 'openai' | 'anthropic';

export interface SettingsData {
  provider: LLMProvider;
  model_name: string;
  temperature: number;
  ollama_base_url: string;
  model_tiers: Record<string, string[]>;
  openai_key_set: boolean;
  anthropic_key_set: boolean;
  openai_key_masked: string;
  anthropic_key_masked: string;
}

/* ── Ollama models ────────────────────────────────────────── */

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  tier: string;
}

export interface OllamaStatus {
  running: boolean;
  base_url: string;
}

export interface OllamaCatalogModel {
  name: string;
  tier: string;
  provider: string;
  size_gb: number;
  downloaded: boolean;
}

export interface ProviderModel {
  id: string;
  display_name: string;
}

export interface ProviderTestResult {
  valid: boolean;
  models: ProviderModel[];
  error: string | null;
}

export interface PullProgress {
  type: 'progress' | 'done' | 'error';
  status?: string;
  total?: number;
  completed?: number;
  message?: string;
}

/* ── Stream events ────────────────────────────────────────── */

export interface AgentPlanTask {
  id: string;
  skill: string;
  goal: string;
  depends_on: string[];
  agent?: string | null;
}

export interface StreamPlanEvent {
  type: 'plan';
  tasks: AgentPlanTask[];
}

export interface StreamTokenEvent {
  type: 'token';
  content: string;
}

export interface StreamTaskStartEvent {
  type: 'task_start';
  id: string;
  agent: string;
  skill: string;
  goal: string;
}

export interface StreamTaskEndEvent {
  type: 'task_end';
  id: string;
  agent: string;
  state: 'completed' | 'failed' | 'canceled' | 'skipped';
  artifact?: string;
  error?: string;
  elapsed_seconds?: number;
  token_usage?: TokenUsage;
  /** Why an execution budget stopped this agent, when one did. */
  note?: string;
}

/** A transient failure being attempted again, before the retry runs. */
export interface StreamTaskRetryEvent {
  type: 'task_retry';
  id: string;
  agent: string;
  attempt: number;
  of: number;
  error?: string;
}

/** The planner replaced failed tasks with a different approach. */
export interface StreamReplanEvent {
  type: 'replan';
  round: number;
  tasks: (AgentPlanTask & { repairs?: string | null })[];
}

export interface StreamToolStartEvent {
  type: 'tool_start';
  name: string;
  task_id?: string;
}

export interface StreamToolEndEvent {
  type: 'tool_end';
  name: string;
  result: string;
  task_id?: string;
}

export interface StreamDoneEvent {
  type: 'done';
  response: string;
  tools_used: ToolInfo[];
  token_usage: TokenUsage | null;
  total_tokens: number;
  iteration_count: number;
  elapsed_seconds: number;
  /** True when the user stopped the generation before it finished. */
  cancelled?: boolean;
}

/** Emitted just before `done` when the user pressed stop. */
export interface StreamCancelledEvent {
  type: 'cancelled';
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export interface StreamStatusEvent {
  type: 'status';
  message: string;
}

export type StreamEvent =
  | StreamPlanEvent
  | StreamTokenEvent
  | StreamTaskStartEvent
  | StreamTaskEndEvent
  | StreamTaskRetryEvent
  | StreamReplanEvent
  | StreamToolStartEvent
  | StreamToolEndEvent
  | StreamDoneEvent
  | StreamCancelledEvent
  | StreamErrorEvent
  | StreamStatusEvent;

/* ── Memory ──────────────────────────────────────────────── */

export interface MemoryFact {
  id: number | null;
  key: string;
  value: string;
  source_session: string | null;
  confidence: number;
  updated_at: string | null;
}

export interface EpisodicMemory {
  id: number | null;
  session_id: string;
  summary: string;
  key_topics: string[];
  message_count: number;
  created_at: string | null;
}

export interface FactListResponse {
  facts: MemoryFact[];
  count: number;
}

export interface EpisodeListResponse {
  episodes: EpisodicMemory[];
  count: number;
}

export interface MemoryClearResponse {
  deleted_count: number;
  message: string;
}

/* ── Documents (RAG) ─────────────────────────────────────── */

export interface DocumentInfo {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  chunk_count: number;
  status: string;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DocumentListResponse {
  documents: DocumentInfo[];
  count: number;
}

export interface DocumentDeleteResponse {
  deleted: boolean;
  message: string;
}

/* ── Scheduler ───────────────────────────────────────────── */

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  trigger_type: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface ScheduledTaskListResponse {
  tasks: ScheduledTask[];
  count: number;
}

export interface TaskExecution {
  id: string;
  task_id: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  status: string;
  result_summary: string | null;
  error: string | null;
  tokens_used: number | null;
}

export interface TaskExecutionListResponse {
  executions: TaskExecution[];
  count: number;
}

/* ── External service connections ────────────────────────── */

export type ConnectionProvider = 'google' | 'microsoft' | 'github';

export interface ConnectionStatus {
  provider: ConnectionProvider;
  label: string;
  description: string;
  /** The server has OAuth app credentials for this provider. */
  configured: boolean;
  /** Where those credentials came from. */
  credentials_source: 'database' | 'environment' | null;
  /** The user has an active connection. */
  connected: boolean;
  account_email: string | null;
  account_name: string | null;
  /** Scopes granted by the connected account. */
  scopes: string[];
  /** Scopes NOVA asks for when connecting. */
  required_scopes: string[];
  expires_at: number | null;
  /** Redirect URI to register in the provider's developer console. */
  redirect_uri: string;
  /** Developer console where the app is registered. */
  console_url: string;
  /** NOVA can register the app automatically (GitHub only). */
  supports_auto_setup: boolean;
}

export interface ConnectionListResponse {
  connections: ConnectionStatus[];
  /** Whether the caller may register OAuth applications (operator action). */
  is_admin: boolean;
}

export interface AuthorizeUrlResponse {
  provider: string;
  authorize_url: string;
  state: string;
}

export interface GitHubManifestResponse {
  /** GitHub page the manifest form must POST to. */
  registration_url: string;
  /** JSON-encoded manifest, submitted as the `manifest` form field. */
  manifest: string;
  state: string;
}

/* ── Host resource metrics ────────────────────────────────── */

export interface CpuMetrics {
  percent: number;
  per_core: number[];
  cores_logical: number | null;
  cores_physical: number | null;
  frequency_mhz: number | null;
  /** Only Linux-like hosts expose this; Windows reports nothing readable. */
  temperature_celsius: number | null;
}

export interface MemoryMetrics {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent: number;
}

export interface SwapMetrics {
  total_bytes: number;
  used_bytes: number;
  percent: number;
}

/** Counters are optional: a driver reports `[N/A]` for what a card lacks. */
export interface GpuMetrics {
  index: number;
  name: string;
  utilization_percent: number | null;
  memory_used_bytes: number | null;
  memory_total_bytes: number | null;
  memory_percent: number | null;
  temperature_celsius: number | null;
  power_watts: number | null;
}

export interface ProcessMetrics {
  pid: number;
  memory_bytes: number;
  /** Already divided by the core count, so it shares the 0–100 axis. */
  cpu_percent: number;
  threads: number;
}

export interface DiskMetrics {
  device: string;
  mountpoint: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent: number;
  /** The volume holding the local model weights — the one that stops NOVA. */
  holds_models: boolean;
}

export interface DiskIoMetrics {
  read_bytes_per_sec: number;
  write_bytes_per_sec: number;
}

export interface NetworkMetrics {
  sent_bytes_per_sec: number;
  received_bytes_per_sec: number;
}

/** One sample of the API host's resources. */
export interface SystemMetrics {
  /** Epoch seconds — the x value this sample is plotted at. */
  timestamp: number;
  available: boolean;
  error: string | null;
  platform: string;
  hostname: string;
  uptime_seconds: number | null;
  cpu: CpuMetrics | null;
  memory: MemoryMetrics | null;
  swap: SwapMetrics | null;
  gpus: GpuMetrics[];
  gpu_backend: string | null;
  disks: DiskMetrics[];
  /** Null until a second poll gives the rates something to diff against. */
  disk_io: DiskIoMetrics | null;
  network: NetworkMetrics | null;
  models_path: string | null;
  process: ProcessMetrics | null;
}
