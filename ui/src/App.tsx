import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { ChatPage } from '@/pages/ChatPage';
import { DocsPage } from '@/pages/DocsPage';

const IS_PROD = import.meta.env.PROD;

export default function App() {
  if (IS_PROD) {
    // Production: landing page showcase + docs only
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/docs" element={<Navigate to="/docs/setup" replace />} />
        <Route path="/docs/:slug" element={<DocsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Local dev: full app — chat first, no landing, no auth required
  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/docs" element={<Navigate to="/docs/setup" replace />} />
      <Route path="/docs/:slug" element={<DocsPage />} />
      <Route path="/landing" element={<LandingPage />} />
    </Routes>
  );
}
