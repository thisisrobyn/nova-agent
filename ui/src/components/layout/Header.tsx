import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { Theme } from '@/lib/types';

interface HeaderProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export function Header({ theme, setTheme }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2.5">
        <img src="/favicon.png" alt="NOVA" className="h-8 w-8" />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-surface-900 dark:text-white">
            NOVA
          </span>
          <span className="text-[10px] leading-tight text-surface-400 dark:text-surface-500">
            Neural Orchestration &amp; Virtual Agent
          </span>
        </div>
      </div>
      <ThemeToggle theme={theme} setTheme={setTheme} />
    </header>
  );
}
