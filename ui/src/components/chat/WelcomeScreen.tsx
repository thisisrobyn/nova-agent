import { motion } from 'framer-motion';
import { Calculator, Clock, Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onSuggestion: (text: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Calculator,
    title: 'Calculate',
    description: 'Math expressions & formulas',
    prompt: "What's 2^10 * 3.14159?",
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  {
    icon: Clock,
    title: 'Date & Time',
    description: 'Timezones & scheduling',
    prompt: "What time is it in Tokyo right now?",
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  {
    icon: Sparkles,
    title: 'Ask Anything',
    description: 'General questions & tasks',
    prompt: 'What can you help me with?',
    color: 'text-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
  },
];

const TAGLINES = [
  'Your AI-powered assistant',
  'Code, search, analyze',
  'Ask me anything',
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
        <h1 className="text-3xl font-bold tracking-tight text-surface-900 dark:text-white">
          Welcome to{' '}
          <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
            NOVA
          </span>
        </h1>
        <div className="mt-2 h-6 overflow-hidden">
          <motion.div
            animate={{ y: [0, -24, -48, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.33, 0.66, 1] }}
          >
            {TAGLINES.map((line) => (
              <p
                key={line}
                className="h-6 text-sm text-surface-500 dark:text-surface-400"
              >
                {line}
              </p>
            ))}
          </motion.div>
        </div>
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
            className="group flex cursor-pointer flex-col gap-2 rounded-2xl border border-surface-200 p-4 text-left transition-all hover:border-primary-300 hover:shadow-md dark:border-surface-700 dark:hover:border-primary-700"
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <div className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                {s.title}
              </div>
              <div className="text-xs text-surface-400 dark:text-surface-500">
                {s.description}
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Hint */}
      <motion.p
        variants={itemVariants}
        className="text-xs text-surface-400 dark:text-surface-500"
      >
        Type a message or click a suggestion to get started
      </motion.p>
    </motion.div>
  );
}
