import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { ChatPage } from '@/pages/ChatPage';
import { DocsPage } from '@/pages/DocsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/docs" element={<Navigate to="/docs/setup" replace />} />
      <Route path="/docs/:slug" element={<DocsPage />} />
    </Routes>
  );
}
