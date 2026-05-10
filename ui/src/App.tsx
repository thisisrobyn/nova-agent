import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sidebar, type ChatHistoryEntry, type ChatFolder } from '@/components/layout/Sidebar';
import { FolderModal } from '@/components/layout/FolderModal';
import { ChatArea } from '@/components/chat/ChatArea';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ProfileSettings } from '@/components/auth/ProfileSettings';
import { ToastProvider } from '@/components/ui/Toast';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { generateSessionId } from '@/lib/utils';
import { generateTitle, clearHistory } from '@/lib/api';

const GUEST_MAX_MESSAGES = 5;
const HISTORY_STORAGE_KEY = 'nova-chat-history';
const FOLDERS_STORAGE_KEY = 'nova-chat-folders';

/* ── Persistence helpers ──────────────────────────────────── */

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

function loadPersistedFolders(userId: string): ChatFolder[] {
  try {
    const raw = localStorage.getItem(`${FOLDERS_STORAGE_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as ChatFolder[]) : [];
  } catch {
    return [];
  }
}

function persistFolders(userId: string, folders: ChatFolder[]) {
  try {
    localStorage.setItem(`${FOLDERS_STORAGE_KEY}:${userId}`, JSON.stringify(folders));
  } catch { /* quota exceeded — ignore */ }
}

/* ── App ──────────────────────────────────────────────────── */

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState(() => generateSessionId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [folderModal, setFolderModal] = useState<{ open: boolean; editing: ChatFolder | null }>({
    open: false,
    editing: null,
  });

  const { user, authState, isAuthenticated, isGuest, login, register, confirm, logout, updateName, updatePicture, changePassword, deleteAccount } = useAuth();

  // Track whether session just changed to avoid stale title bug
  const sessionJustChanged = useRef(false);
  // Track which sessions already got an AI title
  const titleGeneratedFor = useRef<Set<string>>(new Set());

  const {
    messages,
    isLoading,
    isLoadingHistory,
    historyUnavailable,
    error,
    streamingContent,
    streamingTools,
    statusMessage,
    send,
    retry,
    editMessage,
    loadHistory,
  } = useChat(activeSessionId);

  // Ref to access chatHistory without adding it as effect dependency
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;

  useEffect(() => {
    // Only load history for sessions that already exist in the sidebar.
    // New sessions have no backend data yet — showing the welcome screen is correct.
    const existsInHistory = chatHistoryRef.current.some((e) => e.id === activeSessionId);
    if (!existsInHistory) return;

    loadHistory().then((result) => {
      if (result === 'empty') {
        setChatHistory((prev) => prev.filter((e) => e.id !== activeSessionId));
      }
    });
  }, [loadHistory, activeSessionId]);

  // Load persisted data when user authenticates
  useEffect(() => {
    if (isAuthenticated && user) {
      const savedHistory = loadPersistedHistory(user.sub);
      if (savedHistory.length > 0) setChatHistory(savedHistory);
      const savedFolders = loadPersistedFolders(user.sub);
      if (savedFolders.length > 0) setFolders(savedFolders);
    }
  }, [isAuthenticated, user]);

  // Persist history on changes
  useEffect(() => {
    if (isAuthenticated && user && chatHistory.length > 0) {
      persistHistory(user.sub, chatHistory);
    }
  }, [chatHistory, isAuthenticated, user]);

  // Persist folders on changes
  useEffect(() => {
    if (isAuthenticated && user) {
      persistFolders(user.sub, folders);
    }
  }, [folders, isAuthenticated, user]);

  // Mark session as just-changed to skip the tracking effect once
  useEffect(() => {
    sessionJustChanged.current = true;
  }, [activeSessionId]);

  // Track chat in history + AI title generation
  useEffect(() => {
    if (!isAuthenticated || messages.length === 0) return;

    if (sessionJustChanged.current) {
      sessionJustChanged.current = false;
      return;
    }

    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return;

    const tempTitle = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');

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

    if (
      !titleGeneratedFor.current.has(activeSessionId) &&
      messages.filter(m => m.role === 'user').length === 1 &&
      messages.filter(m => m.role === 'assistant').length >= 1
    ) {
      titleGeneratedFor.current.add(activeSessionId);
      const sid = activeSessionId;
      generateTitle(firstUserMsg.content).then((aiTitle) => {
        setChatHistory((prev) =>
          prev.map((e) => (e.id === sid ? { ...e, title: aiTitle } : e)),
        );
      });
    }
  }, [messages, activeSessionId, isAuthenticated]);

  /* ── Session handlers ───────────────────────────────────── */

  const handleNewChat = useCallback(() => {
    setActiveSessionId(generateSessionId());
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const handleDeleteChat = useCallback(async (id: string) => {
    await clearHistory(id);
    setChatHistory((prev) => prev.filter((e) => e.id !== id));
    if (id === activeSessionId) {
      setActiveSessionId(generateSessionId());
    }
  }, [activeSessionId]);

  const handleRenameChat = useCallback((id: string, newTitle: string) => {
    setChatHistory((prev) =>
      prev.map((e) => (e.id === id ? { ...e, title: newTitle } : e)),
    );
  }, []);

  const handleMoveToFolder = useCallback((chatId: string, folderId: string | null) => {
    setChatHistory((prev) =>
      prev.map((e) => (e.id === chatId ? { ...e, folderId: folderId ?? undefined } : e)),
    );
  }, []);

  /* ── Folder handlers ────────────────────────────────────── */

  const handleCreateFolder = useCallback(() => {
    setFolderModal({ open: true, editing: null });
  }, []);

  const handleEditFolder = useCallback((folder: ChatFolder) => {
    setFolderModal({ open: true, editing: folder });
  }, []);

  const handleSaveFolder = useCallback((data: { name: string; icon: string }) => {
    if (folderModal.editing) {
      // Update existing
      setFolders((prev) =>
        prev.map((f) => (f.id === folderModal.editing!.id ? { ...f, ...data } : f)),
      );
    } else {
      // Create new
      setFolders((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
    }
  }, [folderModal.editing]);

  const handleDeleteFolder = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    // Unassign chats from deleted folder
    setChatHistory((prev) =>
      prev.map((e) => (e.folderId === id ? { ...e, folderId: undefined } : e)),
    );
  }, []);

  /* ── Auth handlers ──────────────────────────────────────── */

  const handleLogin = useCallback(async (email: string, password: string) => {
    const u = await login(email, password);
    setShowAuth(false);
    return u;
  }, [login]);

  const handleLogout = useCallback(() => {
    logout();
    setChatHistory([]);
    setFolders([]);
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
            isLoadingHistory={isLoadingHistory}
            historyUnavailable={historyUnavailable}
            error={error}
            streamingContent={streamingContent}
            streamingTools={streamingTools}
            statusMessage={statusMessage}
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
            chatHistory={chatHistory}
            folders={folders}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onMoveToFolder={handleMoveToFolder}
            onCreateFolder={handleCreateFolder}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteFolder}
            user={user ? { name: user.name, email: user.email, picture: user.picture } : undefined}
            onLogout={handleLogout}
            onOpenSettings={openSettings}
          />
        )}

        {/* Folder modal */}
        <FolderModal
          open={folderModal.open}
          onClose={() => setFolderModal({ open: false, editing: null })}
          onSave={handleSaveFolder}
          initial={folderModal.editing}
        />

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
