import type { ChatResponse, HistoryResponse, SettingsData, StreamEvent, ToolInfo } from './types';

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
      tools_used: ToolInfo[];
      token_usage: Record<string, unknown> | null;
      total_tokens: number;
      iteration_count: number;
    }) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
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
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }
}

/* ── Settings ─────────────────────────────────────────────── */

export async function getSettings(): Promise<SettingsData> {
  const res = await fetch(`${API_BASE}/api/v1/settings`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<SettingsData>;
}

export async function updateSettings(
  data: { openai_api_key?: string; model_name?: string; temperature?: number },
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
