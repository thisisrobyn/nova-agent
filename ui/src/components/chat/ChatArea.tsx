import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, RotateCcw, LogIn, DatabaseZap } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { WelcomeScreen } from './WelcomeScreen';
import { NovaSparkle } from '@/components/ui/NovaSparkle';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ToolBadge } from './ToolBadge';
import { AgentFlow, MESSAGE_COLUMN_CLASS, type TaskStateInfo } from './AgentFlowLive';
import { GuestBanner } from '@/components/auth/GuestBanner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n';
import { isSupported, readFile, type FileReadResult } from '@/lib/fileUtils';
import type { AgentPlanTask, ToolInfo } from '@/lib/types';

/** Rotating placeholder text for the plain (non-orchestrated) waiting state —
 * there is no per-step diagram to look at there, so the copy itself has to
 * communicate that something is still happening. */
const THINKING_KEYS = ['chat.thinking1', 'chat.thinking2', 'chat.thinking3', 'chat.thinking4'];

function useCyclingText(phrases: string[], active: boolean, intervalMs = 2800): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % phrases.length), intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs]);

  return phrases[index];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: { name: string; result: string }[];
  token_usage: Record<string, unknown> | null;
  elapsed_seconds?: number;
  plan?: AgentPlanTask[];
  taskStates?: Record<string, TaskStateInfo>;
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory?: boolean;
  historyUnavailable?: boolean;
  error: string | null;
  streamingContent: string;
  streamingTools: ToolInfo[];
  statusMessage: string | null;
  plan?: AgentPlanTask[];
  taskStates?: Record<string, TaskStateInfo>;
  onSend: (message: string, files?: FileReadResult[]) => void;
  onStop?: () => void;
  onRetry: () => void;
  onEditMessage: (id: string, newContent: string) => void;
  isGuest?: boolean;
  guestMessageCount?: number;
  guestMaxMessages?: number;
  guestLimitReached?: boolean;
  onLogin?: () => void;
}

export function ChatArea({
  messages,
  isLoading,
  isLoadingHistory = false,
  historyUnavailable = false,
  error,
  streamingContent,
  streamingTools,
  plan = [],
  taskStates = {},
  onSend,
  onStop,
  onRetry,
  onEditMessage,
  isGuest = false,
  guestMessageCount = 0,
  guestMaxMessages = 5,
  guestLimitReached = false,
  onLogin,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileReadResult[]>([]);
  const dragCounter = useRef(0);
  const { toast } = useToast();
  const { t } = useI18n();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Show banner after first guest message
  const showGuestBanner = isGuest && guestMessageCount > 0 && (!bannerDismissed || guestLimitReached);

  // The backend's own status text ("Processing", "Loading model...") is an
  // internal signal, not copy — this always drives the bubble's text itself,
  // so a slow model reads as "still working" rather than stuck on a raw
  // backend string forever. While orchestrating, the flow diagram above
  // already shows per-agent progress, so this line only needs to cover the
  // synthesis step after every agent has settled.
  const orchestrating = plan.length > 0;
  const allTasksSettled = orchestrating && plan.every((t) => {
    const s = taskStates[t.id]?.state;
    return s === 'completed' || s === 'failed';
  });
  const cyclingThinkingText = useCyclingText(
    THINKING_KEYS.map((key) => t(key)),
    isLoading && !orchestrating && !streamingContent,
  );
  const fallbackWaitingText = orchestrating
    ? allTasksSettled
      ? t('chat.combining')
      : null
    : cyclingThinkingText;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingContent]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files.length) return;

    const newFiles: FileReadResult[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files)) {
      if (!isSupported(file.name)) {
        rejected.push(file.name);
        continue;
      }
      try {
        const result = await readFile(file);
        newFiles.push(result);
      } catch {
        rejected.push(file.name);
      }
    }

    if (rejected.length > 0) {
      toast(
        rejected.length === 1
          ? t('chat.unsupportedFile', { name: rejected[0] })
          : t('chat.unsupportedFiles', { n: rejected.length }),
        'warning',
      );
    }

    if (newFiles.length) {
      setDroppedFiles(newFiles);
    }
  }, [toast, t]);

  const handleDroppedFilesConsumed = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-950/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-primary-500 bg-surface-900/80"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Upload className="h-8 w-8 text-primary-500" />
            </motion.div>
            <div className="text-center">
              <p className="text-sm font-semibold text-primary-400 text-glow">
                {t('chat.dropFiles')}
              </p>
              <p className="text-xs text-surface-500">
                {t('chat.dropSub')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoadingHistory && !isLoading ? (
        /* Loading history animation — skipped while an answer is streaming,
           so returning to a working chat shows the answer, not a spinner. */
        <div className="flex h-full flex-col items-center justify-center">
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <NovaSparkle className="h-8 w-8 text-primary-500" thinking />
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary-500"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      ) : historyUnavailable && isEmpty && !isLoading ? (
        /* Session data unavailable */
        <div className="flex h-full flex-col items-center justify-center px-4 pb-6">
          <motion.div
            className="flex flex-col items-center gap-4 rounded-xl border border-surface-700/30 bg-surface-900/50 px-8 py-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <DatabaseZap className="h-8 w-8 text-surface-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-surface-300">
                {t('chat.sessionUnavailable')}
              </p>
              <p className="mt-1.5 max-w-xs text-xs text-surface-500">
                {t('chat.sessionUnavailableDesc')}
              </p>
            </div>
          </motion.div>
          <div className="mt-8 w-full max-w-3xl">
            <ChatInput
              onSend={onSend}
              isLoading={isLoading}
              onStop={onStop}
              externalFiles={droppedFiles}
              onExternalFilesConsumed={handleDroppedFilesConsumed}
              disabled={guestLimitReached}
            />
          </div>
        </div>
      ) : isEmpty && !isLoading ? (
        /* Welcome layout: title + input centered */
        <div className="flex h-full flex-col items-center justify-center px-4 pb-6">
          <div className="mb-8 -mt-16">
            <WelcomeScreen />
          </div>

          {/* Guest login prompt */}
          {isGuest && (
            <motion.button
              onClick={onLogin}
              className="mb-6 flex cursor-pointer items-center gap-2 rounded-lg border border-primary-900/50 bg-primary-950/30 px-5 py-2.5 text-xs font-semibold text-primary-400 transition-all hover:border-primary-700/50 hover:bg-primary-950/50 hover:glow-green"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <LogIn className="h-3.5 w-3.5" />
              Register or Login to unlock all features
            </motion.button>
          )}

          <div className="w-full max-w-3xl">
            <ChatInput
              onSend={onSend}
              isLoading={isLoading}
              onStop={onStop}
              externalFiles={droppedFiles}
              onExternalFilesConsumed={handleDroppedFilesConsumed}
              disabled={guestLimitReached}
            />
          </div>
        </div>
      ) : (
        /* Chat layout: messages scrollable + input at bottom */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
            {/* Wider than the message measure on purpose: bubbles cap
                themselves at `MESSAGE_COLUMN_CLASS`, and the extra room is
                what the agent flow diagram expands into. */}
            <div className="mx-auto max-w-5xl space-y-4">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, idx) => (
                  // One malformed message (e.g. non-string content that slipped
                  // past validation) must show as a broken bubble, not take the
                  // whole conversation down — there is no recovering a render
                  // crash without a boundary, and the default is to unmount
                  // everything.
                  <ErrorBoundary key={msg.id} label="chat-message">
                    <ChatMessage
                      id={msg.id}
                      role={msg.role}
                      content={msg.content}
                      tools_used={msg.tools_used}
                      token_usage={msg.token_usage}
                      elapsed_seconds={msg.elapsed_seconds}
                      isNew={idx >= messages.length - 2}
                      onEdit={msg.role === 'user' && !isLoading ? onEditMessage : undefined}
                      plan={msg.plan}
                      taskStates={msg.taskStates}
                    />
                  </ErrorBoundary>
                ))}
              </AnimatePresence>

              {isLoading && (
                <div className="flex flex-col gap-2">
                  {/* The live diagram sits outside the reply bubble and uses
                      the full column width — inside a message-width box a plan
                      with several agents gets clipped. */}
                  {orchestrating && <AgentFlow plan={plan} taskStates={taskStates} />}

                  {(streamingContent || streamingTools.length > 0 || fallbackWaitingText) && (
                    <div className={`flex gap-3 ${MESSAGE_COLUMN_CLASS}`}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-500">
                        <NovaSparkle className="h-5 w-5" thinking />
                      </div>
                      <div className="min-w-0 max-w-[75%] space-y-2 rounded-xl border border-surface-700/50 bg-surface-900 px-4 py-3">
                        {streamingTools.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pb-1">
                            {streamingTools.map((tool, i) => (
                              <ToolBadge key={`${tool.name}-${i}`} name={tool.name} result={tool.result} />
                            ))}
                          </div>
                        )}

                        {streamingContent ? (
                          <div className="text-surface-200">
                            <MarkdownRenderer content={streamingContent} />
                            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary-500/70" />
                          </div>
                        ) : fallbackWaitingText ? (
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={fallbackWaitingText}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-2"
                            >
                              <motion.span
                                className="h-1.5 w-1.5 rounded-full bg-primary-500"
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <span className="text-xs text-surface-400">{fallbackWaitingText}</span>
                            </motion.div>
                          </AnimatePresence>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && !isLoading && (
                <motion.div
                  className="mx-auto flex max-w-md items-center gap-3 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="flex-1 text-xs text-red-400">{error}</span>
                  <button
                    onClick={onRetry}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('chat.retry')}
                  </button>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            {/* Guest banner notification */}
            {showGuestBanner && onLogin && (
              <GuestBanner
                messageCount={guestMessageCount}
                maxMessages={guestMaxMessages}
                visible={showGuestBanner}
                onLogin={onLogin}
                onDismiss={() => setBannerDismissed(true)}
              />
            )}

            {/* Blocked state for guests who hit the limit */}
            {guestLimitReached ? (
              <motion.div
                className="flex flex-col items-center gap-3 rounded-xl border border-primary-900/50 bg-surface-900/80 px-6 py-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="text-sm font-semibold text-surface-300">
                  You&apos;ve reached the guest limit
                </p>
                <p className="text-xs text-surface-500">
                  Create a free account to continue chatting with NOVA
                </p>
                <button
                  onClick={onLogin}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-bold text-surface-950 transition-all hover:bg-primary-500 hover:glow-green"
                >
                  <LogIn className="h-4 w-4" />
                  Register or Login
                </button>
              </motion.div>
            ) : (
              <ChatInput
                onSend={onSend}
                isLoading={isLoading}
                onStop={onStop}
                externalFiles={droppedFiles}
                onExternalFilesConsumed={handleDroppedFilesConsumed}
                disabled={guestLimitReached}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
