import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
  Plug,
  PanelRightClose,
  PanelRightOpen,
  ArrowUpRight,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GoogleIcon, MicrosoftIcon, GitHubIcon } from '@/components/ui/BrandIcons';
import { getFolderIcon } from '@/components/layout/FolderModal';
import { useI18n } from '@/lib/i18n';
import { useConnections } from '@/hooks/useConnections';
import { useRunningSessions } from '@/hooks/useRunningSessions';
import type { ConnectionProvider } from '@/lib/types';

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
  onOpenConnections?: () => void;
  onOpenAppSettings?: () => void;
}

function FolderGlyph({ icon, className }: { icon: string; className?: string }) {
  const Icon = getFolderIcon(icon);
  return <Icon className={className} />;
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
                      <FolderGlyph icon={f.icon} className="h-3 w-3" />
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

function ChatCard({ entry, isActive, isRunning, folders, onSelect, onDelete, onRename, onMoveToFolder }: {
  entry: ChatHistoryEntry;
  isActive: boolean;
  isRunning?: boolean;
  folders: ChatFolder[];
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onMoveToFolder: (folderId: string | null) => void;
}) {
  const { t } = useI18n();
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
      {isRunning && (
        <span
          className="flex shrink-0 items-center"
          title={t('sidebar.generating')}
          aria-label={t('sidebar.generating')}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 shadow-[0_0_6px_var(--color-primary-500)]" />
        </span>
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

function FolderSection({ folder, chats, activeSessionId, runningSessions, allFolders, onSelectSession, onDeleteChat, onRenameChat, onMoveToFolder, onEditFolder, onDeleteFolder }: {
  folder: ChatFolder;
  chats: ChatHistoryEntry[];
  activeSessionId: string;
  runningSessions: Set<string>;
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
          <FolderGlyph icon={folder.icon} className={`h-3.5 w-3.5 ${dragOver ? 'text-primary-400' : 'text-primary-500'}`} />
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
              isRunning={runningSessions.has(entry.id)}
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

/* ── Connection state marks ────────────────────────────────── */

const SERVICE_MARKS: [ConnectionProvider, (p: { className?: string; mono?: boolean }) => React.ReactElement][] = [
  ['google', GoogleIcon],
  ['microsoft', MicrosoftIcon],
  ['github', GitHubIcon],
];

/**
 * Green when the service is connected, grey when it is not.
 *
 * `identity` is the signed-in user: passing it makes the shared store refetch
 * once the session finishes restoring after a reload, so the marks are not
 * stuck grey until the connections panel is opened by hand.
 */
function ConnectionMarks({ identity }: { identity?: string | null }) {
  const { connections } = useConnections(identity);

  return (
    <span className="ml-auto flex items-center gap-1">
      {SERVICE_MARKS.map(([provider, Icon]) => {
        const connected = connections.some((c) => c.provider === provider && c.connected);
        return (
          <Icon
            key={provider}
            mono
            className={`h-3 w-3 transition-colors ${
              connected ? 'text-green-500' : 'text-surface-600'
            }`}
          />
        );
      })}
    </span>
  );
}

/* ── Collapsed rail ────────────────────────────────────────── */

const COLLAPSE_STORAGE_KEY = 'nova-sidebar-collapsed';

/** Widths the aside animates between, in px (w-64 / w-14). */
const PANEL_WIDTH = 256;
const RAIL_WIDTH = 56;

/** The width slide, and the shorter content cross-fade riding on top of it. */
const SLIDE = { duration: 0.3, ease: [0.4, 0, 0.2, 1] } as const;
const FADE = { duration: 0.14, ease: 'easeOut' } as const;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Each state supplies exactly one `text-*` class: two of them would race, and
 * CSS order — not the order they appear in the attribute — decides the winner.
 *
 * `accent` mirrors the green tool icons of the expanded sidebar, `filled` the
 * solid new-session button, `muted` the plain chat rows.
 */
const RAIL_TONES = {
  accent: 'text-primary-500 hover:bg-surface-800 hover:text-primary-400',
  filled: 'bg-primary-600 text-black hover:bg-primary-500 active:bg-primary-700',
  muted: 'text-surface-400 hover:bg-surface-800 hover:text-surface-200',
  active: 'bg-primary-950/60 text-primary-400 ring-1 ring-primary-800/50',
} as const;

/**
 * Icon in the collapsed rail with a flyout label.
 *
 * The flyout opens to the left, since the sidebar is docked to the right edge,
 * and it is positioned `fixed` from the button's measured box: the chat list
 * scrolls, and a scroll container clips on both axes, so an absolutely
 * positioned label would be cut off at the rail's edge instead of showing.
 */
function RailButton({ icon, label, onClick, tone = 'accent', active, children, flyoutLayout = 'row' }: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  tone?: keyof typeof RAIL_TONES;
  active?: boolean;
  /** Extra content inside the flyout, e.g. the connection marks. */
  children?: React.ReactNode;
  /** 'column' for flyouts that stack a list under the label. */
  flyoutLayout?: 'row' | 'column';
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const show = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setAnchor({ top: box.top + box.height / 2, right: window.innerWidth - box.left });
  };
  const hide = () => setAnchor(null);

  return (
    <div
      ref={wrapRef}
      className="relative flex justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        onClick={onClick}
        aria-label={label}
        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
          active ? RAIL_TONES.active : RAIL_TONES[tone]
        }`}
      >
        {icon}
      </button>

      {anchor && (
        <motion.div
          // y stays in the animation rather than a `-translate-y-1/2` class:
          // motion writes the whole transform, so a class would be overwritten.
          initial={{ opacity: 0, x: 4, y: '-50%' }}
          animate={{ opacity: 1, x: 0, y: '-50%' }}
          transition={FADE}
          style={{ position: 'fixed', top: anchor.top, right: anchor.right }}
          // The padding bridges the gap to the icon, so moving the pointer
          // onto the flyout does not count as leaving it.
          className="z-50 pr-2"
        >
          <div
            className={`flex gap-2 whitespace-nowrap rounded-lg border border-surface-700/50 bg-surface-900 px-2.5 py-1.5 shadow-xl ${
              flyoutLayout === 'column' ? 'flex-col items-stretch gap-1' : 'items-center'
            }`}
          >
            <span className="max-w-44 truncate text-xs text-surface-200">{label}</span>
            {children}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/** A chat as a row inside a flyout: its title plus a button to open it. */
function RailChatRow({ entry, isActive, isRunning, onSelect, openLabel }: {
  entry: ChatHistoryEntry;
  isActive: boolean;
  isRunning: boolean;
  onSelect: () => void;
  openLabel: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
        isActive ? 'text-primary-400' : 'text-surface-300 hover:bg-surface-800'
      }`}
    >
      <span className="max-w-44 truncate">{entry.title}</span>
      {isRunning && (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary-500" />
      )}
      <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-surface-500" aria-label={openLabel} />
    </button>
  );
}

interface CollapsedRailProps {
  chats: ChatHistoryEntry[];
  folders: ChatFolder[];
  activeSessionId: string;
  runningSessions: Set<string>;
  user?: UserProfile | null;
  identity?: string | null;
  onExpand: () => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenIntelligence?: () => void;
  onOpenScheduler?: () => void;
  onOpenConnections?: () => void;
  onOpenAppSettings?: () => void;
}

function CollapsedRail({
  chats,
  folders,
  activeSessionId,
  runningSessions,
  user,
  identity,
  onExpand,
  onSelectSession,
  onNewChat,
  onLogout,
  onOpenSettings,
  onOpenIntelligence,
  onOpenScheduler,
  onOpenConnections,
  onOpenAppSettings,
}: CollapsedRailProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { connections } = useConnections(identity);
  const anyConnected = connections.some((c) => c.connected);
  // Folders keep their own mark, with their chats listed in its flyout; only
  // loose chats get one mark each.
  const uncategorized = chats.filter((e) => !e.folderId);

  return (
    <div className="flex h-full w-14 shrink-0 flex-col">
      {/* Header — the mark alone, no wordmark and no version */}
      <div className="flex flex-col items-center gap-1 border-b border-primary-900/30 py-3">
        <button
          onClick={() => navigate('/')}
          title="NOVA"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-primary-500 transition-colors hover:bg-surface-800"
        >
          <Terminal className="h-4 w-4 text-glow" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-1 border-b border-primary-900/30 py-2">
        {/* The primary action: it keeps a filled treatment here too, standing
            in for the full-width green button of the expanded sidebar. */}
        <RailButton
          icon={<Plus className="h-4 w-4" />}
          label={t('sidebar.newSession')}
          onClick={onNewChat}
          tone="filled"
        />
        <RailButton
          icon={<Brain className="h-4 w-4" />}
          label={t('sidebar.intelligence')}
          onClick={onOpenIntelligence}
        />
        {!import.meta.env.PROD && (
          <RailButton
            icon={<Clock className="h-4 w-4" />}
            label={t('sidebar.scheduler')}
            onClick={onOpenScheduler}
          />
        )}
        {!import.meta.env.PROD && (
          <RailButton
            icon={
              <span className="relative">
                <Plug className="h-4 w-4" />
                {anyConnected && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                )}
              </span>
            }
            label={t('sidebar.connections')}
            onClick={onOpenConnections}
          >
            <ConnectionMarks identity={identity} />
          </RailButton>
        )}
      </div>

      {/* Folders and chats — hover a mark for the title and a way back in */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        <div className="flex flex-col items-center gap-1">
          {folders.map((folder) => {
            const folderChats = chats.filter((e) => e.folderId === folder.id);
            return (
              <RailButton
                key={folder.id}
                icon={
                  <span className="relative">
                    <FolderGlyph icon={folder.icon} className="h-4 w-4" />
                    {folderChats.some((e) => runningSessions.has(e.id)) && (
                      <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 shadow-[0_0_6px_var(--color-primary-500)]" />
                    )}
                  </span>
                }
                label={folder.name}
                active={folderChats.some((e) => e.id === activeSessionId)}
                flyoutLayout="column"
              >
                <div className="flex w-48 flex-col gap-0.5 border-t border-surface-700/40 pt-1">
                  {folderChats.map((entry) => (
                    <RailChatRow
                      key={entry.id}
                      entry={entry}
                      isActive={entry.id === activeSessionId}
                      isRunning={runningSessions.has(entry.id)}
                      onSelect={() => onSelectSession(entry.id)}
                      openLabel={t('sidebar.openChat')}
                    />
                  ))}
                  {folderChats.length === 0 && (
                    <p className="px-1.5 py-1 text-[10px] text-surface-600">{t('sidebar.empty')}</p>
                  )}
                </div>
              </RailButton>
            );
          })}

          {uncategorized.map((entry) => (
            <RailButton
              key={entry.id}
              icon={
                <span className="relative">
                  <MessageSquare className="h-4 w-4" />
                  {runningSessions.has(entry.id) && (
                    <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 shadow-[0_0_6px_var(--color-primary-500)]" />
                  )}
                </span>
              }
              label={entry.title}
              tone="muted"
              active={entry.id === activeSessionId}
              onClick={() => onSelectSession(entry.id)}
            >
              <button
                onClick={() => onSelectSession(entry.id)}
                title={t('sidebar.openChat')}
                aria-label={t('sidebar.openChat')}
                className="shrink-0 cursor-pointer rounded p-0.5 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </RailButton>
          ))}
        </div>
      </div>

      {/* Footer — expand, then the same second half the open sidebar shows */}
      <div className="flex flex-col items-center gap-1 border-t border-primary-900/30 py-2">
        <RailButton
          icon={<PanelRightOpen className="h-4 w-4" />}
          label={t('sidebar.expand')}
          onClick={onExpand}
        />
        <div className="my-1 h-px w-6 bg-primary-900/40" />
        <RailButton
          icon={<BookOpen className="h-4 w-4" />}
          label={t('sidebar.docs')}
          onClick={() => navigate('/docs')}
        />
        {!import.meta.env.PROD && (
          <RailButton
            icon={<Settings className="h-4 w-4" />}
            label={t('sidebar.settings')}
            onClick={onOpenAppSettings}
            tone="muted"
          />
        )}
        {user && (
          <>
            <RailButton
              icon={
                user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="h-7 w-7 rounded-full ring-1 ring-primary-800/50"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-950/50 ring-1 ring-primary-800/50">
                    <User className="h-3.5 w-3.5 text-primary-500" />
                  </span>
                )
              }
              label={user.name}
              onClick={onOpenSettings}
            />
            <RailButton
              icon={<LogOut className="h-4 w-4" />}
              label={t('sidebar.signOut')}
              onClick={onLogout}
              tone="muted"
            />
          </>
        )}
      </div>
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
  onOpenConnections,
  onOpenAppSettings,
}: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const running = useRunningSessions();
  const runningSessions = useMemo(() => new Set(running), [running]);
  const uncategorized = chatHistory.filter((e) => !e.folderId);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // The connection marks belong to whoever is signed in, so the shared store
  // knows to refetch when the session finishes restoring.
  const identity = user?.email ?? null;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      } catch { /* private mode — the choice just won't persist */ }
      return next;
    });
  };

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
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? RAIL_WIDTH : PANEL_WIDTH }}
      transition={SLIDE}
      // No clipping: the rail's hover flyouts have to reach past this edge.
      // The panel is fixed-width inside, so while it collapses it slides off
      // the right of the viewport instead of squashing its own layout.
      className="relative flex h-full shrink-0 flex-col border-l border-primary-900/30 bg-surface-900/50"
    >
      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          <motion.div
            key="rail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="h-full"
          >
            <CollapsedRail
              chats={chatHistory}
              folders={folders}
              activeSessionId={activeSessionId}
              runningSessions={runningSessions}
              user={user}
              identity={identity}
              onExpand={toggleCollapsed}
              onSelectSession={onSelectSession}
              onNewChat={onNewChat}
              onLogout={onLogout}
              onOpenSettings={onOpenSettings}
              onOpenIntelligence={onOpenIntelligence}
              onOpenScheduler={onOpenScheduler}
              onOpenConnections={onOpenConnections}
              onOpenAppSettings={onOpenAppSettings}
            />
          </motion.div>
        ) : (
          <motion.div
            key="panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="flex h-full w-64 shrink-0 flex-col"
          >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-primary-900/30 px-4 py-3">
            <button
              onClick={() => navigate('/')}
              className="flex flex-1 cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
            >
              <Terminal className="h-4 w-4 text-primary-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-primary-500 text-glow">
                NOVA
              </span>
              <span className="ml-auto text-[10px] text-surface-500">v{__APP_VERSION__}</span>
            </button>
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
            {!import.meta.env.PROD && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-1.5 text-surface-400"
                onClick={onOpenConnections}
                title={t('conn.title')}
              >
                <Plug className="h-3.5 w-3.5 text-primary-500" />
                {t('sidebar.connections')}
                <ConnectionMarks identity={identity} />
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
                  runningSessions={runningSessions}
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
                    isRunning={runningSessions.has(entry.id)}
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

          {/* Collapse toggle, then a divider and the utility icons */}
          <div className="flex items-center gap-1 border-t border-primary-900/30 px-3 py-2">
            <button
              onClick={toggleCollapsed}
              title={t('sidebar.collapse')}
              aria-label={t('sidebar.collapse')}
              className="cursor-pointer rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
            <span className="mx-1 h-5 w-px bg-primary-900/40" />
            <button
              onClick={() => navigate('/docs')}
              title={t('sidebar.docs')}
              aria-label={t('sidebar.docs')}
              className="cursor-pointer rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
            >
              <BookOpen className="h-4 w-4" />
            </button>
            {!import.meta.env.PROD && (
              <button
                onClick={onOpenAppSettings}
                title={t('sidebar.settings')}
                className="ml-auto cursor-pointer rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-800 hover:text-primary-400"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>

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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
