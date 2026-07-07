import { useState, useCallback, useEffect } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  History,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import {
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getTaskExecutionLogs,
} from '@/lib/api';
import type { ScheduledTask, TaskExecution } from '@/lib/types';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/* ── Helpers ──────────────────────────────────────────────── */

function relativeTime(iso: string | null, t: TFn): string {
  if (!iso) return '--';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return t('sched.justNow');
  if (diff < 3_600_000) return t('sched.minAgo', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('sched.hourAgo', { n: Math.floor(diff / 3_600_000) });
  return t('sched.dayAgo', { n: Math.floor(diff / 86_400_000) });
}

function triggerLabel(task: ScheduledTask, t: TFn): string {
  const args = task.trigger_args as Record<string, unknown>;
  if (task.trigger_type === 'interval') {
    if (args.hours) return t('sched.everyH', { n: String(args.hours) });
    if (args.minutes) return t('sched.everyMin', { n: String(args.minutes) });
    if (args.seconds) return t('sched.everyS', { n: String(args.seconds) });
    return t('sched.interval');
  }
  // cron -- build a human-readable label
  const h = args.hour != null ? String(args.hour).padStart(2, '0') : '*';
  const m = args.minute != null ? String(args.minute).padStart(2, '0') : '00';
  const dow = args.day_of_week as string | undefined;
  if (dow) {
    const dayLabel = t(`sched.${dow}Short`);
    return `${dayLabel} ${h}:${m}`;
  }
  if (h !== '*') return t('sched.dailyAt', { time: `${h}:${m}` });
  return t('sched.cron');
}

/* ── Status badge ─────────────────────────────────────────── */

function ExecStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; icon: typeof CheckCircle }> = {
    success: { bg: 'bg-green-950/50 text-green-400 border-green-800/50', icon: CheckCircle },
    error: { bg: 'bg-red-950/50 text-red-400 border-red-800/50', icon: AlertCircle },
    running: { bg: 'bg-amber-950/50 text-amber-400 border-amber-800/50', icon: Loader2 },
    timeout: { bg: 'bg-orange-950/50 text-orange-400 border-orange-800/50', icon: AlertCircle },
  };
  const c = cfg[status] || cfg.error;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.bg}`}>
      <Icon className={`h-2.5 w-2.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

/* ── Execution log viewer ─────────────────────────────────── */

function ExecutionLogs({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTaskExecutionLogs(taskId, 10)
      .then((r) => setLogs(r.executions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <Loader2 className="mx-auto my-2 h-4 w-4 animate-spin text-surface-500" />;
  if (logs.length === 0) return <p className="py-2 text-center text-[10px] text-surface-500">{t('sched.noExecutions')}</p>;

  return (
    <div className="mt-1 space-y-1">
      {logs.map((log) => (
        <div key={log.id} className="rounded border border-surface-700/30 px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <ExecStatusBadge status={log.status} />
            <span className="text-[10px] text-surface-500">
              {new Date(log.started_at).toLocaleString()}
            </span>
            {log.duration_seconds != null && (
              <span className="text-[10px] text-surface-500">{log.duration_seconds}s</span>
            )}
          </div>
          {log.result_summary && (
            <p className="mt-1 line-clamp-2 text-[10px] text-surface-400">{log.result_summary}</p>
          )}
          {log.error && (
            <p className="mt-1 line-clamp-2 text-[10px] text-red-400">{log.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Task card ────────────────────────────────────────────── */

function TaskCard({
  task,
  onToggle,
  onDelete,
}: {
  task: ScheduledTask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [showLogs, setShowLogs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-lg border border-surface-700/30 px-3 py-2.5 hover:bg-surface-800/30">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={`rounded p-1 transition-colors ${
            task.enabled
              ? 'text-green-400 hover:bg-green-950/30'
              : 'text-surface-500 hover:bg-surface-700'
          }`}
          title={task.enabled ? t('sched.pause') : t('sched.enable')}
        >
          {task.enabled ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-surface-200">{task.name}</p>
          <p className="truncate text-[10px] text-surface-500">{task.prompt}</p>
        </div>

        <span className="shrink-0 rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-400">
          {triggerLabel(task, t)}
        </span>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-surface-300"
          title={t('sched.logs')}
        >
          {showLogs ? <ChevronDown className="h-3 w-3" /> : <History className="h-3 w-3" />}
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5 text-red-400 hover:text-red-300"
              onClick={onDelete}
            >
              {t('sched.yes')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5"
              onClick={() => setConfirmDelete(false)}
            >
              {t('sched.no')}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-red-400"
            title={t('sched.deleteTask')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="mt-1 flex gap-3 text-[10px] text-surface-500">
        <span>{t('sched.last', { time: relativeTime(task.last_run_at, t) })}</span>
        {task.created_at && <span>{t('sched.created', { date: new Date(task.created_at).toLocaleDateString() })}</span>}
      </div>

      {showLogs && <ExecutionLogs taskId={task.id} />}
    </div>
  );
}

/* ── Shared select style ──────────────────────────────────── */

const selectClass =
  'rounded border border-surface-700/50 bg-surface-800 px-2 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50 appearance-none cursor-pointer';

/* ── New task form ─────────────────────────────────────────── */

type Frequency = 'minutes' | 'hours' | 'daily' | 'weekly';

const WEEKDAY_VALUES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function buildTrigger(freq: Frequency, opts: { intervalValue: number; hour: number; minute: number; weekday: string }) {
  switch (freq) {
    case 'minutes':
      return { type: 'interval' as const, args: { minutes: opts.intervalValue } };
    case 'hours':
      return { type: 'interval' as const, args: { hours: opts.intervalValue } };
    case 'daily':
      return { type: 'cron' as const, args: { hour: opts.hour, minute: opts.minute } };
    case 'weekly':
      return { type: 'cron' as const, args: { day_of_week: opts.weekday, hour: opts.hour, minute: opts.minute } };
  }
}

function describeSchedule(
  freq: Frequency,
  opts: { intervalValue: number; hour: number; minute: number; weekday: string },
  t: TFn,
): string {
  const time = `${String(opts.hour).padStart(2, '0')}:${String(opts.minute).padStart(2, '0')}`;
  switch (freq) {
    case 'minutes':
      return t('sched.descMinutes', { n: opts.intervalValue });
    case 'hours':
      return t('sched.descHours', { n: opts.intervalValue });
    case 'daily':
      return t('sched.descDaily', { time });
    case 'weekly':
      return t('sched.descWeekly', { day: t(`sched.${opts.weekday}`), time });
  }
}

function NewTaskForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [intervalValue, setIntervalValue] = useState(30);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState('mon');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError(t('sched.nameRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trigger = buildTrigger(frequency, { intervalValue, hour, minute, weekday });
      await createScheduledTask({
        name: name.trim(),
        prompt: prompt.trim(),
        trigger_type: trigger.type,
        trigger_args: trigger.args,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sched.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary-800/30 bg-primary-950/10 p-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          {t('sched.name')}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('sched.namePlaceholder')}
          className="w-full rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          {t('sched.prompt')}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('sched.promptPlaceholder')}
          rows={2}
          className="w-full resize-none rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50"
        />
      </div>

      {/* ── Frequency selector ─────────────────────────────── */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          {t('sched.run')}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {([
            { value: 'minutes', label: t('sched.freqMinutes') },
            { value: 'hours', label: t('sched.freqHours') },
            { value: 'daily', label: t('sched.freqDaily') },
            { value: 'weekly', label: t('sched.freqWeekly') },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFrequency(opt.value)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                frequency === opt.value
                  ? 'bg-primary-900/50 text-primary-400 ring-1 ring-primary-700/50'
                  : 'text-surface-400 hover:bg-surface-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Interval controls ──────────────────────────────── */}
      {(frequency === 'minutes' || frequency === 'hours') && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-400">{t('sched.every')}</span>
          <input
            type="number"
            min={1}
            max={frequency === 'minutes' ? 1440 : 168}
            value={intervalValue}
            onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 rounded border border-surface-700/50 bg-surface-800 px-2 py-1.5 text-center text-xs text-surface-200 outline-none focus:border-primary-600/50"
          />
          <span className="text-xs text-surface-400">
            {frequency === 'minutes' ? t('sched.minutesUnit') : t('sched.hoursUnit')}
          </span>
        </div>
      )}

      {/* ── Day picker (weekly only) ───────────────────────── */}
      {frequency === 'weekly' && (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
            {t('sched.day')}
          </label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className={selectClass + ' w-full'}
          >
            {WEEKDAY_VALUES.map((d) => (
              <option key={d} value={d}>{t(`sched.${d}`)}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Time picker (daily / weekly) ───────────────────── */}
      {(frequency === 'daily' || frequency === 'weekly') && (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
            {t('sched.at')}
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={hour}
              onChange={(e) => setHour(parseInt(e.target.value))}
              className={selectClass + ' w-16 text-center'}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
              ))}
            </select>
            <span className="text-xs font-bold text-surface-400">:</span>
            <select
              value={minute}
              onChange={(e) => setMinute(parseInt(e.target.value))}
              className={selectClass + ' w-16 text-center'}
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Preview ────────────────────────────────────────── */}
      <p className="rounded bg-surface-800/50 px-2.5 py-1.5 text-[11px] text-primary-400">
        {describeSchedule(frequency, { intervalValue, hour, minute, weekday }, t)}
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-800/50 bg-red-950/30 px-2.5 py-1.5">
          <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
          <p className="text-[11px] text-red-300">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('sched.cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          {t('sched.create')}
        </Button>
      </div>
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────── */

interface SchedulerPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SchedulerPanel({ open, onClose }: SchedulerPanelProps) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getScheduledTasks();
      setTasks(res.tasks);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadTasks();
      setShowForm(false);
    }
  }, [open, loadTasks]);

  const handleToggle = async (task: ScheduledTask) => {
    try {
      const updated = await updateScheduledTask(task.id, { enabled: !task.enabled });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteScheduledTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('sched.title')}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto scrollbar-thin">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-surface-300">
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            {t('sched.tasks', { n: tasks.length })}
          </h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={loadTasks} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(!showForm)}
              className="gap-1"
            >
              {showForm ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {showForm ? t('sched.hide') : t('sched.new')}
            </Button>
          </div>
        </div>

        {/* New task form */}
        {showForm && (
          <NewTaskForm
            onCreated={() => {
              setShowForm(false);
              loadTasks();
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Task list */}
        {tasks.length === 0 && !loading ? (
          <p className="py-4 text-center text-[11px] text-surface-500">
            {t('sched.empty')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
