import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sidebar, type ChatHistoryEntry, type ChatFolder } from '@/components/layout/Sidebar';
import { FolderModal } from '@/components/layout/FolderModal';
import { ChatArea } from '@/components/chat/ChatArea';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ProfileSettings } from '@/components/auth/ProfileSettings';
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { SchedulerPanel } from '@/components/scheduler/SchedulerPanel';
import { ToastProvider } from '@/components/ui/Toast';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { generateSessionId } from '@/lib/utils';
import { generateTitle, clearHistory, listSessions } from '@/lib/api';

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

/* ── ChatPage ─────────────────────────────────────────────── */

export function ChatPage() {
  const [activeSessionId, setActiveSessionId] = useState(() => generateSessionId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [folderModal, setFolderModal] = useState<{ open: boolean; editing: ChatFolder | null }>({
    open: false,
    editing: null,
  });

  const { user, authState, isAuthenticated, isGuest, login, register, confirm, logout, updateName, updatePicture, changePassword, deleteAccount } = useAuth();

  // In dev mode, skip auth entirely — always show full UI
  const effectiveIsAuthenticated = !import.meta.env.PROD || isAuthenticated;
  const effectiveIsGuest = import.meta.env.PROD ? isGuest : false;

  // Namespace for persisting chat history / folders in localStorage.
  // In dev mode there is no Cognito user, so fall back to a stable local key
  // — otherwise the sidebar history would never load or persist.
  const effectiveUserId = user?.sub ?? (import.meta.env.PROD ? null : 'local-dev');

  const sessionJustChanged = useRef(false);
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

  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;

  useEffect(() => {
    const existsInHistory = chatHistoryRef.current.some((e) => e.id === activeSessionId);
    if (!existsInHistory) return;

    loadHistory().then((result) => {
      if (result === 'empty') {
        setChatHistory((prev) => prev.filter((e) => e.id !== activeSessionId));
      }
    });
  }, [loadHistory, activeSessionId]);

  useEffect(() => {
    if (!effectiveIsAuthenticated || !effectiveUserId) return;

    const savedHistory = loadPersistedHistory(effectiveUserId);
    const savedFolders = loadPersistedFolders(effectiveUserId);
    if (savedFolders.length > 0) setFolders(savedFolders);

    // The backend (data/sessions/*.json) is the source of truth for which
    // chats exist; localStorage only enriches titles (AI-generated) and folders.
    // Merge both so past chats show up even on a fresh browser.
    listSessions()
      .then((sessions) => {
        const localById = new Map(savedHistory.map((e) => [e.id, e]));
        const merged: ChatHistoryEntry[] = sessions.map((s) => {
          const local = localById.get(s.session_id);
          return {
            id: s.session_id,
            title: local?.title ?? s.title,
            messageCount: s.message_count,
            createdAt: local?.createdAt ?? Math.round(s.created_at * 1000),
            folderId: local?.folderId,
          };
        });
        // Keep any local-only entries the backend doesn't know about yet.
        const diskIds = new Set(sessions.map((s) => s.session_id));
        const localOnly = savedHistory.filter((e) => !diskIds.has(e.id));
        // Chats that already exist keep their title forever — mark them as
        // already-titled so opening them never regenerates a new title.
        for (const s of sessions) titleGeneratedFor.current.add(s.session_id);
        for (const e of savedHistory) titleGeneratedFor.current.add(e.id);
        setChatHistory([...merged, ...localOnly]);
      })
      .catch(() => {
        // Backend unreachable — fall back to local history only.
        for (const e of savedHistory) titleGeneratedFor.current.add(e.id);
        if (savedHistory.length > 0) setChatHistory(savedHistory);
      });
  }, [effectiveIsAuthenticated, effectiveUserId]);

  useEffect(() => {
    if (effectiveIsAuthenticated && effectiveUserId && chatHistory.length > 0) {
      persistHistory(effectiveUserId, chatHistory);
    }
  }, [chatHistory, effectiveIsAuthenticated, effectiveUserId]);

  useEffect(() => {
    if (effectiveIsAuthenticated && effectiveUserId) {
      persistFolders(effectiveUserId, folders);
    }
  }, [folders, effectiveIsAuthenticated, effectiveUserId]);

  useEffect(() => {
    sessionJustChanged.current = true;
  }, [activeSessionId]);

  useEffect(() => {
    if (!effectiveIsAuthenticated || messages.length === 0) return;

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
  }, [messages, activeSessionId, effectiveIsAuthenticated]);

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
      setFolders((prev) =>
        prev.map((f) => (f.id === folderModal.editing!.id ? { ...f, ...data } : f)),
      );
    } else {
      setFolders((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
    }
  }, [folderModal.editing]);

  const handleDeleteFolder = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
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
  const openIntelligence = useCallback(() => setShowIntelligence(true), []);
  const openAppSettings = useCallback(() => setShowAppSettings(true), []);
  const openScheduler = useCallback(() => setShowScheduler(true), []);

  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const guestLimitReached = effectiveIsGuest && userMessageCount >= GUEST_MAX_MESSAGES;

  if (import.meta.env.PROD && authState === 'loading') {
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
            isGuest={effectiveIsGuest}
            guestMessageCount={userMessageCount}
            guestMaxMessages={GUEST_MAX_MESSAGES}
            guestLimitReached={guestLimitReached}
            onLogin={openAuth}
          />
        </main>
        {effectiveIsAuthenticated && (
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
            onOpenIntelligence={openIntelligence}
            onOpenScheduler={openScheduler}
            onOpenAppSettings={openAppSettings}
          />
        )}

        <FolderModal
          open={folderModal.open}
          onClose={() => setFolderModal({ open: false, editing: null })}
          onSave={handleSaveFolder}
          initial={folderModal.editing}
        />

        <IntelligencePanel
          open={showIntelligence}
          onClose={() => setShowIntelligence(false)}
        />

        <SettingsPanel
          open={showAppSettings}
          onClose={() => setShowAppSettings(false)}
        />

        <SchedulerPanel
          open={showScheduler}
          onClose={() => setShowScheduler(false)}
        />

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
