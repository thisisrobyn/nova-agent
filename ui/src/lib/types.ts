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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tools_used: ToolInfo[];
  token_usage: TokenUsage | null;
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

export interface StreamTokenEvent {
  type: 'token';
  content: string;
}

export interface StreamToolStartEvent {
  type: 'tool_start';
  name: string;
}

export interface StreamToolEndEvent {
  type: 'tool_end';
  name: string;
  result: string;
}

export interface StreamDoneEvent {
  type: 'done';
  response: string;
  tools_used: ToolInfo[];
  token_usage: TokenUsage | null;
  total_tokens: number;
  iteration_count: number;
  elapsed_seconds: number;
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
  | StreamTokenEvent
  | StreamToolStartEvent
  | StreamToolEndEvent
  | StreamDoneEvent
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
