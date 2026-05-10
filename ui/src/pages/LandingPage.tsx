import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-screen flex-col items-center justify-center bg-surface-950 px-4">
      {/* Logo top-left */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <img src="/ai-bot.png" alt="NOVA" className="h-8 w-8" />
        <span className="text-sm font-bold text-primary-400 text-glow tracking-wider">NOVA</span>
      </div>

      <img
        src="/ai-bot.png"
        alt="NOVA Bot"
        className="mb-8 h-32 w-32 drop-shadow-[0_0_24px_rgba(34,197,94,0.35)]"
      />

      <h1 className="mb-2 text-4xl font-bold text-primary-400 text-glow tracking-wider">
        NOVA
      </h1>
      <p className="mb-10 text-surface-300 text-sm">
        Neural Orchestration &amp; Virtual Agent
      </p>

      <button
        onClick={() => navigate('/chat')}
        className="group flex items-center gap-2 rounded-lg border border-primary-700/50 bg-primary-900/30 px-6 py-3 text-primary-300 transition-all hover:bg-primary-800/40 hover:text-primary-200 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)] cursor-pointer"
      >
        Hablar con NOVA
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}
