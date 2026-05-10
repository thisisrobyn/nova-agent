import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Lock, Trash2, Eye, EyeOff, Loader2, AlertTriangle,
  Cpu, Zap, Sparkles, CircleDot, RefreshCw, Server,
} from 'lucide-react';
import { fetchOllamaModels, getSettings, updateSettings } from '@/lib/api';
import type { AuthUser } from '@/lib/auth';
import type { OllamaModel } from '@/lib/types';

type Tab = 'profile' | 'security' | 'developer';

const TABS: Tab[] = import.meta.env.PROD
  ? ['profile', 'security']
  : ['profile', 'security', 'developer'];

interface ProfileSettingsProps {
  user: AuthUser;
  onClose: () => void;
  onUpdateName: (name: string) => Promise<void>;
  onUpdatePicture: (url: string) => Promise<void>;
  onChangePassword: (oldPw: string, newPw: string) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onLogout: () => void;
}

export function ProfileSettings({
  user,
  onClose,
  onUpdateName,
  onUpdatePicture,
  onChangePassword,
  onDeleteAccount,
  onLogout,
}: ProfileSettingsProps) {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-lg rounded-2xl border border-surface-700/50 bg-surface-900 shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-700/50 px-6 py-4">
          <h2 className="text-sm font-bold text-surface-100">$ settings</h2>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-surface-500 hover:bg-surface-800 hover:text-surface-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-700/50 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                tab === t
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5 scrollbar-thin">
          <AnimatePresence mode="wait">
            {tab === 'profile' && (
              <ProfileTab
                key="profile"
                user={user}
                onUpdateName={onUpdateName}
                onUpdatePicture={onUpdatePicture}
              />
            )}
            {tab === 'security' && (
              <SecurityTab
                key="security"
                onChangePassword={onChangePassword}
                onDeleteAccount={onDeleteAccount}
                onLogout={onLogout}
              />
            )}
            {tab === 'developer' && (
              <DeveloperTab key="developer" />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}


/* ── Profile Tab ──────────────────────────────────────────── */

function ProfileTab({
  user,
  onUpdateName,
  onUpdatePicture,
}: {
  user: AuthUser;
  onUpdateName: (name: string) => Promise<void>;
  onUpdatePicture: (url: string) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [pictureUrl, setPictureUrl] = useState(user.picture || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      if (name !== user.name) await onUpdateName(name);
      if (pictureUrl !== (user.picture || '')) await onUpdatePicture(pictureUrl);
      setMsg('Profile updated');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSave}
      className="space-y-5"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-950/50 ring-2 ring-primary-800/50 overflow-hidden">
          {pictureUrl ? (
            <img src={pictureUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <User className="h-8 w-8 text-primary-500" />
          )}
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
            avatar url
          </label>
          <input
            type="url"
            value={pictureUrl}
            onChange={(e) => setPictureUrl(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="w-full rounded-lg border border-surface-700/50 bg-surface-800 px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          display name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-surface-700/50 bg-surface-800 px-3 py-2.5 text-sm text-surface-100 focus:border-primary-700/50 focus:outline-none"
        />
      </div>

      {/* Email (read-only) */}
      <div>
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          email
        </label>
        <input
          type="email"
          value={user.email}
          disabled
          className="w-full rounded-lg border border-surface-700/30 bg-surface-800/50 px-3 py-2.5 text-sm text-surface-400"
        />
        <p className="mt-1 text-[10px] text-surface-600">Email cannot be changed</p>
      </div>

      {msg && (
        <p className={`text-xs ${msg.includes('updated') ? 'text-primary-400' : 'text-red-400'}`}>
          {msg}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-xs font-bold text-surface-950 transition-all hover:bg-primary-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save changes'}
      </button>
    </motion.form>
  );
}


/* ── Security Tab ─────────────────────────────────────────── */

function SecurityTab({
  onChangePassword,
  onDeleteAccount,
  onLogout,
}: {
  onChangePassword: (oldPw: string, newPw: string) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [deletePw, setDeletePw] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwLoading(true);
    setPwMsg('');
    try {
      await onChangePassword(oldPw, newPw);
      setPwMsg('Password changed');
      setOldPw('');
      setNewPw('');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPwLoading(false);
    }
  };

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteLoading(true);
    setDeleteMsg('');
    try {
      await onDeleteAccount(deletePw);
      onLogout();
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      {/* Change password */}
      <form onSubmit={handlePasswordChange} className="space-y-3">
        <h3 className="text-xs font-bold text-surface-200">Change password</h3>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
          <input
            type={showPw ? 'text' : 'password'}
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="Current password"
            required
            className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-2.5 pl-9 pr-10 text-xs text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-surface-500"
          >
            {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
          <input
            type={showPw ? 'text' : 'password'}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password"
            required
            minLength={8}
            className="w-full rounded-lg border border-surface-700/50 bg-surface-800 py-2.5 pl-9 pr-4 text-xs text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none"
          />
        </div>
        {pwMsg && (
          <p className={`text-xs ${pwMsg.includes('changed') ? 'text-primary-400' : 'text-red-400'}`}>
            {pwMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={pwLoading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-surface-800 px-4 py-2.5 text-xs font-semibold text-surface-200 transition-colors hover:bg-surface-700 disabled:opacity-50"
        >
          {pwLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Update password'}
        </button>
      </form>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-xs font-bold text-red-400">Danger zone</h3>
        </div>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-900/50 px-4 py-2.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete my account
          </button>
        ) : (
          <form onSubmit={handleDelete} className="space-y-3">
            <p className="text-[10px] text-red-400/80">
              This action is irreversible. All your data, chat history, and API keys will be permanently deleted.
            </p>
            <input
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              placeholder="Enter password to confirm"
              required
              className="w-full rounded-lg border border-red-900/50 bg-surface-800 px-3 py-2.5 text-xs text-surface-100 placeholder:text-surface-600 focus:border-red-700/50 focus:outline-none"
              autoFocus
            />
            {deleteMsg && <p className="text-xs text-red-400">{deleteMsg}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowDelete(false); setDeletePw(''); }}
                className="flex-1 cursor-pointer rounded-lg bg-surface-800 px-4 py-2 text-xs text-surface-300 hover:bg-surface-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleteLoading}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete permanently'}
              </button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}


/* ── Developer Tab ────────────────────────────────────────── */

const TIER_META: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  basic: {
    label: 'Básico',
    icon: <Zap className="h-3.5 w-3.5" />,
    color: 'text-green-400 border-green-900/50 bg-green-950/20',
    desc: 'Modelos ligeros y rápidos. Ideal para tareas sencillas.',
  },
  intermediate: {
    label: 'Intermedio',
    icon: <Cpu className="h-3.5 w-3.5" />,
    color: 'text-blue-400 border-blue-900/50 bg-blue-950/20',
    desc: 'Buen equilibrio entre velocidad y capacidad.',
  },
  advanced: {
    label: 'Avanzado',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    color: 'text-purple-400 border-purple-900/50 bg-purple-950/20',
    desc: 'Modelos grandes y potentes. Mejores resultados, más lentos.',
  },
  unknown: {
    label: 'Otro',
    icon: <CircleDot className="h-3.5 w-3.5" />,
    color: 'text-surface-400 border-surface-700/50 bg-surface-800/30',
    desc: 'Modelo no categorizado.',
  },
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function DeveloperTab() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [ollamaOk, setOllamaOk] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setMsg('');
    try {
      const [settingsData, ollamaModels] = await Promise.all([
        getSettings(),
        fetchOllamaModels().catch(() => {
          setOllamaOk(false);
          return [] as OllamaModel[];
        }),
      ]);
      setCurrentModel(settingsData.model_name);
      setTemperature(settingsData.temperature);
      setOllamaUrl(settingsData.ollama_base_url);
      setModels(ollamaModels);
      if (ollamaModels.length > 0) setOllamaOk(true);
    } catch {
      setMsg('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSelectModel = async (name: string) => {
    setSaving(true);
    setMsg('');
    try {
      await updateSettings({ model_name: name });
      setCurrentModel(name);
      setMsg('Modelo actualizado');
    } catch {
      setMsg('Error al cambiar modelo');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemp = async () => {
    setSaving(true);
    setMsg('');
    try {
      await updateSettings({ temperature });
      setMsg('Temperatura actualizada');
    } catch {
      setMsg('Error al guardar temperatura');
    } finally {
      setSaving(false);
    }
  };

  // Group models by tier
  const grouped: Record<string, OllamaModel[]> = {};
  for (const m of models) {
    const tier = m.tier || 'unknown';
    if (!grouped[tier]) grouped[tier] = [];
    grouped[tier].push(m);
  }

  const tierOrder = ['basic', 'intermediate', 'advanced', 'unknown'];

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-surface-200">Ollama — Modelos locales</h3>
          <p className="mt-1 text-[10px] text-surface-500">
            Selecciona el modelo LLM que NOVA utilizará. Los modelos se ejecutan localmente con Ollama.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="shrink-0 cursor-pointer rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-300"
          title="Refrescar modelos"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Ollama status */}
      {!ollamaOk && (
        <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-[10px] text-red-300">
            No se pudo conectar con Ollama en <span className="font-mono">{ollamaUrl}</span>. Asegúrate de que está en ejecución.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Model tiers */}
          {tierOrder.map((tier) => {
            const tierModels = grouped[tier];
            if (!tierModels || tierModels.length === 0) return null;
            const meta = TIER_META[tier] || TIER_META.unknown;

            return (
              <div key={tier}>
                <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 ${meta.color}`}>
                  {meta.icon}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{meta.label}</span>
                    <p className="text-[9px] opacity-70">{meta.desc}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {tierModels.map((m) => {
                    const isActive = m.name === currentModel;
                    return (
                      <button
                        key={m.name}
                        onClick={() => handleSelectModel(m.name)}
                        disabled={saving || isActive}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isActive
                            ? 'border-primary-700/50 bg-primary-950/30 ring-1 ring-primary-800/30'
                            : 'border-surface-700/30 bg-surface-800/50 hover:border-surface-600/50 hover:bg-surface-800'
                        } disabled:cursor-default`}
                      >
                        <Server className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary-400' : 'text-surface-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-xs font-medium ${isActive ? 'text-primary-300' : 'text-surface-200'}`}>
                            {m.name}
                          </p>
                          {m.size > 0 && (
                            <p className="text-[10px] text-surface-500">{formatSize(m.size)}</p>
                          )}
                        </div>
                        {isActive && (
                          <span className="shrink-0 rounded-full bg-primary-900/50 px-2 py-0.5 text-[9px] font-bold text-primary-400">
                            ACTIVO
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {models.length === 0 && ollamaOk && (
            <div className="rounded-lg border border-surface-700/30 bg-surface-800/30 py-6 text-center">
              <Cpu className="mx-auto mb-2 h-6 w-6 text-surface-600" />
              <p className="text-xs text-surface-500">No hay modelos descargados en Ollama.</p>
              <p className="mt-1 text-[10px] text-surface-600">
                Ejecuta <code className="rounded bg-surface-800 px-1 py-0.5 text-primary-400">ollama pull gemma3:4b</code> para empezar.
              </p>
            </div>
          )}

          {/* Temperature slider */}
          <div className="rounded-xl border border-surface-700/30 bg-surface-800/30 p-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-surface-500">
              temperatura: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-primary-500"
            />
            <div className="mt-1 flex justify-between text-[9px] text-surface-600">
              <span>Preciso (0.0)</span>
              <span>Creativo (2.0)</span>
            </div>
            <button
              onClick={handleSaveTemp}
              disabled={saving}
              className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-surface-700 px-4 py-2 text-xs font-semibold text-surface-200 transition-colors hover:bg-surface-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar temperatura'}
            </button>
          </div>
        </>
      )}

      {msg && (
        <p className={`text-xs ${msg.includes('Error') ? 'text-red-400' : 'text-primary-400'}`}>
          {msg}
        </p>
      )}

      {/* Ollama info box */}
      <div className="rounded-xl border border-surface-700/30 bg-surface-800/30 p-4">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          información
        </h4>
        <div className="space-y-2 text-[10px] text-surface-400">
          <p>NOVA utiliza <span className="font-semibold text-surface-300">Ollama</span> para ejecutar modelos LLM de forma local, sin necesidad de API keys externas.</p>
          <p className="font-semibold text-surface-300">Instalar un modelo:</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-900 px-3 py-2 text-primary-400 code-scroll">
            ollama pull gemma3:4b
          </code>
          <p className="font-semibold text-surface-300">Servidor:</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-900 px-3 py-2 text-primary-400 code-scroll">
            {ollamaUrl}
          </code>
        </div>
      </div>
    </motion.div>
  );
}
