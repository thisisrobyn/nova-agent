import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, RotateCcw } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { WelcomeScreen } from './WelcomeScreen';
import { NovaSparkle } from '@/components/ui/NovaSparkle';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ToolBadge } from './ToolBadge';
import { useToast } from '@/components/ui/Toast';
import type { ToolInfo } from '@/lib/types';

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: { name: string; result: string }[];
  token_usage: Record<string, unknown> | null;
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  streamingContent: string;
  streamingTools: ToolInfo[];
  onSend: (message: string, files?: AttachedFile[]) => void;
  onRetry: () => void;
  onEditMessage: (id: string, newContent: string) => void;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'py', 'js', 'ts', 'tsx', 'jsx',
  'html', 'css', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'log', 'sh', 'bash', 'sql', 'env', 'gitignore', 'dockerfile',
]);

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

export function ChatArea({
  messages,
  isLoading,
  error,
  streamingContent,
  streamingTools,
  onSend,
  onRetry,
  onEditMessage,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<AttachedFile[]>([]);
  const dragCounter = useRef(0);
  const { toast } = useToast();

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

    const newFiles: AttachedFile[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files)) {
      if (!isTextFile(file.name)) {
        rejected.push(file.name);
        continue;
      }
      try {
        const content = await file.text();
        newFiles.push({ name: file.name, content, size: file.size });
      } catch {
        // skip unreadable files
      }
    }

    if (rejected.length > 0) {
      toast(
        rejected.length === 1
          ? `Unsupported file type: ${rejected[0]}`
          : `${rejected.length} files with unsupported type`,
        'warning',
      );
    }

    if (newFiles.length) {
      setDroppedFiles(newFiles);
    }
  }, [toast]);

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
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primary-50/90 backdrop-blur-sm dark:bg-surface-900/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-dashed border-primary-400 bg-white/80 dark:border-primary-500 dark:bg-surface-800/80"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Upload className="h-8 w-8 text-primary-500 dark:text-primary-400" />
            </motion.div>
            <div className="text-center">
              <p className="text-lg font-semibold text-primary-700 dark:text-primary-300">
                Drop files here
              </p>
              <p className="text-sm text-primary-500 dark:text-primary-400">
                Attach files to the conversation
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isEmpty && !isLoading ? (
        /* Welcome layout: content + input centered higher */
        <div className="flex h-full flex-col items-center justify-center px-4 pb-6">
          <div className="mb-8 -mt-16">
            <WelcomeScreen onSuggestion={(text) => onSend(text)} />
          </div>
          <div className="w-full max-w-3xl">
            <ChatInput
              onSend={onSend}
              isLoading={isLoading}
              externalFiles={droppedFiles}
              onExternalFilesConsumed={handleDroppedFilesConsumed}
            />
          </div>
        </div>
      ) : (
        /* Chat layout: messages scrollable + input at bottom */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
            <div className="mx-auto max-w-3xl space-y-4">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={msg.id}
                    id={msg.id}
                    role={msg.role}
                    content={msg.content}
                    tools_used={msg.tools_used}
                    token_usage={msg.token_usage}
                    isNew={idx >= messages.length - 2}
                    onEdit={msg.role === 'user' && !isLoading ? onEditMessage : undefined}
                  />
                ))}
              </AnimatePresence>

              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-500 dark:text-primary-400">
                    <NovaSparkle className="h-5 w-5" thinking />
                  </div>
                  <div className="max-w-[75%] rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-surface-200 dark:bg-surface-800 dark:ring-surface-700">
                    {/* Tool badges */}
                    {streamingTools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        {streamingTools.map((tool, i) => (
                          <ToolBadge key={`${tool.name}-${i}`} name={tool.name} result={tool.result} />
                        ))}
                      </div>
                    )}

                    {streamingContent ? (
                      <div className="text-surface-800 dark:text-surface-200">
                        <MarkdownRenderer content={streamingContent} />
                        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary-500/70" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-surface-400 dark:bg-surface-500"
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
                    )}
                  </div>
                </div>
              )}

              {error && !isLoading && (
                <motion.div
                  className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="flex-1 text-sm text-red-700 dark:text-red-400">{error}</span>
                  <button
                    onClick={onRetry}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-800/40 dark:text-red-300 dark:hover:bg-red-800/60"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <ChatInput
              onSend={onSend}
              isLoading={isLoading}
              externalFiles={droppedFiles}
              onExternalFilesConsumed={handleDroppedFilesConsumed}
            />
          </div>
        </>
      )}
    </div>
  );
}
