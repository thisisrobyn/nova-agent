import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Trash2,
  Settings,
  Info,
  Zap,
  Hash,
  PanelLeftClose,
  PanelLeft,
  Plus,
  ExternalLink,
  Key,
  Bot,
  Thermometer,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatTokens } from '@/lib/utils';
import { getSettings, updateSettings } from '@/lib/api';
import type { SettingsData } from '@/lib/types';

export interface ChatHistoryEntry {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
}

interface SidebarProps {
  totalTokens: number;
  iterationCount: number;
  chatHistory: ChatHistoryEntry[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onClear: () => void;
}

export function Sidebar({
  totalTokens,
  iterationCount,
  chatHistory,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onClear,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const { toast } = useToast();

  /* ── Settings state ──────────────────────────────────── */
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [tempValue, setTempValue] = useState(0.7);
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    if (!showSettings) return;
    setSettingsLoading(true);
    getSettings()
      .then((s) => {
        setSettings(s);
        setSelectedModel(s.model_name);
        setTempValue(s.temperature);
        setApiKeyInput('');
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, [showSettings]);

  const handleSaveSettings = async () => {
    setSettingsLoading(true);
    try {
      const payload: Record<string, unknown> = {};
      if (apiKeyInput) payload.openai_api_key = apiKeyInput;
      if (selectedModel !== settings?.model_name) payload.model_name = selectedModel;
      if (tempValue !== settings?.temperature) payload.temperature = tempValue;

      if (Object.keys(payload).length === 0) {
        setSettingsLoading(false);
        setShowSettings(false);
        return;
      }

      const updated = await updateSettings(payload as Parameters<typeof updateSettings>[0]);
      setSettings(updated);
      setApiKeyInput('');
      setShowSettings(false);
      toast('Settings saved successfully', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  return (
    <>
      <motion.aside
        className="flex h-full shrink-0 flex-col border-r bg-surface-50 dark:bg-surface-900"
        animate={{ width: collapsed ? 48 : 256 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="collapsed"
              className="flex flex-col items-center gap-2 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewChat}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              className="flex h-full flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              {/* Top: New chat + collapse */}
              <div className="flex items-center justify-between px-3 pt-3">
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-1.5 whitespace-nowrap"
                  onClick={onNewChat}
                >
                  <Plus className="h-4 w-4" /> New chat
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(true)}
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>

              {/* Chat history */}
              <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
                  History
                </h3>
                {chatHistory.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-surface-400 dark:text-surface-500">
                    No previous chats
                  </p>
                ) : (
                  <div className="space-y-1">
                    {chatHistory.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => onSelectSession(entry.id)}
                        className={`flex w-full cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          entry.id === activeSessionId
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                            : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                        }`}
                      >
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2 flex-1">{entry.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Session Stats */}
              <div className="border-t px-3 py-3">
                <div className="flex items-center gap-4 text-xs text-surface-400 dark:text-surface-500">
                  <span className="flex items-center gap-1" title="Tokens">
                    <Zap className="h-3 w-3" /> {formatTokens(totalTokens)}
                  </span>
                  <span className="flex items-center gap-1" title="Iterations">
                    <Hash className="h-3 w-3" /> {iterationCount}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-1 border-t p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4" /> Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setShowAbout(true)}
                >
                  <Info className="h-4 w-4" /> About
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-red-500 hover:text-red-600"
                  onClick={onClear}
                >
                  <Trash2 className="h-4 w-4" /> Clear chat
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      {/* Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings">
        <div className="space-y-5">
          {/* OpenAI API Key */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300">
              <Key className="h-4 w-4" />
              OpenAI API Key
            </label>
            <input
              type="password"
              placeholder={settings?.has_api_key ? settings.openai_api_key_masked : 'sk-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-800 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:placeholder:text-surface-500"
            />
            {settings?.has_api_key && !apiKeyInput && (
              <p className="mt-1 text-xs text-surface-400 dark:text-surface-500">
                Key configured. Enter a new key to replace it.
              </p>
            )}
          </div>

          {/* Model selector */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300">
              <Bot className="h-4 w-4" />
              Model
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(settings?.available_models ?? []).map((model) => (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`cursor-pointer rounded-xl px-3 py-2 text-left text-sm transition-all ${
                    selectedModel === model
                      ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-700'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature slider */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300">
              <Thermometer className="h-4 w-4" />
              Temperature: {tempValue.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={tempValue}
              onChange={(e) => setTempValue(parseFloat(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-surface-400 dark:text-surface-500">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Save button */}
          <Button
            variant="primary"
            size="sm"
            className="w-full gap-2"
            onClick={handleSaveSettings}
            disabled={settingsLoading}
          >
            {settingsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </Modal>

      {/* About Modal */}
      <Modal open={showAbout} onClose={() => setShowAbout(false)} title="About NOVA">
        <div className="space-y-3 text-sm text-surface-600 dark:text-surface-400">
          <p>
            <strong className="text-surface-900 dark:text-surface-100">NOVA</strong> — Neural Orchestration &amp; Virtual Agent
          </p>
          <p>
            An advanced AI agent built with LangGraph and LangChain, capable of code execution,
            web search, file operations, and multi-agent orchestration.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {['LangGraph', 'LangChain', 'FastAPI', 'React', 'MCP'].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800">
            <p className="text-xs text-surface-500 dark:text-surface-400">
              For full documentation, architecture details, and setup instructions, visit the official repository:
            </p>
            <a
              href="https://github.com/thisisrober/nova-agent/tree/master/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              <ExternalLink className="h-3 w-3" />
              github.com/thisisrober/nova-agent/docs
            </a>
          </div>
        </div>
      </Modal>
    </>
  );
}
