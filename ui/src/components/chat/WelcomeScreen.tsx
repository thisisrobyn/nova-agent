export function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center gap-4 px-4">
      <h1 className="text-2xl font-bold tracking-tight text-surface-100">
        {'> '}
        <span className="text-primary-400 text-glow">NOVA</span>
        <span className="animate-pulse text-primary-500">_</span>
      </h1>
      <p className="text-xs text-surface-500">
        Neural Orchestration &amp; Virtual Agent
      </p>
    </div>
  );
}
