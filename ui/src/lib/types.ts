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

export type Theme = 'light' | 'dark';

/* ── Settings ─────────────────────────────────────────────── */

export interface SettingsData {
  model_name: string;
  temperature: number;
  ollama_base_url: string;
  model_tiers: Record<string, string[]>;
}

/* ── Ollama models ────────────────────────────────────────── */

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  tier: string;
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
