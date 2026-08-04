import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { LanguageProvider } from '@/lib/i18n'
import { initScrollbars } from '@/lib/scrollbars'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

initScrollbars();

// Auto-detect basename when served under /projects/nova-agent on the portfolio
const path = window.location.pathname;
const PREFIX = '/projects/nova-agent';
const basename = path.startsWith(PREFIX) ? PREFIX : '/';

const rootCrashFallback = (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface-950 px-6 text-center">
    <h1 className="text-lg font-semibold text-surface-200">Something went wrong</h1>
    <p className="max-w-sm text-sm text-surface-500">
      NOVA hit an unexpected error. Reloading usually fixes it — your chats are saved on the server.
    </p>
    <button
      onClick={() => window.location.reload()}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-surface-950 hover:bg-primary-500"
    >
      Reload
    </button>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="root" fallback={rootCrashFallback}>
      <BrowserRouter basename={basename}>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
