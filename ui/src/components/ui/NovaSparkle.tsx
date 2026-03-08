import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NovaSparkleProps {
  className?: string;
  thinking?: boolean;
}

function StarSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 1 L13.2 10 L22 12 L13.2 14 L12 23 L10.8 14 L2 12 L10.8 10 Z" />
    </svg>
  );
}

export function NovaSparkle({ className, thinking = false }: NovaSparkleProps) {
  if (thinking) {
    return (
      <motion.div
        className={cn('inline-flex items-center justify-center', className)}
        animate={{
          rotate: [0, 180, 360],
          scale: [1, 0.7, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut' as const,
        }}
      >
        <StarSvg className="h-full w-full" />
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn('inline-flex items-center justify-center', className)}
      animate={{ rotate: [0, 5, -5, 0] }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      }}
    >
      <StarSvg className="h-full w-full" />
    </motion.div>
  );
}
