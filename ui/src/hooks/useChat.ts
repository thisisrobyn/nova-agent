import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMessageStream, getHistory, clearHistory } from '@/lib/api';
import type { ChatMessage, TokenUsage, ToolInfo } from '@/lib/types';

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: { name: string; result: string }[];
  token_usage: TokenUsage | null;
  timestamp: number;
  elapsed_seconds?: number;
}

function buildMessageWithFiles(text: string, files?: AttachedFile[]): string {
  if (!files || files.length === 0) return text;

  const fileParts = files
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join('\n\n');

  const prefix = `[Attached files]\n${fileParts}\n\n`;
  return text ? `${prefix}[Message]\n${text}` : prefix;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [iterationCount, setIterationCount] = useState(0);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolInfo[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const idCounter = useRef(0);
  const streamRef = useRef('');
  const lastUserContentRef = useRef('');
  const modelLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReceivedTokenRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingQueueRef = useRef<string[]>([]);
  const loadHistoryVersionRef = useRef(0);

  // Abort in-flight stream when session changes or on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (modelLoadingTimerRef.current) {
        clearTimeout(modelLoadingTimerRef.current);
        modelLoadingTimerRef.current = null;
      }
    };
  }, [sessionId]);

  // Reset state when session changes
  useEffect(() => {
    setMessages([]);
    setIsLoading(false);
    setTotalTokens(0);
    setIterationCount(0);
    setError(null);
    setStreamingContent('');
    setStreamingTools([]);
    setStatusMessage(null);
    setHistoryUnavailable(false);
    pendingQueueRef.current = [];
    loadHistoryVersionRef.current++;
    if (modelLoadingTimerRef.current) {
      clearTimeout(modelLoadingTimerRef.current);
      modelLoadingTimerRef.current = null;
    }
  }, [sessionId]);

  const nextId = () => `msg-${++idCounter.current}-${Date.now()}`;

  const sendRaw = useCallback(
    async (content: string) => {
      // Abort any in-flight stream before starting a new one
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setStreamingContent('');
      setStreamingTools([]);
      setStatusMessage(null);
      streamRef.current = '';
      lastUserContentRef.current = content;
      hasReceivedTokenRef.current = false;

      // 5-second timer: if no tokens arrive, show model-loading hint
      modelLoadingTimerRef.current = setTimeout(() => {
        if (!hasReceivedTokenRef.current) {
          setStatusMessage('Loading model...');
        }
      }, 5000);

      try {
        await sendMessageStream(sessionId, content, {
          onToken: (token) => {
            hasReceivedTokenRef.current = true;
            if (modelLoadingTimerRef.current) {
              clearTimeout(modelLoadingTimerRef.current);
              modelLoadingTimerRef.current = null;
            }
            setStatusMessage(null);
            streamRef.current += token;
            setStreamingContent(streamRef.current);
          },
          onToolStart: (name) => {
            setStreamingTools((prev) => [...prev, { name, result: '' }]);
            streamRef.current = '';
            setStreamingContent('');
          },
          onToolEnd: (tool) => {
            setStreamingTools((prev) =>
              prev.map((t) =>
                t.name === tool.name && t.result === '' ? tool : t,
              ),
            );
          },
          onDone: (data) => {
            const content = streamRef.current || data.response || '';

            const assistantMsg: DisplayMessage = {
              id: nextId(),
              role: 'assistant',
              content,
              tools_used: data.tools_used ?? [],
              token_usage: data.token_usage as TokenUsage | null,
              timestamp: Date.now(),
              elapsed_seconds: data.elapsed_seconds,
            };

            setMessages((prev) => [...prev, assistantMsg]);
            setTotalTokens(data.total_tokens);
            setIterationCount(data.iteration_count);
            setStreamingContent('');
            setStreamingTools([]);
            setStatusMessage(null);
          },
          onError: (msg) => {
            setError(msg);
            setStatusMessage(null);
          },
          onStatus: (msg) => {
            setStatusMessage(msg);
          },
        }, controller.signal);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (modelLoadingTimerRef.current) {
          clearTimeout(modelLoadingTimerRef.current);
          modelLoadingTimerRef.current = null;
        }
        setStatusMessage(null);

        // Process next queued message if any
        const nextMessage = pendingQueueRef.current.shift();
        if (nextMessage) {
          // Keep isLoading true — immediately process next in queue
          streamRef.current = '';
          sendRaw(nextMessage);
        } else {
          setIsLoading(false);
        }
      }
    },
    [sessionId],
  );

  const send = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      if (!content.trim() && (!files || files.length === 0)) return;

      const displayContent =
        files && files.length > 0
          ? `${content}${content ? '\n' : ''}📎 ${files.map((f) => f.name).join(', ')}`
          : content;

      const userMsg: DisplayMessage = {
        id: nextId(),
        role: 'user',
        content: displayContent,
        tools_used: [],
        token_usage: null,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      const fullMessage = buildMessageWithFiles(content, files);

      if (isLoading) {
        // Queue the message — it will be sent when the current stream finishes
        pendingQueueRef.current.push(fullMessage);
        return;
      }

      await sendRaw(fullMessage);
    },
    [sendRaw, isLoading],
  );

  const retry = useCallback(async () => {
    if (isLoading || !lastUserContentRef.current) return;
    setError(null);
    await sendRaw(lastUserContentRef.current);
  }, [sendRaw, isLoading]);

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (isLoading || !newContent.trim()) return;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        const updated = prev.slice(0, idx);
        updated.push({ ...prev[idx], content: newContent });
        return updated;
      });

      await new Promise((r) => setTimeout(r, 50));
      await sendRaw(newContent);
    },
    [sendRaw, isLoading],
  );

  const loadHistory = useCallback(async (): Promise<'loaded' | 'empty' | 'error'> => {
    const version = ++loadHistoryVersionRef.current;
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
        }));
      setMessages(mapped);
      setTotalTokens(data.total_tokens);
      setIterationCount(data.iteration_count);
      if (mapped.length === 0) setHistoryUnavailable(true);
      return mapped.length > 0 ? 'loaded' : 'empty';
    } catch {
      if (loadHistoryVersionRef.current !== version) return 'error';
      setHistoryUnavailable(true);
      // Network error or backend unreachable — don't prune sidebar entry
      return 'error';
    } finally {
      if (loadHistoryVersionRef.current === version) {
        setIsLoadingHistory(false);
      }
    }
  }, [sessionId]);

  const clear = useCallback(async () => {
    await clearHistory(sessionId);
    setMessages([]);
    setTotalTokens(0);
    setIterationCount(0);
    setError(null);
  }, [sessionId]);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    historyUnavailable,
    error,
    totalTokens,
    iterationCount,
    streamingContent,
    streamingTools,
    statusMessage,
    send,
    retry,
    editMessage,
    loadHistory,
    clear,
  } as const;
}
