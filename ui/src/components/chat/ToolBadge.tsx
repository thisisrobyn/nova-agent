import { Wrench } from 'lucide-react';

interface ToolBadgeProps {
  name: string;
  result?: string;
}

const TOOL_COLORS: Record<string, string> = {
  calculator: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  get_current_datetime: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  convert_timezone: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  list_directory: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  read_csv_file: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  read_excel_file: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  read_text_file: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
};

const DEFAULT_COLOR = 'bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300';

export function ToolBadge({ name }: ToolBadgeProps) {
  const colorClass = TOOL_COLORS[name] ?? DEFAULT_COLOR;
  const displayName = name.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <Wrench className="h-3 w-3" />
      {displayName}
    </span>
  );
}
