import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, X } from 'lucide-react';

interface GuestBannerProps {
  messageCount: number;
  maxMessages: number;
  visible: boolean;
  onLogin: () => void;
  onDismiss: () => void;
}

export function GuestBanner({ messageCount, maxMessages, visible, onLogin, onDismiss }: GuestBannerProps) {
  const remaining = maxMessages - messageCount;
  const isBlocked = remaining <= 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`mx-auto mb-3 w-full max-w-3xl rounded-xl border px-4 py-3 ${
            isBlocked
              ? 'border-red-900/50 bg-red-950/40'
              : 'border-primary-900/50 bg-primary-950/30'
          }`}
          initial={{ opacity: 0, y: 20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 20, height: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center gap-3">
            <LogIn className={`h-4 w-4 shrink-0 ${isBlocked ? 'text-red-400' : 'text-primary-400'}`} />
            <div className="min-w-0 flex-1">
              {isBlocked ? (
                <p className="text-xs text-red-400">
                  <span className="font-bold">Session limit reached.</span>{' '}
                  Register or sign in to continue using NOVA with unlimited messages, chat history, and more.
                </p>
              ) : (
                <p className="text-xs text-surface-400">
                  <span className="font-semibold text-primary-400">Sign up or log in</span>{' '}
                  to save conversations, access chat history, and unlock all features.{' '}
                  <span className="text-surface-500">
                    {remaining} message{remaining !== 1 ? 's' : ''} remaining as guest.
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={onLogin}
              className="shrink-0 cursor-pointer rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-surface-950 transition-all hover:bg-primary-500 hover:glow-green"
            >
              {isBlocked ? 'Sign up' : 'Login'}
            </button>
            {!isBlocked && (
              <button
                onClick={onDismiss}
                className="shrink-0 cursor-pointer rounded-full p-1 text-surface-600 transition-colors hover:text-surface-400"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
