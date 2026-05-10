import type { ChatResponse, HistoryResponse, OllamaModel, SettingsData, StreamEvent, ToolInfo } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<ChatResponse>;
}

export async function getHistory(
  sessionId: string
): Promise<HistoryResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat/history/${sessionId}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<HistoryResponse>;
}

export async function clearHistory(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/chat/history/${sessionId}`, {
    method: 'DELETE',
  });
}

/* ── Streaming chat ───────────────────────────────────────── */

export async function sendMessageStream(
  sessionId: string,
  message: string,
  callbacks: {
    onToken: (token: string) => void;
    onToolStart: (name: string) => void;
    onToolEnd: (tool: { name: string; result: string }) => void;
    onDone: (data: {
      response: string;
      tools_used: ToolInfo[];
      token_usage: Record<string, unknown> | null;
      total_tokens: number;
      iteration_count: number;
      elapsed_seconds: number;
    }) => void;
    onError: (message: string) => void;
    onStatus?: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text();
    callbacks.onError(`API error ${res.status}: ${detail}`);
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        switch (event.type) {
          case 'token':
            callbacks.onToken(event.content);
            break;
          case 'tool_start':
            callbacks.onToolStart(event.name);
            break;
          case 'tool_end':
            callbacks.onToolEnd({ name: event.name, result: event.result });
            break;
          case 'done':
            callbacks.onDone(event);
            break;
          case 'error':
            callbacks.onError(event.message);
            break;
          case 'status':
            callbacks.onStatus?.(event.message);
            break;
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }
}

/* ── Title generation ─────────────────────────────────────── */

export async function generateTitle(message: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/chat/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return message.slice(0, 50);
    const data = (await res.json()) as { title: string };
    return data.title;
  } catch {
    return message.slice(0, 50) + (message.length > 50 ? '…' : '');
  }
}

/* ── Settings ─────────────────────────────────────────────── */

export async function getSettings(): Promise<SettingsData> {
  const res = await fetch(`${API_BASE}/api/v1/settings`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<SettingsData>;
}

export async function updateSettings(
  data: { model_name?: string; temperature?: number; ollama_base_url?: string },
): Promise<SettingsData> {
  const res = await fetch(`${API_BASE}/api/v1/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<SettingsData>;
}

/* ── Ollama models ────────────────────────────────────────── */

export async function fetchOllamaModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/models`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models;
}
