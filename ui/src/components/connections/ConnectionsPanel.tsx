import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Plug,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Settings2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { GoogleIcon, MicrosoftIcon, GitHubIcon } from '@/components/ui/BrandIcons';
import { ProviderSetup } from '@/components/connections/ProviderSetup';
import { useI18n } from '@/lib/i18n';
import { useConnections } from '@/hooks/useConnections';
import { getAuthorizeUrl, disconnectProvider } from '@/lib/api';
import type { ConnectionProvider, ConnectionStatus } from '@/lib/types';

/* ── Provider presentation ────────────────────────────────── */

const PROVIDER_ICONS: Record<
  ConnectionProvider,
  (p: { className?: string; mono?: boolean }) => React.ReactElement
> = {
  google: GoogleIcon,
  microsoft: MicrosoftIcon,
  github: GitHubIcon,
};

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 680;

/** Open the provider consent screen centred over the current window. */
function openAuthPopup(url: string): Window | null {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  return window.open(
    url,
    'nova-oauth',
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
  );
}

/* ── Single provider row ──────────────────────────────────── */

interface ProviderCardProps {
  conn: ConnectionStatus;
  busy: boolean;
  /** Registering the OAuth app is an operator action, not a user one. */
  isAdmin: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSetup: () => void;
}

function ProviderCard({ conn, busy, isAdmin, onConnect, onDisconnect, onSetup }: ProviderCardProps) {
  const { t } = useI18n();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const Icon = PROVIDER_ICONS[conn.provider];

  return (
    <div className="rounded-lg border border-surface-700/40 bg-surface-800/30 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-900/70 ring-1 transition-colors ${
            conn.connected ? 'ring-green-800/50' : 'ring-surface-700/50'
          }`}
        >
          <Icon
            mono
            className={`h-5 w-5 transition-colors ${
              conn.connected ? 'text-green-500' : 'text-surface-600'
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-surface-200">{conn.label}</span>
            {conn.connected && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
            )}
          </div>
          <p className="truncate text-[10px] text-surface-500">
            {conn.connected
              ? conn.account_email || conn.account_name || t('conn.connected')
              : /* Localized here rather than taken from the API's English copy. */
                t(`conn.desc.${conn.provider}`)}
          </p>
          {/* Registered but not signed in reads as "nothing happened" unless
              we say where the credentials actually went. */}
          {conn.configured && !conn.connected && (
            <p className="truncate text-[10px] text-surface-600">
              {t(
                conn.credentials_source === 'environment'
                  ? 'conn.storedInEnv'
                  : 'conn.storedInDb',
              )}
            </p>
          )}
        </div>

        {/* Re-run the wizard on an already-registered provider (operator only). */}
        {isAdmin && conn.configured && !confirmDisconnect && (
          <button
            onClick={onSetup}
            title={t('conn.reconfigure')}
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-800 hover:text-surface-300"
          >
            <Settings2 className="h-3 w-3" />
          </button>
        )}

        {!conn.configured ? (
          isAdmin ? (
            <button
              onClick={onSetup}
              title={t('conn.notConfiguredHint')}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-amber-800/50 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-400 transition-colors hover:bg-amber-950/60"
            >
              <AlertCircle className="h-3 w-3" />
              {t('conn.setup')}
            </button>
          ) : (
            <span className="shrink-0 rounded-lg border border-surface-700/40 px-2 py-1 text-[10px] text-surface-500">
              {t('conn.unavailable')}
            </span>
          )
        ) : conn.connected ? (
          confirmDisconnect ? (
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => { setConfirmDisconnect(false); onDisconnect(); }}
                className="cursor-pointer rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-red-600"
              >
                {t('conn.confirm')}
              </button>
              <button
                onClick={() => setConfirmDisconnect(false)}
                className="cursor-pointer rounded bg-surface-700/50 px-2 py-1 text-[10px] text-surface-300 transition-colors hover:bg-surface-700"
              >
                {t('conn.cancel')}
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 text-surface-400 hover:text-red-400"
              onClick={() => setConfirmDisconnect(true)}
            >
              <LogOut className="h-3 w-3" />
              {t('conn.disconnect')}
            </Button>
          )
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={onConnect}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon mono className="h-3 w-3" />}
            {t('conn.connect')}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────── */

interface ConnectionsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ConnectionsPanel({ open, onClose }: ConnectionsPanelProps) {
  const { t, lang } = useI18n();
  // Shared with the sidebar, so connecting here re-tints its service marks.
  const { connections, isAdmin, refresh } = useConnections();
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  //: Provider whose setup wizard is open, or null for the provider list.
  const [setupProvider, setSetupProvider] = useState<ConnectionProvider | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await refresh();
      setError(result.ok && result.connections.length > 0 ? null : t('conn.loadError'));
    } finally {
      setLoading(false);
    }
  }, [refresh, t]);

  useEffect(() => {
    if (open) {
      load();
      setSetupProvider(null);
    }
  }, [open, load]);

  // The popup signals completion via postMessage when it shares our origin.
  // Both the sign-in and the GitHub App registration popups use this channel.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.source !== 'nova-oauth') return;
      setPending(null);
      load();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, load]);

  // Clean up the popup watcher when the panel closes.
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = useCallback(async (provider: string) => {
    setPending(provider);
    setError(null);
    try {
      const { authorize_url } = await getAuthorizeUrl(provider, lang);
      const popup = openAuthPopup(authorize_url);
      if (!popup) {
        setError(t('conn.popupBlocked'));
        setPending(null);
        return;
      }

      // Fallback for when the callback page lives on a different origin and
      // its postMessage never reaches us: refresh once the popup closes.
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          setPending(null);
          load();
        }
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(null);
    }
  }, [load, t, lang]);

  const handleDisconnect = useCallback(async (provider: string) => {
    try {
      await disconnectProvider(provider);
      await load();
    } catch {
      setError(t('conn.disconnectError'));
    }
  }, [load, t]);

  const connectedCount = connections.filter((c) => c.connected).length;
  // Guard against a stale setup view if admin status arrives after opening.
  const setupTarget = isAdmin
    ? connections.find((c) => c.provider === setupProvider)
    : undefined;

  if (setupTarget) {
    return (
      <Modal open={open} onClose={onClose} title={t('conn.title')}>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          <ProviderSetup
            conn={setupTarget}
            onBack={() => setSetupProvider(null)}
            onChanged={load}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t('conn.title')}>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-surface-300">
            <Plug className="h-3.5 w-3.5 text-primary-500" />
            {t('conn.count', { n: connectedCount, total: connections.length })}
          </h3>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-surface-500">{t('conn.hint')}</p>

        {error && (
          <div className="flex items-start gap-2 rounded border border-red-800/50 bg-red-950/30 px-2.5 py-1.5">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
            <p className="text-[11px] text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          {connections.map((conn) => (
            <ProviderCard
              key={conn.provider}
              conn={conn}
              isAdmin={isAdmin}
              busy={pending === conn.provider}
              onConnect={() => handleConnect(conn.provider)}
              onDisconnect={() => handleDisconnect(conn.provider)}
              onSetup={() => setSetupProvider(conn.provider)}
            />
          ))}
          {connections.length === 0 && !loading && (
            <p className="py-4 text-center text-[11px] text-surface-500">
              {t('conn.empty')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
