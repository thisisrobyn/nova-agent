import { motion } from 'framer-motion';
import { Terminal, Search, Code } from 'lucide-react';

interface WelcomeScreenProps {
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Code,
    title: 'code',
    description: 'Generate & execute',
    prompt: 'Write a Python script to find prime numbers up to 1000',
  },
  {
    icon: Search,
    title: 'search',
    description: 'Web queries',
    prompt: 'What are the latest developments in AI?',
  },
  {
    icon: Terminal,
    title: 'analyze',
    description: 'Data & files',
    prompt: 'What can you help me with?',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export function WelcomeScreen({ onSuggestion }: WelcomeScreenProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-8 px-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Logo */}
      <motion.div variants={itemVariants}>
        <motion.img
          src="/nova-logo.png"
          alt="NOVA"
          className="h-24 w-auto select-none"
          draggable={false}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-surface-100">
          {'> '}
          <span className="text-primary-400 text-glow">NOVA</span>
          <span className="animate-pulse text-primary-500">_</span>
        </h1>
        <p className="mt-2 text-xs text-surface-500">
          Neural Orchestration &amp; Virtual Agent
        </p>
      </motion.div>

      {/* Suggestion cards */}
      <motion.div
        variants={itemVariants}
        className="grid w-full max-w-lg grid-cols-3 gap-3"
      >
        {SUGGESTIONS.map((s) => (
          <motion.button
            key={s.title}
            onClick={() => onSuggestion(s.prompt)}
            className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-surface-700/50 bg-surface-900/50 p-4 text-left transition-all hover:border-primary-700/50 hover:bg-surface-900"
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-950/50 text-primary-500">
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-surface-200">
                ./{s.title}
              </div>
              <div className="text-[10px] text-surface-500">
                {s.description}
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Hint */}
      <motion.p
        variants={itemVariants}
        className="text-[10px] text-surface-600"
      >
        type a message or click a suggestion to begin
      </motion.p>
    </motion.div>
  );
}
