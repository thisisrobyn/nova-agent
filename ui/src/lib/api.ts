import type { AuthorizeUrlResponse, ChatResponse, ConnectionListResponse, GitHubManifestResponse, DocumentDeleteResponse, DocumentInfo, DocumentListResponse, EpisodeListResponse, FactListResponse, HistoryResponse, MemoryClearResponse, OllamaCatalogModel, OllamaModel, OllamaStatus, ProviderTestResult, PullProgress, ScheduledTask, ScheduledTaskListResponse, SessionSummary, SettingsData, StreamEvent, TaskExecutionListResponse, ToolInfo } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Authorization header for endpoints whose data belongs to one user.
 *
 * Connections hold live access to somebody's mailbox and files, so the
 * backend has to know who is asking — without this every user would share a
 * single set of tokens. Returns an empty object when signed out, which the
 * backend treats as the local single-user identity.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { getIdToken } = await import('./auth');
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<ChatResponse>;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/chat/history`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json()) as { sessions: SessionSummary[] };
  return data.sessions;
}

export async function getHistory(
  sessionId: string
): Promise<HistoryResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat/history/${sessionId}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<HistoryResponse>;
}

/**
 * Cancel the in-flight generation for a session.
 *
 * Aborting the fetch only closes our end of the stream — the backend task is
 * detached on purpose, so it has to be cancelled explicitly.
 */
export async function stopGeneration(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/chat/stop/${sessionId}`, {
      method: 'POST',
    });
    return res.ok;
  } catch {
    return false;
  }
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
      cancelled?: boolean;
    }) => void;
    onError: (message: string) => void;
    onStatus?: (message: string) => void;
    onCancelled?: () => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
    method: 'POST',
    // The JWT tells the backend whose connected accounts the agent acts on.
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
          case 'cancelled':
            callbacks.onCancelled?.();
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
  data: {
    provider?: string;
    model_name?: string;
    temperature?: number;
    ollama_base_url?: string;
    openai_api_key?: string;
    anthropic_api_key?: string;
  },
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

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/status`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<OllamaStatus>;
}

export async function startOllama(): Promise<{ started: boolean; already_running: boolean; error: string | null }> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getOllamaCatalog(): Promise<OllamaCatalogModel[]> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/catalog`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = (await res.json()) as { models: OllamaCatalogModel[] };
  return data.models;
}

export async function testProvider(provider: string, apiKey?: string): Promise<ProviderTestResult> {
  const res = await fetch(`${API_BASE}/api/v1/providers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<ProviderTestResult>;
}

/** Download an Ollama model, invoking onProgress for each SSE event. */
export async function pullOllamaModel(
  model: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

  const reader = res.body.getReader();
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
        onProgress(JSON.parse(line.slice(6)) as PullProgress);
      } catch {
        /* skip malformed SSE */
      }
    }
  }
}

/* ── Memory ───────────────────────────────────────────────── */

export async function getMemoryFacts(): Promise<FactListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/memory/facts`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<FactListResponse>;
}

export async function clearMemoryFacts(): Promise<MemoryClearResponse> {
  const res = await fetch(`${API_BASE}/api/v1/memory/facts`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<MemoryClearResponse>;
}

export async function getMemoryEpisodes(
  limit = 50,
  offset = 0,
): Promise<EpisodeListResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/memory/episodes?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<EpisodeListResponse>;
}

export async function clearMemoryEpisodes(): Promise<MemoryClearResponse> {
  const res = await fetch(`${API_BASE}/api/v1/memory/episodes`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<MemoryClearResponse>;
}

/* ── Documents (RAG) ──────────────────────────────────────── */

export async function uploadDocument(file: File): Promise<DocumentInfo> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/v1/documents/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Upload failed: ${detail}`);
  }
  return res.json() as Promise<DocumentInfo>;
}

export async function getDocuments(status?: string): Promise<DocumentListResponse> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/api/v1/documents${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<DocumentListResponse>;
}

export async function getDocument(id: string): Promise<DocumentInfo> {
  const res = await fetch(`${API_BASE}/api/v1/documents/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<DocumentInfo>;
}

export async function deleteDocument(id: string): Promise<DocumentDeleteResponse> {
  const res = await fetch(`${API_BASE}/api/v1/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<DocumentDeleteResponse>;
}

/* ── Scheduler ────────────────────────────────────────────── */

export async function getScheduledTasks(): Promise<ScheduledTaskListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/scheduler/tasks`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<ScheduledTaskListResponse>;
}

export async function createScheduledTask(data: {
  name: string;
  prompt: string;
  trigger_type: string;
  trigger_args: Record<string, unknown>;
  enabled?: boolean;
}): Promise<ScheduledTask> {
  const res = await fetch(`${API_BASE}/api/v1/scheduler/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to create task: ${detail}`);
  }
  return res.json() as Promise<ScheduledTask>;
}

export async function updateScheduledTask(
  id: string,
  data: Record<string, unknown>,
): Promise<ScheduledTask> {
  const res = await fetch(`${API_BASE}/api/v1/scheduler/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to update task: ${detail}`);
  }
  return res.json() as Promise<ScheduledTask>;
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/scheduler/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function getTaskExecutionLogs(
  taskId: string,
  limit = 20,
  offset = 0,
): Promise<TaskExecutionListResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/scheduler/tasks/${taskId}/logs?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<TaskExecutionListResponse>;
}

/* ── External service connections ─────────────────────────── */

export async function getConnections(): Promise<ConnectionListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/connections`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<ConnectionListResponse>;
}

/**
 * Ask the backend for a provider's authorization URL.
 *
 * `lang` travels with the OAuth state so the callback page the popup lands on
 * is rendered in the same language as the UI.
 */
export async function getAuthorizeUrl(
  provider: string,
  lang = 'en',
): Promise<AuthorizeUrlResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/connections/${provider}/authorize?lang=${lang}`,
    { method: 'POST', headers: await authHeaders() },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json() as Promise<AuthorizeUrlResponse>;
}

export async function disconnectProvider(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/connections/${provider}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

/** Register the OAuth application credentials for a provider. */
export async function saveProviderCredentials(
  provider: string,
  data: { client_id: string; client_secret: string; tenant_id?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/connections/${provider}/credentials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `API error ${res.status}`);
  }
}

export async function clearProviderCredentials(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/connections/${provider}/credentials`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

/** Fetch the GitHub App manifest the setup popup has to submit. */
export async function getGitHubManifest(
  name: string,
  org?: string,
  lang = 'en',
): Promise<GitHubManifestResponse> {
  const params = new URLSearchParams({ name, lang });
  if (org) params.set('org', org);
  const res = await fetch(
    `${API_BASE}/api/v1/connections/github/setup/manifest?${params}`,
    { method: 'POST', headers: await authHeaders() },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json() as Promise<GitHubManifestResponse>;
}
