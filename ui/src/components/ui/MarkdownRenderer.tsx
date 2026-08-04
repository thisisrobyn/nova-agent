import { useState, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/vs2015.min.css';

/* ── Extract plain text from React children tree ──────────── */

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    return extractText(el.props.children);
  }
  return '';
}

/* ── Copy button ──────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-surface-400 transition-colors hover:bg-surface-600 hover:text-surface-200"
      title="Copy"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy
        </>
      )}
    </button>
  );
}

/* ── Inline code ──────────────────────────────────────────── */

function InlineCode({ children }: { children?: ReactNode }) {
  return (
    <code className="rounded-md bg-primary-950/40 px-1.5 py-0.5 text-[0.85em] font-medium text-primary-400">
      {children}
    </code>
  );
}

/* ── Main renderer ────────────────────────────────────────── */

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body min-w-0 break-words text-sm leading-relaxed [overflow-wrap:anywhere] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Fenced code blocks: wrap <pre> with header + copy button
          pre({ children }) {
            const codeEl = children as React.ReactElement<{
              className?: string;
              children?: ReactNode;
            }>;
            const codeClass = codeEl?.props?.className ?? '';
            const match = /language-(\w+)/.exec(codeClass);
            const lang = match?.[1] ?? '';
            const plainText = extractText(codeEl?.props?.children).replace(/\n$/, '');

            return (
              <div className="group/code my-3 overflow-hidden rounded-xl border border-surface-700/50 bg-surface-950">
                <div className="flex items-center justify-between border-b border-surface-700/50 bg-surface-900 px-4 py-1.5">
                  <span className="text-[10px] font-medium text-primary-600">
                    {lang || 'code'}
                  </span>
                  <CopyButton text={plainText} />
                </div>
                <pre className="code-scroll overflow-x-auto p-4 text-sm leading-relaxed !bg-transparent !m-0">
                  {children}
                </pre>
              </div>
            );
          },

          // Inline code (no language class → styled pill)
          code({ className: codeClass, children }) {
            if (/language-/.test(codeClass || '')) {
              return <code className={codeClass}>{children}</code>;
            }
            return <InlineCode>{children}</InlineCode>;
          },

          // Headings
          h1: ({ children }) => (
            <h1 className="mb-3 mt-5 text-xl font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>
          ),

          // Paragraph
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

          // Lists
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // Horizontal rule
          hr: () => (
            <hr className="my-4 border-surface-700/50" />
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-3 border-primary-700 pl-4 italic text-surface-400">
              {children}
            </blockquote>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-400 underline decoration-primary-700 underline-offset-2 hover:text-primary-300 [overflow-wrap:anywhere]"
            >
              {children}
            </a>
          ),

          // Bold & italic
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,

          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-surface-700/50">
              <table className="min-w-full divide-y divide-surface-700/50 text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface-900">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-primary-500">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-surface-300">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
