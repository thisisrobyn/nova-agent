import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, ArrowRight, Mail, Lock, User, Loader2 } from 'lucide-react';

type AuthView = 'login' | 'register' | 'confirm';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<unknown>;
  onRegister: (email: string, password: string, name: string) => Promise<void>;
  onConfirm: (email: string, code: string) => Promise<void>;
}

export function AuthScreen({ onLogin, onRegister, onConfirm }: AuthScreenProps) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (view === 'login') {
        await onLogin(email, password);
      } else if (view === 'register') {
        await onRegister(email, password, name);
        setPendingEmail(email);
        setView('confirm');
      } else if (view === 'confirm') {
        await onConfirm(pendingEmail, code);
        // After confirmation, log them in
        await onLogin(pendingEmail, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const switchView = (v: AuthView) => {
    setView(v);
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <motion.div
        className="relative z-10 w-full max-w-md"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary-500" />
            <h1 className="text-3xl font-bold tracking-tight text-surface-100">
              <span className="text-primary-400 text-glow">NOVA</span>
              <span className="animate-pulse text-primary-500">_</span>
            </h1>
          </div>
          <p className="text-xs text-surface-500">Neural Orchestration & Virtual Agent</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-surface-700/50 bg-surface-900/80 p-8 backdrop-blur-sm glow-green">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Title */}
              <h2 className="mb-1 text-lg font-bold text-surface-100">
                {view === 'login' && '$ login'}
                {view === 'register' && '$ register'}
                {view === 'confirm' && '$ verify email'}
              </h2>
              <p className="mb-6 text-xs text-surface-500">
                {view === 'login' && 'Sign in to access your sessions and history'}
                {view === 'register' && 'Create an account to unlock all features'}
                {view === 'confirm' && `Enter the 6-digit code sent to ${pendingEmail}`}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {view === 'confirm' ? (
                  /* Confirmation code input */
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                      verification code
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full rounded-lg border border-surface-700/50 bg-surface-800 px-4 py-3 text-center text-2xl tracking-[0.5em] text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none focus:glow-green"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    {/* Name — register only */}
                    {view === 'register' && (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                          name
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            required
                            className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-3 pl-10 pr-4 text-sm text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none focus:glow-green"
                          />
                        </div>
                      </div>
                    )}

                    {/* Email */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                        email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          autoFocus={view === 'login'}
                          className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-3 pl-10 pr-4 text-sm text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none focus:glow-green"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                        password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={view === 'register' ? 'Min 8 chars, uppercase + number' : '••••••••'}
                          required
                          minLength={8}
                          className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-3 pl-10 pr-4 text-sm text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none focus:glow-green"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Error */}
                {error && (
                  <motion.p
                    className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-bold text-surface-950 transition-all hover:bg-primary-500 hover:glow-green disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {view === 'login' && 'Sign in'}
                      {view === 'register' && 'Create account'}
                      {view === 'confirm' && 'Verify'}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Switch view */}
              {view !== 'confirm' && (
                <div className="mt-6 border-t border-surface-700/50 pt-4 text-center">
                  {view === 'login' ? (
                    <p className="text-xs text-surface-500">
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchView('register')}
                        className="cursor-pointer font-semibold text-primary-400 transition-colors hover:text-primary-300"
                      >
                        Register here
                      </button>
                    </p>
                  ) : (
                    <p className="text-xs text-surface-500">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchView('login')}
                        className="cursor-pointer font-semibold text-primary-400 transition-colors hover:text-primary-300"
                      >
                        Sign in
                      </button>
                    </p>
                  )}
                </div>
              )}

              {view === 'confirm' && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="cursor-pointer text-xs text-surface-500 transition-colors hover:text-surface-300"
                  >
                    ← Back to login
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Skip */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-surface-600">
            Continue without account — limited to 5 messages per session
          </p>
        </div>
      </motion.div>
    </div>
  );
}
