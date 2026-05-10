import { Wrench, Globe, Code, BookOpen, Calculator, Clock, FolderOpen, FileText, Hash } from 'lucide-react';
import type { ElementType } from 'react';

interface ToolBadgeProps {
  name: string;
  result?: string;
}

interface ToolStyle {
  color: string;
  icon: ElementType;
}

const TOOL_STYLES: Record<string, ToolStyle> = {
  // New capability tools
  web_search:               { color: 'bg-sky-950/50 text-sky-400 ring-1 ring-sky-800/30', icon: Globe },
  execute_python:           { color: 'bg-emerald-950/50 text-emerald-400 ring-1 ring-emerald-800/30', icon: Code },
  rag_search:               { color: 'bg-violet-950/50 text-violet-400 ring-1 ring-violet-800/30', icon: BookOpen },
  // Original tools
  calculator:               { color: 'bg-amber-950/50 text-amber-400 ring-1 ring-amber-800/30', icon: Calculator },
  get_current_datetime:     { color: 'bg-primary-950/40 text-primary-400', icon: Clock },
  convert_timezone:         { color: 'bg-primary-950/40 text-primary-400', icon: Clock },
  list_directory:           { color: 'bg-primary-950/40 text-primary-400', icon: FolderOpen },
  read_csv:                 { color: 'bg-primary-950/40 text-primary-400', icon: FileText },
  read_excel:               { color: 'bg-primary-950/40 text-primary-400', icon: FileText },
  read_text_file:           { color: 'bg-primary-950/40 text-primary-400', icon: FileText },
  count_conversation_tokens:{ color: 'bg-primary-950/40 text-primary-400', icon: Hash },
};

const DEFAULT_STYLE: ToolStyle = { color: 'bg-surface-800 text-surface-400', icon: Wrench };

export function ToolBadge({ name }: ToolBadgeProps) {
  const style = TOOL_STYLES[name] ?? DEFAULT_STYLE;
  const Icon = style.icon;
  const displayName = name.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium ${style.color}`}
    >
      <Icon className="h-3 w-3" />
      {displayName}
    </span>
  );
}
