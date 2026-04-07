import { Wrench } from 'lucide-react';

interface ToolBadgeProps {
  name: string;
  result?: string;
}

const TOOL_COLORS: Record<string, string> = {
  calculator: 'bg-primary-950/40 text-primary-400',
  get_current_datetime: 'bg-primary-950/40 text-primary-400',
  convert_timezone: 'bg-primary-950/40 text-primary-400',
  list_directory: 'bg-primary-950/40 text-primary-400',
  read_csv_file: 'bg-primary-950/40 text-primary-400',
  read_excel_file: 'bg-primary-950/40 text-primary-400',
  read_text_file: 'bg-primary-950/40 text-primary-400',
};

const DEFAULT_COLOR = 'bg-surface-800 text-surface-400';

export function ToolBadge({ name }: ToolBadgeProps) {
  const colorClass = TOOL_COLORS[name] ?? DEFAULT_COLOR;
  const displayName = name.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
    >
      <Wrench className="h-3 w-3" />
      {displayName}
    </span>
  );
}
