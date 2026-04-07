import {
  MessageSquare,
  Trash2,
  Zap,
  Hash,
  Plus,
  Terminal,
  User,
  LogOut,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatTokens } from '@/lib/utils';

export interface ChatHistoryEntry {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
}

export interface UserProfile {
  name: string;
  email: string;
  picture?: string;
}

interface SidebarProps {
  totalTokens: number;
  iterationCount: number;
  chatHistory: ChatHistoryEntry[];
  activeSessionId: string;
  user?: UserProfile | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onClear: () => void;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}

export function Sidebar({
  totalTokens,
  iterationCount,
  chatHistory,
  activeSessionId,
  user,
  onSelectSession,
  onNewChat,
  onClear,
  onLogout,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-l border-primary-900/30 bg-surface-900/50">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-primary-900/30 px-4 py-3">
        <Terminal className="h-4 w-4 text-primary-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary-500 text-glow">
          NOVA
        </span>
        <span className="ml-auto text-[10px] text-surface-500">v{__APP_VERSION__}</span>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3">
        <Button
          variant="primary"
          size="sm"
          className="w-full gap-1.5"
          onClick={onNewChat}
        >
          <Plus className="h-3.5 w-3.5" /> new_session
        </Button>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          // history
        </h3>
        {chatHistory.length === 0 ? (
          <p className="px-2 py-4 text-center text-[10px] text-surface-500">
            no sessions
          </p>
        ) : (
          <div className="space-y-0.5">
            {chatHistory.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelectSession(entry.id)}
                className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  entry.id === activeSessionId
                    ? 'bg-primary-950/50 text-primary-400 ring-1 ring-primary-800/50'
                    : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
                }`}
              >
                <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2 flex-1">{entry.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="border-t border-primary-900/30 px-4 py-2.5">
        <div className="flex items-center gap-4 text-[10px] text-surface-500">
          <span className="flex items-center gap-1" title="Tokens">
            <Zap className="h-3 w-3 text-primary-600" /> {formatTokens(totalTokens)}
          </span>
          <span className="flex items-center gap-1" title="Iterations">
            <Hash className="h-3 w-3 text-primary-600" /> {iterationCount}
          </span>
        </div>
      </div>

      {/* Clear */}
      <div className="border-t border-primary-900/30 p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-red-500/70 hover:text-red-400"
          onClick={onClear}
        >
          <Trash2 className="h-3.5 w-3.5" /> clear
        </Button>
      </div>

      {/* User profile */}
      {user && (
        <div className="border-t border-primary-900/30 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <button
              onClick={onOpenSettings}
              className="flex shrink-0 cursor-pointer items-center justify-center"
              title="Profile settings"
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-7 w-7 rounded-full ring-1 ring-primary-800/50 transition-all hover:ring-primary-500/50"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-950/50 ring-1 ring-primary-800/50 transition-all hover:ring-primary-500/50">
                  <User className="h-3.5 w-3.5 text-primary-500" />
                </div>
              )}
            </button>
            <button
              onClick={onOpenSettings}
              className="min-w-0 flex-1 cursor-pointer text-left transition-colors hover:opacity-80"
              title="Profile settings"
            >
              <p className="truncate text-xs font-medium text-surface-200">{user.name}</p>
              <p className="truncate text-[10px] text-surface-500">{user.email}</p>
            </button>
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onLogout}
              title="Sign out"
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-surface-500 transition-colors hover:bg-surface-800 hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
