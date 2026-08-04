import { motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Launcher tab for the resource dock, flush against the bottom edge.
 *
 * Positioned against the chat column rather than the viewport, so opening the
 * dock slides it out of the way instead of covering it. Hidden below `lg`,
 * where it would land on top of the composer.
 */
export function SystemMonitorButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.15 }}
      title={t('sys.open')}
      aria-label={t('sys.open')}
      className="absolute bottom-0 left-6 z-30 hidden h-6 w-14 cursor-pointer items-center justify-center rounded-t-lg border border-b-0 border-surface-700/60 bg-surface-900/90 text-surface-300 shadow-lg backdrop-blur-sm transition-all hover:border-primary-800/60 hover:bg-surface-800 hover:text-primary-400 lg:flex"
    >
      <ChevronUp className="h-4 w-4" />
    </motion.button>
  );
}
