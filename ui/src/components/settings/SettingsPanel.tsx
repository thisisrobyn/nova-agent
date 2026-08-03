import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Cpu, Zap, Sparkles, CircleDot, RefreshCw, Loader2, Power,
  Download, Check, AlertTriangle, KeyRound, Languages,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { OllamaIcon, OpenAIIcon, AnthropicIcon } from '@/components/ui/BrandIcons';
import { useI18n, type Lang } from '@/lib/i18n';
import {
  getSettings, updateSettings, fetchOllamaModels, getOllamaStatus, startOllama,
  getOllamaCatalog, testProvider, pullOllamaModel,
} from '@/lib/api';
import type {
  SettingsData, OllamaModel, OllamaCatalogModel, ProviderModel, LLMProvider,
} from '@/lib/types';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS: { id: LLMProvider; label: string; icon: typeof OllamaIcon }[] = [
  { id: 'ollama', label: 'Ollama', icon: OllamaIcon },
  { id: 'openai', label: 'OpenAI', icon: OpenAIIcon },
  { id: 'anthropic', label: 'Anthropic', icon: AnthropicIcon },
];

const TIER_META: Record<string, { key: string; icon: typeof Zap; color: string }> = {
  basic: { key: 'Básico', icon: Zap, color: 'text-green-400' },
  intermediate: { key: 'Intermedio', icon: Cpu, color: 'text-blue-400' },
  advanced: { key: 'Avanzado', icon: Sparkles, color: 'text-purple-400' },
  unknown: { key: 'Otro', icon: CircleDot, color: 'text-surface-400' },
};
const TIER_ORDER = ['basic', 'intermediate', 'advanced', 'unknown'];
const LANGS: { id: Lang; label: string }[] = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { lang, setLang, t } = useI18n();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [provider, setProvider] = useState<LLMProvider>('ollama');
  const [temperature, setTemperature] = useState(0.7);
  const [tempMsg, setTempMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Ollama
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [catalog, setCatalog] = useState<OllamaCatalogModel[]>([]);
  const [starting, setStarting] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullPct, setPullPct] = useState(0);
  const pullAbort = useRef<AbortController | null>(null);

  // Cloud providers
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [testError, setTestError] = useState('');

  const refreshOllama = useCallback(async () => {
    const status = await getOllamaStatus().catch(() => ({ running: false, base_url: '' }));
    setOllamaRunning(status.running);
    if (status.running) {
      setOllamaModels(await fetchOllamaModels().catch(() => []));
      setCatalog(await getOllamaCatalog().catch(() => []));
    } else {
      setOllamaModels([]);
      setCatalog([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setMsg(''); setTempMsg(''); setTestError('');
    setProviderModels([]); setApiKey('');
    try {
      const s = await getSettings();
      setSettings(s);
      setProvider(s.provider);
      setTemperature(s.temperature);
    } catch {
      setMsg(t('set.loadError'));
    }
    await refreshOllama();
  }, [refreshOllama, t]);

  useEffect(() => { if (open) loadAll(); }, [open, loadAll]);

  useEffect(() => {
    if (!open || ollamaRunning || provider !== 'ollama') return;
    const id = setInterval(refreshOllama, 4000);
    return () => clearInterval(id);
  }, [open, ollamaRunning, provider, refreshOllama]);

  useEffect(() => () => pullAbort.current?.abort(), []);

  const activeModel = settings?.model_name;
  const activeProvider = settings?.provider;

  const handleStart = async () => {
    setStarting(true); setMsg('');
    try {
      const res = await startOllama();
      if (!res.started) setMsg(res.error || t('set.startError'));
      await refreshOllama();
    } finally { setStarting(false); }
  };

  const handleSaveTemp = async () => {
    setSaving(true); setTempMsg('');
    try {
      await updateSettings({ temperature });
      setSettings((s) => (s ? { ...s, temperature } : s));
      setTempMsg(t('set.tempSaved'));
    } catch {
      setTempMsg(t('set.tempError'));
    } finally { setSaving(false); }
  };

  const selectOllamaModel = async (name: string) => {
    setSaving(true); setMsg('');
    try {
      const s = await updateSettings({ provider: 'ollama', model_name: name });
      setSettings(s);
      setProvider('ollama');
      setMsg(t('set.activeModel', { model: name }));
    } catch {
      setMsg(t('set.modelError'));
    } finally { setSaving(false); }
  };

  const handlePull = async (name: string) => {
    setPulling(name); setPullPct(0); setMsg('');
    const controller = new AbortController();
    pullAbort.current = controller;
    try {
      await pullOllamaModel(name, (p) => {
        if (p.type === 'progress' && p.total) {
          setPullPct(Math.round(((p.completed || 0) / p.total) * 100));
        } else if (p.type === 'error') {
          setMsg(`${t('set.downloadError')}: ${p.message}`);
        }
      }, controller.signal);
      await refreshOllama();
      setMsg(t('set.downloaded', { model: name }));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMsg(t('set.downloadError'));
    } finally {
      setPulling(null); setPullPct(0); pullAbort.current = null;
    }
  };

  const handleTestKey = async () => {
    if (!apiKey.trim() && !keyIsStored) return;
    setTesting(true); setTestError(''); setProviderModels([]);
    try {
      const res = await testProvider(provider, apiKey.trim() || undefined);
      if (res.valid) {
        setProviderModels(res.models);
        if (res.models.length === 0) setTestError(t('set.noModels'));
      } else {
        setTestError(res.error || t('set.invalidKey'));
      }
    } catch {
      setTestError(t('set.testError'));
    } finally { setTesting(false); }
  };

  const selectCloudModel = async (modelId: string) => {
    setSaving(true); setMsg('');
    try {
      const payload: Parameters<typeof updateSettings>[0] = { provider, model_name: modelId };
      // Only send a new key if the user typed one; otherwise keep the stored key intact.
      if (apiKey.trim() && provider === 'openai') payload.openai_api_key = apiKey.trim();
      if (apiKey.trim() && provider === 'anthropic') payload.anthropic_api_key = apiKey.trim();
      const s = await updateSettings(payload);
      setSettings(s);
      setMsg(t('set.activeModel', { model: modelId }));
    } catch {
      setMsg(t('set.applyError'));
    } finally { setSaving(false); }
  };

  const keyIsStored =
    (provider === 'openai' && settings?.openai_key_set) ||
    (provider === 'anthropic' && settings?.anthropic_key_set);
  const keyMasked =
    provider === 'openai' ? settings?.openai_key_masked : settings?.anthropic_key_masked;

  const grouped: Record<string, OllamaModel[]> = {};
  for (const m of ollamaModels) (grouped[m.tier] ||= []).push(m);
  const notDownloaded = catalog.filter((c) => !c.downloaded);

  return (
    <Modal open={open} onClose={onClose} title={t('set.title')}>
      <div className="max-h-[65vh] space-y-5 overflow-y-auto scrollbar-thin px-0.5">
        {/* Language */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
            <Languages className="h-3 w-3" /> {t('set.language')}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLang(l.id)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                  lang === l.id
                    ? 'border-primary-700/50 bg-primary-950/30 text-primary-300'
                    : 'border-surface-700/40 bg-surface-800/40 text-surface-300 hover:border-surface-600/60'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Provider */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
            {t('set.provider')}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {PROVIDERS.map((p) => {
              const Icon = p.icon;
              const isActive = provider === p.id;
              const isLive = activeProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setTestError(''); setProviderModels([]); setApiKey(''); }}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-all ${
                    isActive
                      ? 'border-primary-700/50 bg-primary-950/30 text-primary-300'
                      : 'border-surface-700/40 bg-surface-800/40 text-surface-300 hover:border-surface-600/60'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{p.label}</span>
                  {isLive && (
                    <span className="rounded-full bg-primary-900/50 px-1.5 text-[9px] font-bold text-primary-400">
                      {t('set.active')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Temperature */}
        <div className="rounded-xl border border-surface-700/30 bg-surface-800/30 p-3">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
            {t('set.temperature')}: {temperature.toFixed(1)}
          </label>
          <input
            type="range" min="0" max="2" step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[9px] text-surface-600">{t('set.precise')}</span>
            <button
              onClick={handleSaveTemp}
              disabled={saving}
              className="rounded-lg bg-surface-700 px-3 py-1 text-[11px] font-semibold text-surface-200 hover:bg-surface-600 disabled:opacity-50"
            >
              {t('set.save')}
            </button>
          </div>
          {tempMsg && (
            <p className={`mt-1.5 text-[11px] ${tempMsg === t('set.tempSaved') ? 'text-primary-400' : 'text-red-400'}`}>
              {tempMsg}
            </p>
          )}
          {provider === 'anthropic' && (
            <p className="mt-1.5 text-[10px] text-amber-400/80">{t('set.anthropicTempNote')}</p>
          )}
        </div>

        {/* Provider-specific content (animated on switch) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={provider}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >

        {/* Ollama */}
        {provider === 'ollama' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-surface-700/40 bg-surface-800/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${ollamaRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-surface-200">
                  {ollamaRunning ? t('set.ollamaRunning') : t('set.ollamaOff')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={refreshOllama} className="rounded p-1.5 text-surface-500 hover:bg-surface-700 hover:text-surface-300" title={t('set.refresh')}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                {!ollamaRunning && (
                  <Button variant="primary" size="sm" className="gap-1.5" onClick={handleStart} disabled={starting}>
                    {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                    {t('set.turnOn')}
                  </Button>
                )}
              </div>
            </div>

            {/* Active model — kept near the top, right under the status */}
            {activeProvider === 'ollama' && activeModel && (
              <div className="flex items-center gap-2 rounded-lg border border-primary-800/40 bg-primary-950/20 px-3 py-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-primary-400" />
                <span className="text-[11px] text-surface-400">{t('set.activeModelLabel')}</span>
                <span className="ml-auto truncate text-xs font-medium text-primary-300">{activeModel}</span>
              </div>
            )}

            {ollamaRunning && (
              <>
                {TIER_ORDER.map((tier) => {
                  const models = grouped[tier];
                  if (!models?.length) return null;
                  const meta = TIER_META[tier] || TIER_META.unknown;
                  const TierIcon = meta.icon;
                  return (
                    <div key={tier}>
                      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
                        <TierIcon className="h-3 w-3" /> {meta.key}
                      </div>
                      <div className="space-y-1">
                        {models.map((m) => {
                          const isActive = activeProvider === 'ollama' && m.name === activeModel;
                          return (
                            <button
                              key={m.name}
                              onClick={() => selectOllamaModel(m.name)}
                              disabled={saving || isActive}
                              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                                isActive
                                  ? 'border-primary-700/50 bg-primary-950/30 text-primary-300'
                                  : 'border-surface-700/30 bg-surface-800/40 text-surface-200 hover:border-surface-600/50'
                              } disabled:cursor-default`}
                            >
                              <Server className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary-400' : 'text-surface-500'}`} />
                              <span className="flex-1 truncate">{m.name}</span>
                              {m.size > 0 && <span className="text-[10px] text-surface-500">{(m.size / 1024 ** 3).toFixed(1)} GB</span>}
                              {isActive && <Check className="h-3.5 w-3.5 text-primary-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {notDownloaded.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-surface-500">
                      {t('set.download')}
                    </div>
                    <div className="space-y-1">
                      {notDownloaded.map((c) => {
                        const isPulling = pulling === c.name;
                        return (
                          <div key={c.name} className="rounded-lg border border-surface-700/30 bg-surface-800/30 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2.5">
                              <Server className="h-3.5 w-3.5 shrink-0 text-surface-600" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-surface-300">{c.name}</p>
                                <p className="text-[10px] text-surface-600">
                                  {c.provider}{c.size_gb > 0 ? ` · ~${c.size_gb} GB` : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => handlePull(c.name)}
                                disabled={!!pulling}
                                className="flex items-center gap-1 rounded-md bg-surface-700 px-2 py-1 text-[11px] font-medium text-surface-200 hover:bg-surface-600 disabled:opacity-40"
                              >
                                {isPulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                {isPulling ? `${pullPct}%` : t('set.download')}
                              </button>
                            </div>
                            {isPulling && (
                              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-700">
                                <div className="h-full bg-primary-500 transition-all" style={{ width: `${pullPct}%` }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* OpenAI / Anthropic */}
        {(provider === 'openai' || provider === 'anthropic') && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                {t('set.apiKey', { provider })}
              </label>
              {keyIsStored && (
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-green-400/90">
                  <Check className="h-3 w-3" /> {t('set.keyStored')}: <span className="font-mono">{keyMasked}</span>
                </p>
              )}
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                    className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-2 pl-9 pr-3 text-xs text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none"
                  />
                </div>
                <Button variant="primary" size="sm" className="gap-1.5" onClick={handleTestKey} disabled={testing || (!apiKey.trim() && !keyIsStored)}>
                  {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {t('set.connect')}
                </Button>
              </div>
              {testError && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {testError}
                </p>
              )}
            </div>

            {providerModels.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-surface-500">
                  {t('set.availableModels')} ({providerModels.length})
                </div>
                <div className="space-y-1">
                  {providerModels.map((m) => {
                    const isActive = activeProvider === provider && m.id === activeModel;
                    return (
                      <button
                        key={m.id}
                        onClick={() => selectCloudModel(m.id)}
                        disabled={saving || isActive}
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                          isActive
                            ? 'border-primary-700/50 bg-primary-950/30 text-primary-300'
                            : 'border-surface-700/30 bg-surface-800/40 text-surface-200 hover:border-surface-600/50'
                        } disabled:cursor-default`}
                      >
                        <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary-400' : 'text-surface-500'}`} />
                        <span className="flex-1 truncate">{m.display_name || m.id}</span>
                        {isActive && <Check className="h-3.5 w-3.5 text-primary-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

          </motion.div>
        </AnimatePresence>

        {msg && (
          <p className={`text-xs ${msg.toLowerCase().includes('error') ? 'text-red-400' : 'text-primary-400'}`}>
            {msg}
          </p>
        )}
      </div>
    </Modal>
  );
}
