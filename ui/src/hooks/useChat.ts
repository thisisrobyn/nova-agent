import { useState, useCallback, useRef } from 'react';
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
  const idCounter = useRef(0);
  const streamRef = useRef('');
  const lastUserContentRef = useRef('');

  const nextId = () => `msg-${++idCounter.current}-${Date.now()}`;

  const sendRaw = useCallback(
    async (content: string) => {
      setIsLoading(true);
      setError(null);
      setStreamingContent('');
      setStreamingTools([]);
      streamRef.current = '';
      lastUserContentRef.current = content;

      try {
        await sendMessageStream(sessionId, content, {
          onToken: (token) => {
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
            const assistantMsg: DisplayMessage = {
              id: nextId(),
              role: 'assistant',
              content: streamRef.current,
              tools_used: data.tools_used ?? [],
              token_usage: data.token_usage as TokenUsage | null,
              timestamp: Date.now(),
            };

            setMessages((prev) => [...prev, assistantMsg]);
            setTotalTokens(data.total_tokens);
            setIterationCount(data.iteration_count);
            setStreamingContent('');
            setStreamingTools([]);
          },
          onError: (msg) => {
            setError(msg);
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId],
  );

  const send = useCallback(
    async (content: string, files?: AttachedFile[]) => {
      if ((!content.trim() && (!files || files.length === 0)) || isLoading)
        return;

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
        // Keep messages up to and including the edited one, discard the rest
        const updated = prev.slice(0, idx);
        updated.push({ ...prev[idx], content: newContent });
        return updated;
      });

      // Small delay to let state settle, then resend
      await new Promise((r) => setTimeout(r, 50));
      await sendRaw(newContent);
    },
    [sendRaw, isLoading],
  );

  const loadHistory = useCallback(async () => {
    try {
      const data = await getHistory(sessionId);
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
    } catch {
      // Session may not exist yet
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
    error,
    totalTokens,
    iterationCount,
    streamingContent,
    streamingTools,
    send,
    retry,
    editMessage,
    loadHistory,
    clear,
  } as const;
}
