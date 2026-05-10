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
import {
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getTaskExecutionLogs,
} from '@/lib/api';
import type { ScheduledTask, TaskExecution } from '@/lib/types';

/* ── Helpers ──────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return '--';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function triggerLabel(task: ScheduledTask): string {
  const args = task.trigger_args as Record<string, unknown>;
  if (task.trigger_type === 'interval') {
    if (args.hours) return `every ${args.hours}h`;
    if (args.minutes) return `every ${args.minutes}m`;
    if (args.seconds) return `every ${args.seconds}s`;
    return 'interval';
  }
  // cron
  const parts = ['minute', 'hour', 'day', 'month', 'day_of_week']
    .filter((k) => args[k] !== undefined)
    .map((k) => `${k}=${args[k]}`)
    .join(' ');
  return parts || 'cron';
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
  if (logs.length === 0) return <p className="py-2 text-center text-[10px] text-surface-500">No executions yet</p>;

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
          title={task.enabled ? 'Pause task' : 'Enable task'}
        >
          {task.enabled ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-surface-200">{task.name}</p>
          <p className="truncate text-[10px] text-surface-500">{task.prompt}</p>
        </div>

        <span className="shrink-0 rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-400">
          {triggerLabel(task)}
        </span>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-surface-300"
          title="Execution logs"
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
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-red-400"
            title="Delete task"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="mt-1 flex gap-3 text-[10px] text-surface-500">
        <span>last: {relativeTime(task.last_run_at)}</span>
        {task.created_at && <span>created: {new Date(task.created_at).toLocaleDateString()}</span>}
      </div>

      {showLogs && <ExecutionLogs taskId={task.id} />}
    </div>
  );
}

/* ── New task form ─────────────────────────────────────────── */

function NewTaskForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [triggerType, setTriggerType] = useState<'interval' | 'cron'>('interval');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCronArgs = (expr: string): Record<string, string> => {
    const parts = expr.trim().split(/\s+/);
    const keys = ['minute', 'hour', 'day', 'month', 'day_of_week'];
    const args: Record<string, string> = {};
    parts.forEach((v, i) => {
      if (i < keys.length && v !== '*') args[keys[i]] = v;
    });
    return args;
  };

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError('Name and prompt are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const triggerArgs =
        triggerType === 'interval'
          ? { minutes: intervalMinutes }
          : parseCronArgs(cronExpr);

      await createScheduledTask({
        name: name.trim(),
        prompt: prompt.trim(),
        trigger_type: triggerType,
        trigger_args: triggerArgs,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary-800/30 bg-primary-950/10 p-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Daily summary"
          className="w-full rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Summarize today's pending tasks and send a report"
          rows={2}
          className="w-full resize-none rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
          Trigger
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setTriggerType('interval')}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              triggerType === 'interval'
                ? 'bg-primary-900/50 text-primary-400 ring-1 ring-primary-700/50'
                : 'text-surface-400 hover:bg-surface-700'
            }`}
          >
            Interval
          </button>
          <button
            onClick={() => setTriggerType('cron')}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              triggerType === 'cron'
                ? 'bg-primary-900/50 text-primary-400 ring-1 ring-primary-700/50'
                : 'text-surface-400 hover:bg-surface-700'
            }`}
          >
            Cron
          </button>
        </div>
      </div>

      {triggerType === 'interval' ? (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
            Every (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 text-xs text-surface-200 outline-none focus:border-primary-600/50"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-surface-400">
            Cron expression (min hour day month dow)
          </label>
          <input
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full rounded border border-surface-700/50 bg-surface-800 px-2.5 py-1.5 font-mono text-xs text-surface-200 outline-none focus:border-primary-600/50"
          />
          <p className="mt-0.5 text-[10px] text-surface-500">e.g. "0 9 * * *" = daily at 9 AM</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-800/50 bg-red-950/30 px-2.5 py-1.5">
          <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
          <p className="text-[11px] text-red-300">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Create
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
    <Modal open={open} onClose={onClose} title="Scheduled Tasks">
      <div className="max-h-[60vh] space-y-4 overflow-y-auto scrollbar-thin">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-surface-300">
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            Tasks ({tasks.length})
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
              {showForm ? 'Hide' : 'New'}
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
            No scheduled tasks yet. Create one to run agent prompts autonomously.
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
