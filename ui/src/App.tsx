import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sidebar, type ChatHistoryEntry } from '@/components/layout/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ProfileSettings } from '@/components/auth/ProfileSettings';
import { ToastProvider } from '@/components/ui/Toast';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { generateSessionId } from '@/lib/utils';
import { generateTitle } from '@/lib/api';

const GUEST_MAX_MESSAGES = 5;
const HISTORY_STORAGE_KEY = 'nova-chat-history';

function loadPersistedHistory(userId: string): ChatHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${HISTORY_STORAGE_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as ChatHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persistHistory(userId: string, history: ChatHistoryEntry[]) {
  try {
    localStorage.setItem(`${HISTORY_STORAGE_KEY}:${userId}`, JSON.stringify(history));
  } catch { /* quota exceeded — ignore */ }
}

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState(() => generateSessionId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { user, authState, isAuthenticated, isGuest, login, register, confirm, logout, updateName, updatePicture, changePassword, deleteAccount } = useAuth();

  // Track whether session just changed to avoid stale title bug
  const sessionJustChanged = useRef(false);
  // Track which sessions already got an AI title
  const titleGeneratedFor = useRef<Set<string>>(new Set());

  const {
    messages,
    isLoading,
    error,
    totalTokens,
    iterationCount,
    streamingContent,
    streamingTools,
    send,
    retry,
    editMessage,
    loadHistory,
    clear,
  } = useChat(activeSessionId);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Load persisted history when user authenticates
  useEffect(() => {
    if (isAuthenticated && user) {
      const saved = loadPersistedHistory(user.sub);
      if (saved.length > 0) setChatHistory(saved);
    }
  }, [isAuthenticated, user]);

  // Persist history on changes (only for authenticated users)
  useEffect(() => {
    if (isAuthenticated && user && chatHistory.length > 0) {
      persistHistory(user.sub, chatHistory);
    }
  }, [chatHistory, isAuthenticated, user]);

  // Mark session as just-changed to skip the tracking effect once
  useEffect(() => {
    sessionJustChanged.current = true;
  }, [activeSessionId]);

  // Track chat in history + AI title generation
  useEffect(() => {
    if (!isAuthenticated || messages.length === 0) return;

    // Skip if session just changed (messages are stale from previous session)
    if (sessionJustChanged.current) {
      sessionJustChanged.current = false;
      return;
    }

    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return;

    // Use truncated message as temporary title
    const tempTitle = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '…' : '');

    setChatHistory((prev) => {
      const existing = prev.findIndex((e) => e.id === activeSessionId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], messageCount: messages.length };
        return updated;
      }
      return [
        { id: activeSessionId, title: tempTitle, messageCount: messages.length, createdAt: Date.now() },
        ...prev,
      ];
    });

    // Generate AI title for new sessions (only once per session)
    if (!titleGeneratedFor.current.has(activeSessionId) && messages.filter(m => m.role === 'user').length === 1) {
      titleGeneratedFor.current.add(activeSessionId);
      const sid = activeSessionId;
      generateTitle(firstUserMsg.content).then((aiTitle) => {
        setChatHistory((prev) =>
          prev.map((e) => (e.id === sid ? { ...e, title: aiTitle } : e)),
        );
      });
    }
  }, [messages, activeSessionId, isAuthenticated]);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(generateSessionId());
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const handleClear = useCallback(async () => {
    await clear();
    setChatHistory((prev) => prev.filter((e) => e.id !== activeSessionId));
  }, [clear, activeSessionId]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const u = await login(email, password);
    setShowAuth(false);
    return u;
  }, [login]);

  const handleLogout = useCallback(() => {
    logout();
    setChatHistory([]);
    setActiveSessionId(generateSessionId());
    setShowSettings(false);
  }, [logout]);

  const openAuth = useCallback(() => setShowAuth(true), []);
  const openSettings = useCallback(() => setShowSettings(true), []);

  // Count user messages for guest limit
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const guestLimitReached = isGuest && userMessageCount >= GUEST_MAX_MESSAGES;

  // Show loading screen while checking auth
  if (authState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-center">
          <h1 className="text-xl font-bold text-primary-400 text-glow">NOVA</h1>
          <div className="mt-3 flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show auth screen
  if (showAuth) {
    return (
      <ToastProvider>
        <AuthScreen
          onLogin={handleLogin}
          onRegister={register}
          onConfirm={confirm}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="relative flex h-screen overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <ChatArea
            messages={messages}
            isLoading={isLoading}
            error={error}
            streamingContent={streamingContent}
            streamingTools={streamingTools}
            onSend={send}
            onRetry={retry}
            onEditMessage={editMessage}
            isGuest={isGuest}
            guestMessageCount={userMessageCount}
            guestMaxMessages={GUEST_MAX_MESSAGES}
            guestLimitReached={guestLimitReached}
            onLogin={openAuth}
          />
        </main>
        {isAuthenticated && (
          <Sidebar
            totalTokens={totalTokens}
            iterationCount={iterationCount}
            chatHistory={chatHistory}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onClear={handleClear}
            user={user ? { name: user.name, email: user.email, picture: user.picture } : undefined}
            onLogout={handleLogout}
            onOpenSettings={openSettings}
          />
        )}

        {/* Profile settings modal */}
        <AnimatePresence>
          {showSettings && user && (
            <ProfileSettings
              user={user}
              onClose={() => setShowSettings(false)}
              onUpdateName={updateName}
              onUpdatePicture={updatePicture}
              onChangePassword={changePassword}
              onDeleteAccount={deleteAccount}
              onLogout={handleLogout}
            />
          )}
        </AnimatePresence>
      </div>
    </ToastProvider>
  );
}
