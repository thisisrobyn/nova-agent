import { Sun, Moon } from 'lucide-react';
import type { Theme } from '@/lib/types';

interface ThemeToggleProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

type DocWithViewTransition = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

export function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
  const isDark = theme === 'dark';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const newTheme: Theme = isDark ? 'light' : 'dark';
    const doc = document as DocWithViewTransition;

    if (!doc.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    const { clientX: x, clientY: y } = e;
    document.documentElement.style.setProperty('--theme-x', `${x}px`);
    document.documentElement.style.setProperty('--theme-y', `${y}px`);

    doc.startViewTransition(() => {
      setTheme(newTheme);
    });
  };

  return (
    <button
      onClick={handleClick}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-surface-500 transition-all duration-150 hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
