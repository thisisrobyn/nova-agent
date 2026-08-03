import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  Wand2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GoogleIcon, MicrosoftIcon, GitHubIcon } from '@/components/ui/BrandIcons';
import { useI18n } from '@/lib/i18n';
import { saveProviderCredentials, getGitHubManifest } from '@/lib/api';
import type { ConnectionProvider, ConnectionStatus } from '@/lib/types';

const PROVIDER_ICONS: Record<ConnectionProvider, (p: { className?: string }) => React.ReactElement> = {
  google: GoogleIcon,
  microsoft: MicrosoftIcon,
  github: GitHubIcon,
};

/* ── Copyable value ───────────────────────────────────────── */

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the value is selectable anyway */
    }
  }, [value]);

  return (
    <div className="mt-1">
      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-surface-500">{label}</p>
      <div className="flex items-center gap-1.5 rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1.5">
        <code className="flex-1 overflow-x-auto whitespace-nowrap text-[11px] text-primary-400 scrollbar-thin">
          {value}
        </code>
        <button
          onClick={copy}
          className="shrink-0 cursor-pointer rounded p-1 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-200"
          title={label}
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

/* ── Numbered instruction ─────────────────────────────────── */

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-950/60 text-[9px] font-semibold text-primary-400 ring-1 ring-primary-800/50">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-surface-400">{children}</div>
    </li>
  );
}

function ConsoleLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-primary-400 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

/* ── GitHub one-click registration ────────────────────────── */

function GitHubAutoSetup({ onStarted }: { onStarted: () => void }) {
  const { t, lang } = useI18n();
  const [name, setName] = useState('NOVA Agent');
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * GitHub's manifest flow needs a real form POST, so build one on the fly
   * and target it at a popup we open first.
   */
  const register = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { registration_url, manifest, state } = await getGitHubManifest(
        name.trim() || 'NOVA Agent',
        org.trim() || undefined,
        lang,
      );

      const popup = window.open('', 'nova-github-setup', 'width=980,height=760');
      if (!popup) {
        setError(t('conn.popupBlocked'));
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${registration_url}?state=${encodeURIComponent(state)}`;
      form.target = 'nova-github-setup';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = manifest;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);

      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [name, org, onStarted, t, lang]);

  return (
    <div className="rounded-lg border border-primary-800/40 bg-primary-950/20 p-3">
      <div className="flex items-center gap-1.5">
        <Wand2 className="h-3.5 w-3.5 text-primary-500" />
        <h4 className="text-xs font-medium text-surface-200">{t('conn.gh.autoTitle')}</h4>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-surface-400">{t('conn.gh.autoHint')}</p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-surface-500">
            {t('conn.gh.appName')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 w-full rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1 text-[11px] text-surface-200 outline-none focus:border-primary-600"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-surface-500">
            {t('conn.gh.org')}
          </span>
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder={t('conn.gh.orgPlaceholder')}
            className="mt-0.5 w-full rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1 text-[11px] text-surface-200 outline-none placeholder:text-surface-600 focus:border-primary-600"
          />
        </label>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded border border-red-800/50 bg-red-950/30 px-2 py-1.5">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
          <p className="text-[11px] text-red-300">{error}</p>
        </div>
      )}

      <Button variant="primary" size="sm" className="mt-2.5 w-full gap-1.5" onClick={register} disabled={busy}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitHubIcon className="h-3 w-3" />}
        {t('conn.gh.createApp')}
      </Button>

      <p className="mt-1.5 text-[10px] leading-relaxed text-surface-500">{t('conn.gh.autoNote')}</p>
    </div>
  );
}

/* ── Manual credential form ───────────────────────────────── */

function CredentialsForm({
  conn,
  onSaved,
}: {
  conn: ConnectionStatus;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tenantId, setTenantId] = useState('common');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError(t('conn.setup.required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProviderCredentials(conn.provider, {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        ...(conn.provider === 'microsoft' ? { tenant_id: tenantId.trim() || 'common' } : {}),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [clientId, clientSecret, tenantId, conn.provider, onSaved, t]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-surface-500">Client ID</span>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          className="mt-0.5 w-full rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1.5 font-mono text-[11px] text-surface-200 outline-none focus:border-primary-600"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-surface-500">Client secret</span>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="new-password"
          className="mt-0.5 w-full rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1.5 font-mono text-[11px] text-surface-200 outline-none focus:border-primary-600"
        />
      </label>

      {conn.provider === 'microsoft' && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-surface-500">
            {t('conn.ms.tenant')}
          </span>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="mt-0.5 w-full rounded border border-surface-700/50 bg-surface-950/60 px-2 py-1.5 font-mono text-[11px] text-surface-200 outline-none focus:border-primary-600"
          />
          <span className="mt-0.5 block text-[10px] text-surface-500">{t('conn.ms.tenantHint')}</span>
        </label>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded border border-red-800/50 bg-red-950/30 px-2 py-1.5">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
          <p className="text-[11px] text-red-300">{error}</p>
        </div>
      )}

      <Button variant="primary" size="sm" className="w-full gap-1.5" onClick={submit} disabled={saving}>
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {t('conn.setup.save')}
      </Button>

      <p className="text-[10px] leading-relaxed text-surface-500">{t('conn.setup.storedNote')}</p>
    </div>
  );
}

/* ── Per-provider instructions ────────────────────────────── */

function GoogleInstructions({ conn }: { conn: ConnectionStatus }) {
  const { t } = useI18n();
  return (
    <ol className="space-y-2">
      <Step n={1}>
        {t('conn.google.step1')}{' '}
        <ConsoleLink href="https://console.cloud.google.com/projectcreate">
          Google Cloud Console
        </ConsoleLink>
      </Step>
      <Step n={2}>
        {t('conn.google.step2')}{' '}
        <ConsoleLink href="https://console.cloud.google.com/apis/library">
          {t('conn.google.apiLibrary')}
        </ConsoleLink>
        <p className="mt-0.5 text-[10px] text-surface-500">
          Gmail · Google Calendar · Google Drive · Google Sheets · Google Docs
        </p>
      </Step>
      <Step n={3}>
        {t('conn.google.step3')}{' '}
        <ConsoleLink href="https://console.cloud.google.com/apis/credentials/consent">
          {t('conn.google.consentScreen')}
        </ConsoleLink>
      </Step>
      <Step n={4}>
        {t('conn.google.step4')}{' '}
        <ConsoleLink href="https://console.cloud.google.com/apis/credentials">
          {t('conn.google.credentials')}
        </ConsoleLink>
        <CopyBox label={t('conn.setup.redirectUri')} value={conn.redirect_uri} />
      </Step>
      <Step n={5}>{t('conn.google.step5')}</Step>
    </ol>
  );
}

function MicrosoftInstructions({ conn }: { conn: ConnectionStatus }) {
  const { t } = useI18n();
  const publicUrl = conn.redirect_uri.replace('/api/v1/connections/microsoft/callback', '');
  const command = `./scripts/setup_microsoft_app.ps1 -PublicUrl ${publicUrl}`;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary-800/40 bg-primary-950/20 p-3">
        <div className="flex items-center gap-1.5">
          <Wand2 className="h-3.5 w-3.5 text-primary-500" />
          <h4 className="text-xs font-medium text-surface-200">{t('conn.ms.scriptTitle')}</h4>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-surface-400">{t('conn.ms.scriptHint')}</p>
        <CopyBox label={t('conn.ms.command')} value={command} />
      </div>

      <p className="text-[10px] uppercase tracking-wider text-surface-500">{t('conn.ms.orManual')}</p>

      <ol className="space-y-2">
        <Step n={1}>
          {t('conn.ms.step1')}{' '}
          <ConsoleLink href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">
            {t('conn.ms.appRegistrations')}
          </ConsoleLink>
        </Step>
        <Step n={2}>
          {t('conn.ms.step2')}
          <CopyBox label={t('conn.setup.redirectUri')} value={conn.redirect_uri} />
        </Step>
        <Step n={3}>
          {t('conn.ms.step3')}
          <p className="mt-0.5 font-mono text-[10px] text-surface-500">
            {conn.required_scopes.filter((s) => !['openid', 'email', 'profile'].includes(s)).join(' · ')}
          </p>
        </Step>
        <Step n={4}>{t('conn.ms.step4')}</Step>
      </ol>
    </div>
  );
}

function GitHubInstructions({ conn, onStarted }: { conn: ConnectionStatus; onStarted: () => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <GitHubAutoSetup onStarted={onStarted} />
      <p className="text-[10px] uppercase tracking-wider text-surface-500">{t('conn.gh.orManual')}</p>
      <ol className="space-y-2">
        <Step n={1}>
          {t('conn.gh.step1')}{' '}
          <ConsoleLink href="https://github.com/settings/apps/new">
            {t('conn.gh.newApp')}
          </ConsoleLink>
        </Step>
        <Step n={2}>
          {t('conn.gh.step2')}
          <CopyBox label={t('conn.gh.callbackUrl')} value={conn.redirect_uri} />
        </Step>
        <Step n={3}>{t('conn.gh.step3')}</Step>
      </ol>
    </div>
  );
}

/* ── Setup view ───────────────────────────────────────────── */

interface ProviderSetupProps {
  conn: ConnectionStatus;
  onBack: () => void;
  /** Called after credentials change so the panel can reload. */
  onChanged: () => void;
}

export function ProviderSetup({ conn, onBack, onChanged }: ProviderSetupProps) {
  const { t } = useI18n();
  const Icon = PROVIDER_ICONS[conn.provider];
  // GitHub can register itself, so its manual form starts collapsed.
  const [showForm, setShowForm] = useState(conn.provider !== 'github');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="cursor-pointer rounded p-1 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-200"
          title={t('conn.setup.back')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <Icon className="h-4 w-4" />
        <h3 className="text-xs font-medium text-surface-200">
          {t('conn.setup.title', { provider: conn.label })}
        </h3>
      </div>

      <p className="rounded border border-surface-700/40 bg-surface-800/30 px-2.5 py-1.5 text-[11px] leading-relaxed text-surface-400">
        {t('conn.setup.onceNote')}
      </p>

      {conn.provider === 'google' && <GoogleInstructions conn={conn} />}
      {conn.provider === 'microsoft' && <MicrosoftInstructions conn={conn} />}
      {conn.provider === 'github' && (
        <GitHubInstructions conn={conn} onStarted={onChanged} />
      )}

      {showForm ? (
        <div className="border-t border-surface-700/40 pt-3">
          <CredentialsForm conn={conn} onSaved={onChanged} />
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-surface-700/40 py-1.5 text-[11px] text-surface-400 transition-colors hover:bg-surface-800/50"
        >
          <ChevronDown className="h-3 w-3" />
          {t('conn.setup.manualEntry')}
        </button>
      )}
    </div>
  );
}
