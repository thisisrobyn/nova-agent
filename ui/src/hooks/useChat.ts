import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import { getHistory, clearHistory } from '@/lib/api';
import * as chatRuns from '@/lib/chatRuns';
import type { DisplayMessage } from '@/lib/chatRuns';
import type { AgentPlanTask, ChatMessage } from '@/lib/types';

/** Split a persisted `ChatMessage.plan` into the plan skeleton and per-task outcomes. */
function splitPlan(plan: ChatMessage['plan']): Pick<DisplayMessage, 'plan' | 'taskStates'> {
  if (!plan || plan.length === 0) return {};
  const skeleton: AgentPlanTask[] = [];
  const taskStates: NonNullable<DisplayMessage['taskStates']> = {};
  for (const task of plan) {
    skeleton.push({ id: task.id, skill: task.skill, goal: task.goal, depends_on: task.depends_on, agent: task.agent });
    taskStates[task.id] = {
      state: task.state,
      agent: task.agent ?? undefined,
      skill: task.skill,
      goal: task.goal,
      artifact: task.artifact ?? undefined,
      error: task.error ?? undefined,
      elapsed_seconds: task.elapsed_seconds ?? undefined,
      tools: task.tools,
      token_usage: task.token_usage ?? undefined,
      budget_note: task.budget_note ?? undefined,
    };
  }
  return { plan: skeleton, taskStates };
}

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

export type { DisplayMessage };

function buildMessageWithFiles(text: string, files?: AttachedFile[]): string {
  if (!files || files.length === 0) return text;

  const fileParts = files
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join('\n\n');

  const prefix = `[Attached files]\n${fileParts}\n\n`;
  return text ? `${prefix}[Message]\n${text}` : prefix;
}

/**
 * Chat state for one session.
 *
 * The visible conversation is the persisted history plus whatever the live
 * run has produced since (see `lib/chatRuns`). Generations outlive this hook,
 * so switching chats and coming back shows the question still standing and
 * the answer still streaming instead of an empty screen.
 */
export function useChat(sessionId: string) {
  const [historyMessages, setHistoryMessages] = useState<DisplayMessage[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [iterationCount, setIterationCount] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const idCounter = useRef(0);
  const loadHistoryVersionRef = useRef(0);

  const run = useSyncExternalStore(
    useCallback((cb) => chatRuns.subscribe(sessionId, cb), [sessionId]),
    useCallback(() => chatRuns.getRun(sessionId), [sessionId]),
  );

  // Reset the persisted half when the session changes. The run half is keyed
  // by session in the store, so it needs no resetting — that is the point.
  useEffect(() => {
    setHistoryMessages([]);
    setTotalTokens(0);
    setIterationCount(0);
    setHistoryUnavailable(false);
    loadHistoryVersionRef.current++;
  }, [sessionId]);

  const nextId = () => `hist-${++idCounter.current}-${Date.now()}`;

  // A run settling — normal completion, or reconnecting to one that finished
  // server-side while this tab was reloaded — means the backend has a fresh
  // turn this hook hasn't fetched yet. `loadHistory` below de-dupes against
  // `run.pending` via `releaseIfSettledBefore`, so re-running it here is safe
  // even for the ordinary path where `onDone` already appended locally.
  const wasLoadingRef = useRef(run.isLoading);
  useEffect(() => {
    if (wasLoadingRef.current && !run.isLoading) {
      void loadHistory();
    }
    wasLoadingRef.current = run.isLoading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.isLoading]);

  const messages = useMemo(
    () => (run.pending.length > 0 ? [...historyMessages, ...run.pending] : historyMessages),
    [historyMessages, run.pending],
  );

  const send = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      if (!content.trim() && (!files || files.length === 0)) return;

      const displayContent =
        files && files.length > 0
          ? `${content}${content ? '\n' : ''}📎 ${files.map((f) => f.name).join(', ')}`
          : content;

      chatRuns.send(sessionId, buildMessageWithFiles(content, files), displayContent);
    },
    [sessionId],
  );

  const stop = useCallback(() => chatRuns.stop(sessionId), [sessionId]);

  const retry = useCallback(() => chatRuns.retry(sessionId), [sessionId]);

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (run.isLoading || !newContent.trim()) return;

      const pendingIdx = run.pending.findIndex((m) => m.id === messageId);
      if (pendingIdx >= 0) {
        chatRuns.truncatePending(sessionId, pendingIdx + 1, newContent);
      } else {
        const historyIdx = historyMessages.findIndex((m) => m.id === messageId);
        if (historyIdx === -1) return;
        setHistoryMessages((prev) => [
          ...prev.slice(0, historyIdx),
          { ...prev[historyIdx], content: newContent },
        ]);
        chatRuns.resetPending(sessionId);
      }

      await new Promise((r) => setTimeout(r, 50));
      chatRuns.send(sessionId, newContent);
    },
    [sessionId, run.isLoading, run.pending, historyMessages],
  );

  const loadHistory = useCallback(async (): Promise<'loaded' | 'empty' | 'error'> => {
    const version = ++loadHistoryVersionRef.current;
    const requestedAt = Date.now();
    setIsLoadingHistory(true);
    setHistoryUnavailable(false);
    try {
      const data = await getHistory(sessionId);
      // Guard against stale responses from a previous session
      if (loadHistoryVersionRef.current !== version) return 'error';
      const mapped: DisplayMessage[] = data.messages
        .filter((m: ChatMessage) => m.role !== 'tool')
        .map((m: ChatMessage) => ({
          id: nextId(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          tools_used: m.tools_used,
          token_usage: m.token_usage,
          timestamp: Date.now(),
          elapsed_seconds: m.elapsed_seconds ?? undefined,
          ...splitPlan(m.plan),
        }));
      setHistoryMessages(mapped);
      setTotalTokens(data.total_tokens);
      setIterationCount(data.iteration_count);

      // Turns that finished before this request are now part of the history —
      // keeping them locally too would show every one of them twice.
      chatRuns.releaseIfSettledBefore(sessionId, requestedAt);

      const live = chatRuns.getRun(sessionId);
      const visible = mapped.length + live.pending.length;
      if (visible === 0 && !live.isLoading) setHistoryUnavailable(true);
      return visible > 0 || live.isLoading ? 'loaded' : 'empty';
    } catch {
      if (loadHistoryVersionRef.current !== version) return 'error';

      const live = chatRuns.getRun(sessionId);
      const hasLocalRecovery =
        live.pending.length > 0 ||
        live.isLoading ||
        !!live.streamingContent ||
        live.streamingTools.length > 0;

      if (hasLocalRecovery) {
        setHistoryMessages(live.pending);
        setTotalTokens(live.totalTokens || 0);
        setIterationCount(live.iterationCount || 0);
        setHistoryUnavailable(false);
        return 'loaded';
      }

      // Network error or backend unreachable — don't prune sidebar entry
      setHistoryUnavailable(true);
      return 'error';
    } finally {
      if (loadHistoryVersionRef.current === version) {
        setIsLoadingHistory(false);
      }
    }
  }, [sessionId]);

  const clear = useCallback(async () => {
    await clearHistory(sessionId);
    chatRuns.discard(sessionId);
    setHistoryMessages([]);
    setTotalTokens(0);
    setIterationCount(0);
  }, [sessionId]);

  return {
    messages,
    isLoading: run.isLoading,
    isLoadingHistory,
    historyUnavailable,
    error: run.error,
    totalTokens: run.totalTokens || totalTokens,
    iterationCount: run.iterationCount || iterationCount,
    streamingContent: run.streamingContent,
    streamingTools: run.streamingTools,
    statusMessage: run.statusMessage,
    plan: run.plan,
    taskStates: run.taskStates,
    send,
    stop,
    retry,
    editMessage,
    loadHistory,
    clear,
  } as const;
}
