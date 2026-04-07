import { useEffect, useState, useCallback } from 'react';
import { Sidebar, type ChatHistoryEntry } from '@/components/layout/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { ToastProvider } from '@/components/ui/Toast';
import { useChat } from '@/hooks/useChat';
import { generateSessionId } from '@/lib/utils';

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState(() => generateSessionId());
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);

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

  useEffect(() => {
    if (messages.length === 0) return;

    const firstUserMsg = messages.find((m) => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '…' : '')
      : 'New chat';

    setChatHistory((prev) => {
      const existing = prev.findIndex((e) => e.id === activeSessionId);
      const entry: ChatHistoryEntry = {
        id: activeSessionId,
        title,
        messageCount: messages.length,
        createdAt: existing >= 0 ? prev[existing].createdAt : Date.now(),
      };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = entry;
        return updated;
      }
      return [entry, ...prev];
    });
  }, [messages, activeSessionId]);

  const handleNewChat = useCallback(() => {
    const newId = generateSessionId();
    setActiveSessionId(newId);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const handleClear = useCallback(async () => {
    await clear();
    setChatHistory((prev) => prev.filter((e) => e.id !== activeSessionId));
  }, [clear, activeSessionId]);

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
          />
        </main>
        <Sidebar
          totalTokens={totalTokens}
          iterationCount={iterationCount}
          chatHistory={chatHistory}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onClear={handleClear}
        />
      </div>
    </ToastProvider>
  );
}
