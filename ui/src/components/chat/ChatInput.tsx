import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

interface ChatInputProps {
  onSend: (message: string, files?: AttachedFile[]) => void;
  isLoading: boolean;
  externalFiles?: AttachedFile[];
  onExternalFilesConsumed?: () => void;
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

export function ChatInput({ onSend, isLoading, externalFiles, onExternalFilesConsumed }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus();
  }, [isLoading]);

  // Merge in externally dropped files
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const newFiles = externalFiles.filter((f) => !existingNames.has(f.name));
        return [...prev, ...newFiles];
      });
      onExternalFilesConsumed?.();
    }
  }, [externalFiles, onExternalFilesConsumed]);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleFiles = async (fileList: FileList) => {
    const newFiles: AttachedFile[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(fileList)) {
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

    if (newFiles.length) setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((!value.trim() && files.length === 0) || isLoading) return;
    onSend(value.trim(), files.length > 0 ? files : undefined);
    setValue('');
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasContent = value.trim() || files.length > 0;

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-[1.75rem] border bg-white shadow-lg transition-colors dark:border-surface-700 dark:bg-surface-800"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Attached files */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-2 px-4 pt-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {files.map((f) => (
              <motion.span
                key={f.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
              >
                <FileText className="h-3 w-3" />
                {f.name}
                <button
                  type="button"
                  onClick={() => removeFile(f.name)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-800/40 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* File upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Attach files"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 disabled:opacity-40 dark:hover:bg-surface-700 dark:hover:text-surface-300"
        >
          <Paperclip className="h-[18px] w-[18px]" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message NOVA..."
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-relaxed text-surface-900 placeholder:text-surface-400 focus:outline-none disabled:opacity-50 dark:text-surface-100 dark:placeholder:text-surface-500"
        />

        {/* Send */}
        <Button
          type="submit"
          size="icon"
          disabled={!hasContent || isLoading}
          className="shrink-0 rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.form>
  );
}
