import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Lock, Trash2, Key, Copy, Check, Plus, Eye, EyeOff, Loader2, AlertTriangle,
} from 'lucide-react';
import { getIdToken } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

type Tab = 'profile' | 'security' | 'developer';

interface ApiKeyItem {
  api_key_masked: string;
  api_key_id: string;
  key_name: string;
  created_at: number;
  is_active: boolean;
}

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
          {(['profile', 'security', 'developer'] as Tab[]).map((t) => (
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

function DeveloperTab() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = async () => {
    const token = await getIdToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchKeys = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/v1/developer/keys`, { headers });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch { /* ignore */ }
    setFetched(true);
  };

  // Fetch keys on mount
  if (!fetched) fetchKeys();

  const generateKey = async () => {
    setLoading(true);
    setError('');
    setNewKeyValue('');
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/v1/developer/keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key_name: newKeyName || 'Default' }),
      });
      if (!res.ok) throw new Error('Failed to generate key');
      const data = await res.json();
      setNewKeyValue(data.api_key);
      setNewKeyName('');
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    try {
      const headers = await authHeaders();
      await fetch(`${API_BASE}/api/v1/developer/keys/${keyId}`, {
        method: 'DELETE',
        headers,
      });
      fetchKeys();
    } catch { /* ignore */ }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <div>
        <h3 className="text-xs font-bold text-surface-200">API Keys</h3>
        <p className="mt-1 text-[10px] text-surface-500">
          Use API keys to connect NOVA's LLM from CLI, scripts, or external apps.
          Keys grant full access to the chat API on your behalf.
        </p>
      </div>

      {/* Generate new key */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. nova-cli)"
          className="flex-1 rounded-lg border border-surface-700/50 bg-surface-800 px-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:border-primary-700/50 focus:outline-none"
        />
        <button
          onClick={generateKey}
          disabled={loading}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-surface-950 transition-all hover:bg-primary-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Plus className="h-3 w-3" /> Generate</>}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* New key reveal (one-time) */}
      {newKeyValue && (
        <div className="rounded-xl border border-primary-900/50 bg-primary-950/20 p-4">
          <p className="mb-2 text-[10px] font-semibold text-primary-400">
            ⚠ Copy this key now — it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-surface-800 px-3 py-2 text-xs text-primary-300 code-scroll">
              {newKeyValue}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 cursor-pointer rounded-lg bg-surface-800 p-2 text-surface-400 hover:text-primary-400"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-primary-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Existing keys */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          active keys
        </h4>
        {keys.length === 0 ? (
          <p className="py-3 text-center text-[10px] text-surface-600">No API keys yet</p>
        ) : (
          keys.map((k) => (
            <div
              key={k.api_key_id}
              className="flex items-center gap-3 rounded-lg border border-surface-700/30 bg-surface-800/50 px-3 py-2.5"
            >
              <Key className="h-3.5 w-3.5 shrink-0 text-primary-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-surface-200">{k.key_name}</p>
                <p className="text-[10px] text-surface-500">
                  {k.api_key_masked} · {new Date(k.created_at * 1000).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => revokeKey(k.api_key_id)}
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-surface-500 transition-colors hover:bg-red-950/30 hover:text-red-400"
                title="Revoke key"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Usage docs */}
      <div className="rounded-xl border border-surface-700/30 bg-surface-800/30 p-4">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          usage
        </h4>
        <div className="space-y-2 text-[10px] text-surface-400">
          <p className="font-semibold text-surface-300">With nova CLI:</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-900 px-3 py-2 text-primary-400 code-scroll">
            export NOVA_API_KEY=nova-sk-your-key-here{'\n'}
            export NOVA_API_URL=http://localhost:8000{'\n'}
            nova chat "Hello NOVA"
          </code>
          <p className="font-semibold text-surface-300">With curl:</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-900 px-3 py-2 text-primary-400 code-scroll">
            curl -X POST http://localhost:8000/api/v1/chat \{'\n'}
            {'  '}-H "Authorization: Bearer nova-sk-your-key" \{'\n'}
            {'  '}-H "Content-Type: application/json" \{'\n'}
            {'  '}-d '{`{"message": "Hello", "session_id": "test"}`}'
          </code>
          <p className="font-semibold text-surface-300">OpenAI-compatible (Python):</p>
          <code className="block overflow-x-auto rounded-lg bg-surface-900 px-3 py-2 text-primary-400 code-scroll">
            from openai import OpenAI{'\n'}
            client = OpenAI({'\n'}
            {'  '}api_key="nova-sk-your-key",{'\n'}
            {'  '}base_url="http://localhost:8000/api/v1"{'\n'}
            )
          </code>
        </div>
      </div>
    </motion.div>
  );
}
