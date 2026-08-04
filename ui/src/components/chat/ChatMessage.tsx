import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Check, X, Clock } from 'lucide-react';
import { NovaSparkle } from '@/components/ui/NovaSparkle';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ToolBadge } from './ToolBadge';
import { TokenCounter } from './TokenCounter';
import { AgentFlow, MESSAGE_COLUMN_CLASS, type TaskStateInfo } from './AgentFlowLive';
import type { AgentPlanTask, TokenUsage } from '@/lib/types';

/** Editing a long message grows the textarea up to this many lines; past that
 *  it scrolls instead of pushing the rest of the conversation down the page. */
const MAX_EDIT_LINES = 10;

interface ChatMessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: { name: string; result: string }[];
  token_usage: TokenUsage | null;
  elapsed_seconds?: number;
  isNew?: boolean;
  onEdit?: (id: string, newContent: string) => void;
  plan?: AgentPlanTask[];
  taskStates?: Record<string, TaskStateInfo>;
}

export function ChatMessage({
  id,
  role,
  content,
  tools_used,
  token_usage,
  elapsed_seconds,
  isNew = false,
  onEdit,
  plan,
  taskStates,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Width the bubble had when the edit started, so swapping the text for a
  // textarea does not resize the bubble under the user's cursor.
  const [lockedWidth, setLockedWidth] = useState<number | null>(null);

  /** Grow the textarea to fit its content, but never past MAX_EDIT_LINES. */
  const autoSize = (el: HTMLTextAreaElement) => {
    const styles = getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    // Tailwind's preflight makes every element border-box, so the height we
    // set must cover padding + border on top of the text itself.
    const borders =
      parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    const padding =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const maxHeight = lineHeight * MAX_EDIT_LINES + padding + borders;

    el.style.height = 'auto';
    const needed = el.scrollHeight + borders; // scrollHeight already includes padding
    el.style.height = `${Math.min(needed, maxHeight)}px`;
    el.style.overflowY = needed > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      autoSize(el);
    }
  }, [editing]);

  const handleStartEdit = () => {
    setLockedWidth(bubbleRef.current?.getBoundingClientRect().width ?? null);
    setEditing(true);
  };

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === content) {
      setEditing(false);
      setLockedWidth(null);
      setEditValue(content);
      return;
    }
    setEditing(false);
    setLockedWidth(null);
    onEdit?.(id, trimmed);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setLockedWidth(null);
    setEditValue(content);
  };

  // The orchestrator breakdown is its own block above the reply, not part of
  // the bubble: it is a different kind of content from the answer NOVA wrote,
  // and it needs more width than a message bubble to show a plan with several
  // agents without clipping.
  const showFlow = !isUser && !!plan && plan.length > 0;

  return (
    <motion.div
      className="flex flex-col gap-2"
      initial={isNew ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Orchestrator breakdown for this reply — hover a step for detail */}
      {showFlow && <AgentFlow plan={plan} taskStates={taskStates ?? {}} />}

      <div className={`flex gap-3 ${MESSAGE_COLUMN_CLASS} ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar – assistant only */}
        {!isUser && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-500">
            <NovaSparkle className="h-5 w-5" />
          </div>
        )}

        {/* Bubble */}
        <div
          ref={bubbleRef}
          style={editing && lockedWidth ? { width: lockedWidth } : undefined}
          className={`group relative min-w-0 max-w-[75%] space-y-2 rounded-xl px-4 py-3 ${
            isUser
              ? 'bg-primary-900/40 text-primary-100 ring-1 ring-primary-800/50'
              : 'border border-surface-700/50 bg-surface-900'
          }`}
        >
          {/* Tool badges */}
          {tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {tools_used.map((tool, i) => (
                <ToolBadge key={`${tool.name}-${i}`} name={tool.name} result={tool.result} />
              ))}
            </div>
          )}

          {/* Message text / edit mode */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  autoSize(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleConfirmEdit();
                  }
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className="scrollbar-thin block w-full resize-none overflow-y-hidden break-words rounded-lg bg-surface-950/50 px-2 py-1 text-sm leading-relaxed text-primary-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-700"
                rows={1}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={handleCancelEdit}
                  className="rounded-lg p-1 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-300 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleConfirmEdit}
                  className="rounded-lg p-1 text-primary-500 transition-colors hover:bg-primary-900/30 hover:text-primary-400 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : isUser ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {content}
              </div>
            ) : (
              <MarkdownRenderer
                content={content}
                className="text-surface-200"
              />
            )}

          {/* Edit button for user messages */}
          {isUser && !editing && onEdit && (
            <button
              onClick={handleStartEdit}
              className="absolute -bottom-2 -left-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-surface-800 text-surface-500 opacity-0 transition-all hover:bg-surface-700 hover:text-primary-400 group-hover:opacity-100"
              title="Edit message"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}

          {/* Token counter & response time for assistant */}
          {!isUser && (token_usage || elapsed_seconds) && (
            <div className="flex items-center gap-3">
              {token_usage && (
                <TokenCounter
                  /* The backend reports prompt_/completion_tokens (OpenAI
                     naming); older payloads used input_/output_tokens. */
                  inputTokens={token_usage.input_tokens ?? (token_usage.prompt_tokens as number | undefined)}
                  outputTokens={token_usage.output_tokens ?? (token_usage.completion_tokens as number | undefined)}
                  totalTokens={token_usage.total_tokens}
                />
              )}
              {elapsed_seconds != null && (
                <span className="flex items-center gap-1 text-[10px] text-surface-500">
                  <Clock className="h-2.5 w-2.5" />
                  {elapsed_seconds}s
                </span>
              )}
            </div>
          )}
        </div>
        </div>
    </motion.div>
  );
}
