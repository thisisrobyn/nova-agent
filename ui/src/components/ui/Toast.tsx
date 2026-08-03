import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';

/* ── Types ──────────────────────────────────────────────── */

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

/* ── Context ────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/* ── Icons per variant ──────────────────────────────────── */

const variantIcon: Record<ToastVariant, typeof Info> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const variantStyle: Record<ToastVariant, string> = {
  success:
    'bg-green-50 text-green-800 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-800',
  error:
    'bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800',
  warning:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
  info:
    'bg-primary-50 text-primary-800 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800',
};

/* ── Provider ───────────────────────────────────────────── */

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container – top center */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = variantIcon[t.variant];
            return (
              <motion.div
                key={t.id}
                className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ${variantStyle[t.variant]}`}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="ml-1 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
