import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Check, X } from 'lucide-react';
import { NovaSparkle } from '@/components/ui/NovaSparkle';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { ToolBadge } from './ToolBadge';
import { TokenCounter } from './TokenCounter';
import type { TokenUsage } from '@/lib/types';

interface ChatMessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: { name: string; result: string }[];
  token_usage: TokenUsage | null;
  isNew?: boolean;
  onEdit?: (id: string, newContent: string) => void;
}

export function ChatMessage({
  id,
  role,
  content,
  tools_used,
  token_usage,
  isNew = false,
  onEdit,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === content) {
      setEditing(false);
      setEditValue(content);
      return;
    }
    setEditing(false);
    onEdit?.(id, trimmed);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditValue(content);
  };

  return (
    <motion.div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      initial={isNew ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Avatar – assistant only */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-primary-500 dark:text-primary-400">
          <NovaSparkle className="h-5 w-5" />
        </div>
      )}

      {/* Bubble */}
      <div
        className={`group relative max-w-[75%] space-y-2 rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-white shadow-sm ring-1 ring-surface-200 dark:bg-surface-800 dark:ring-surface-700'
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
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirmEdit();
                }
                if (e.key === 'Escape') handleCancelEdit();
              }}
              className="w-full resize-none rounded-xl bg-white/20 px-2 py-1 text-sm leading-relaxed text-white placeholder:text-white/60 focus:outline-none focus:ring-1 focus:ring-white/40"
              rows={1}
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={handleCancelEdit}
                className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleConfirmEdit}
                className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
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
              className="text-surface-800 dark:text-surface-200"
            />
          )}

        {/* Edit button for user messages */}
        {isUser && !editing && onEdit && (
          <button
            onClick={() => setEditing(true)}
            className="absolute -bottom-2 -left-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-surface-200 text-surface-500 opacity-0 shadow-sm transition-all hover:bg-surface-300 hover:text-surface-700 group-hover:opacity-100 dark:bg-surface-700 dark:text-surface-400 dark:hover:bg-surface-600 dark:hover:text-surface-200"
            title="Edit message"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}

        {/* Token counter for assistant */}
        {!isUser && token_usage && (
          <TokenCounter
            inputTokens={token_usage.input_tokens}
            outputTokens={token_usage.output_tokens}
            totalTokens={token_usage.total_tokens}
          />
        )}
      </div>
    </motion.div>
  );
}
