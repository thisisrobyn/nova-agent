import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Terminal,
  User,
  LogOut,
  Settings,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  ChevronRight,
  Check,
  X,
  FolderInput,
  Brain,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getFolderIcon } from '@/components/layout/FolderModal';
import { useI18n } from '@/lib/i18n';

/* ── Data model ────────────────────────────────────────────── */

export interface ChatHistoryEntry {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  folderId?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  icon: string;
}

export interface UserProfile {
  name: string;
  email: string;
  picture?: string;
}

/* ── Drag & drop helpers ───────────────────────────────────── */

const DRAG_MIME = 'application/x-nova-chat-id';

function setDragData(e: React.DragEvent, chatId: string) {
  e.dataTransfer.setData(DRAG_MIME, chatId);
  e.dataTransfer.effectAllowed = 'move';
}

function getDragData(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_MIME) || null;
}

function hasDragData(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(DRAG_MIME);
}

/* ── Props ─────────────────────────────────────────────────── */

interface SidebarProps {
  chatHistory: ChatHistoryEntry[];
  folders: ChatFolder[];
  activeSessionId: string;
  user?: UserProfile | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  onCreateFolder: () => void;
  onEditFolder: (folder: ChatFolder) => void;
  onDeleteFolder: (id: string) => void;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenIntelligence?: () => void;
  onOpenScheduler?: () => void;
  onOpenAppSettings?: () => void;
}

/* ── 3-dot menu ────────────────────────────────────────────── */

interface ChatMenuProps {
  folders: ChatFolder[];
  currentFolderId?: string;
  onRename: () => void;
  onDelete: () => void;
  onMoveToFolder: (folderId: string | null) => void;
}

function ChatMenu({ folders, currentFolderId, onRename, onDelete, onMoveToFolder }: ChatMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowFolders(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded p-0.5 text-surface-500 opacity-0 transition-all hover:bg-surface-700 hover:text-surface-300 group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="menu-pop absolute right-0 top-6 z-50 w-44 rounded-lg border border-surface-700/50 bg-surface-900 py-1 shadow-xl">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-surface-300 hover:bg-surface-700/50"
          >
            <Pencil className="h-3 w-3" /> {t('sidebar.rename')}
          </button>

          {folders.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowFolders(!showFolders); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-surface-300 hover:bg-surface-700/50"
              >
                <FolderInput className="h-3 w-3" />
                <span className="flex-1">{t('sidebar.moveToFolder')}</span>
                <ChevronRight className={`h-3 w-3 transition-transform ${showFolders ? 'rotate-90' : ''}`} />
              </button>

              {showFolders && (
                <div className="border-t border-surface-700/30 py-1">
                  {currentFolderId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpen(false); onMoveToFolder(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 pl-6 text-left text-[11px] text-surface-400 hover:bg-surface-700/50"
                    >
                      <X className="h-3 w-3" /> {t('sidebar.removeFromFolder')}
                    </button>
                  )}
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => { e.stopPropagation(); setOpen(false); onMoveToFolder(f.id); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 pl-6 text-left text-[11px] text-surface-300 hover:bg-surface-700/50"
                    >
                      {(() => { const I = getFolderIcon(f.icon); return <I className="h-3 w-3" />; })()}
                      <span className="flex-1 truncate">{f.name}</span>
                      {currentFolderId === f.id && <Check className="h-3 w-3 text-primary-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="my-1 border-t border-surface-700/30" />

          {confirmDelete ? (
            <div className="px-3 py-1.5">
              <p className="mb-1.5 text-[11px] text-surface-300">{t('sidebar.deleteChatQ')}</p>
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setConfirmDelete(false); onDelete(); }}
                  className="flex-1 rounded bg-red-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
                >
                  {t('sidebar.delete')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="flex-1 rounded bg-surface-700/50 px-2 py-1 text-[11px] text-surface-300 hover:bg-surface-700"
                >
                  {t('sidebar.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-950/30"
            >
              <Trash2 className="h-3 w-3" /> {t('sidebar.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Inline rename input ───────────────────────────────────── */

function InlineRename({ value, onConfirm, onCancel }: {
  value: string;
  onConfirm: (v: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
      className="flex-1 rounded bg-surface-800 px-1.5 py-0.5 text-xs text-surface-200 outline-none ring-1 ring-primary-600/50 focus:ring-primary-500"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/* ── Chat card (draggable) ─────────────────────────────────── */

function ChatCard({ entry, isActive, folders, onSelect, onDelete, onRename, onMoveToFolder }: {
  entry: ChatHistoryEntry;
  isActive: boolean;
  folders: ChatFolder[];
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onMoveToFolder: (folderId: string | null) => void;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => setDragData(e, entry.id)}
      className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
        isActive
          ? 'bg-primary-950/50 text-primary-400 ring-1 ring-primary-800/50'
          : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
      }`}
      onClick={onSelect}
    >
      <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
      {renaming ? (
        <InlineRename
          value={entry.title}
          onConfirm={(v) => { onRename(v); setRenaming(false); }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span className="line-clamp-2 flex-1">{entry.title}</span>
      )}
      {!renaming && (
        <ChatMenu
          folders={folders}
          currentFolderId={entry.folderId}
          onRename={() => setRenaming(true)}
          onDelete={onDelete}
          onMoveToFolder={onMoveToFolder}
        />
      )}
    </div>
  );
}

/* ── Folder section (drop target) ──────────────────────────── */

function FolderSection({ folder, chats, activeSessionId, allFolders, onSelectSession, onDeleteChat, onRenameChat, onMoveToFolder, onEditFolder, onDeleteFolder }: {
  folder: ChatFolder;
  chats: ChatHistoryEntry[];
  activeSessionId: string;
  allFolders: ChatFolder[];
  onSelectSession: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  onEditFolder: (folder: ChatFolder) => void;
  onDeleteFolder: (id: string) => void;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!hasDragData(e)) return;
    dragCounter.current++;
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasDragData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const chatId = getDragData(e);
    if (chatId) {
      onMoveToFolder(chatId, folder.id);
      // Auto-expand the folder when a chat is dropped in
      setCollapsed(false);
    }
  };

  const FolderIcon = getFolderIcon(folder.icon);

  return (
    <div
      className={`mb-1 rounded-lg transition-colors ${dragOver ? 'bg-primary-950/40 ring-1 ring-primary-700/50' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-surface-400 hover:bg-surface-800/50">
        <button onClick={() => setCollapsed(!collapsed)} className="flex flex-1 cursor-pointer items-center gap-1.5">
          <ChevronRight className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <FolderIcon className={`h-3.5 w-3.5 ${dragOver ? 'text-primary-400' : 'text-primary-500'}`} />
          <span className="flex-1 truncate">{folder.name}</span>
          <span className="text-[10px] text-surface-600">{chats.length}</span>
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded p-0.5 text-surface-500 opacity-0 hover:bg-surface-700 hover:text-surface-300 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
          {menuOpen && (
            <div className="menu-pop absolute right-0 top-5 z-50 w-36 rounded-lg border border-surface-700/50 bg-surface-900 py-1 shadow-xl">
              <button
                onClick={() => { setMenuOpen(false); onEditFolder(folder); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-surface-300 hover:bg-surface-700/50"
              >
                <Settings className="h-3 w-3" /> {t('sidebar.editFolder')}
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDeleteFolder(folder.id); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-950/30"
              >
                <Trash2 className="h-3 w-3" /> {t('sidebar.deleteFolder')}
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="ml-2 space-y-0.5">
          {chats.map((entry) => (
            <ChatCard
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeSessionId}
              folders={allFolders}
              onSelect={() => onSelectSession(entry.id)}
              onDelete={() => onDeleteChat(entry.id)}
              onRename={(title) => onRenameChat(entry.id, title)}
              onMoveToFolder={(fId) => onMoveToFolder(entry.id, fId)}
            />
          ))}
          {chats.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-surface-600">{t('sidebar.empty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Sidebar ──────────────────────────────────────────── */

export function Sidebar({
  chatHistory,
  folders,
  activeSessionId,
  user,
  onSelectSession,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onMoveToFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onLogout,
  onOpenSettings,
  onOpenIntelligence,
  onOpenScheduler,
  onOpenAppSettings,
}: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const uncategorized = chatHistory.filter((e) => !e.folderId);

  // Drop target state for the uncategorized zone (remove from folder)
  const [uncatDragOver, setUncatDragOver] = useState(false);
  const uncatDragCounter = useRef(0);

  const handleUncatDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!hasDragData(e)) return;
    uncatDragCounter.current++;
    setUncatDragOver(true);
  };
  const handleUncatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    uncatDragCounter.current--;
    if (uncatDragCounter.current === 0) setUncatDragOver(false);
  };
  const handleUncatDragOver = (e: React.DragEvent) => {
    if (!hasDragData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleUncatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    uncatDragCounter.current = 0;
    setUncatDragOver(false);
    const chatId = getDragData(e);
    if (chatId) onMoveToFolder(chatId, null);
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-l border-primary-900/30 bg-surface-900/50">
      {/* Header */}
      <div
        onClick={() => navigate('/')}
        className="flex items-center gap-2 border-b border-primary-900/30 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-800/50"
      >
        <Terminal className="h-4 w-4 text-primary-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary-500 text-glow">
          NOVA
        </span>
        <span className="ml-auto text-[10px] text-surface-500">v{__APP_VERSION__}</span>
      </div>

      {/* New chat + New folder */}
      <div className="flex gap-1.5 px-3 pt-3">
        <Button variant="primary" size="sm" className="flex-1 gap-1.5" onClick={onNewChat}>
          <Plus className="h-3.5 w-3.5" /> {t('sidebar.newSession')}
        </Button>
        <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={onCreateFolder} title={t('sidebar.newFolder')}>
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Intelligence + scheduler */}
      <div className="px-3 pt-1.5">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1.5 text-surface-400" onClick={onOpenIntelligence}>
          <Brain className="h-3.5 w-3.5 text-primary-500" /> {t('sidebar.intelligence')}
        </Button>
        {!import.meta.env.PROD && (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-1.5 text-surface-400" onClick={onOpenScheduler}>
            <Clock className="h-3.5 w-3.5 text-primary-500" /> {t('sidebar.scheduler')}
          </Button>
        )}
      </div>

      {/* Chat history with folders */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        {/* Folders */}
        {folders.map((folder) => {
          const folderChats = chatHistory.filter((e) => e.folderId === folder.id);
          return (
            <FolderSection
              key={folder.id}
              folder={folder}
              chats={folderChats}
              activeSessionId={activeSessionId}
              allFolders={folders}
              onSelectSession={onSelectSession}
              onDeleteChat={onDeleteChat}
              onRenameChat={onRenameChat}
              onMoveToFolder={onMoveToFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
            />
          );
        })}

        {/* Uncategorized chats — also a drop target to remove from folder */}
        <div
          className={`rounded-lg transition-colors ${uncatDragOver ? 'bg-surface-800/60 ring-1 ring-surface-600/50' : ''}`}
          onDragEnter={handleUncatDragEnter}
          onDragLeave={handleUncatDragLeave}
          onDragOver={handleUncatDragOver}
          onDrop={handleUncatDrop}
        >
          {(folders.length > 0 && uncategorized.length > 0) && (
            <h3 className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-widest text-surface-600">
              {t('sidebar.chats')}
            </h3>
          )}
          {folders.length === 0 && (
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
              {t('sidebar.history')}
            </h3>
          )}

          {uncategorized.length === 0 && folders.length === 0 && (
            <p className="px-2 py-4 text-center text-[10px] text-surface-500">
              {t('sidebar.noSessions')}
            </p>
          )}

          {/* Drop hint when dragging over uncategorized area with folders present */}
          {uncatDragOver && folders.length > 0 && uncategorized.length === 0 && (
            <p className="px-2 py-3 text-center text-[10px] text-surface-400">
              {t('sidebar.dropToRemove')}
            </p>
          )}

          <div className="space-y-0.5">
            {uncategorized.map((entry) => (
              <ChatCard
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeSessionId}
                folders={folders}
                onSelect={() => onSelectSession(entry.id)}
                onDelete={() => onDeleteChat(entry.id)}
                onRename={(title) => onRenameChat(entry.id, title)}
                onMoveToFolder={(fId) => onMoveToFolder(entry.id, fId)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* App settings (dev-only, bottom-right) */}
      {!import.meta.env.PROD && (
        <div className="flex justify-end border-t border-primary-900/30 px-3 py-2">
          <button
            onClick={onOpenAppSettings}
            title={t('sidebar.settings')}
            className="cursor-pointer rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* User profile */}
      {user && (
        <div className="border-t border-primary-900/30 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <button
              onClick={onOpenSettings}
              className="flex shrink-0 cursor-pointer items-center justify-center"
              title={t('sidebar.profile')}
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
              title={t('sidebar.profile')}
            >
              <p className="truncate text-xs font-medium text-surface-200">{user.name}</p>
              <p className="truncate text-[10px] text-surface-500">{user.email}</p>
            </button>
            <button
              onClick={onOpenSettings}
              title={t('sidebar.settings')}
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onLogout}
              title={t('sidebar.signOut')}
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
