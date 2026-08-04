import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Ban,
  Bot,
  CalendarPlus,
  Check,
  FileText,
  GitBranch,
  Globe,
  Lightbulb,
  Loader2,
  Mail,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  SkipForward,
  TimerOff,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/lib/i18n';
import type { AgentPlanTask, AgentTaskRuntimeState } from '@/lib/types';

/** Translator signature, so the plain helpers below can stay pure functions. */
type T = (key: string, vars?: Record<string, string | number>) => string;

/** Re-exported under the name the chat components have always used for it. */
export type TaskStateInfo = AgentTaskRuntimeState;

/* ── Shared bits ──────────────────────────────────────────── */

function agentTitle(skill: string, t: T): string {
  const ns = skill.split('.', 1)[0];
  switch (ns) {
    case 'calendar':
      return t('flow.agent.calendar');
    case 'web':
    case 'research':
      return t('flow.agent.research');
    case 'docs':
    case 'documents':
      return t('flow.agent.docs');
    case 'advice':
    case 'advisor':
      return t('flow.agent.advisor');
    case 'github':
      return t('flow.agent.github');
    case 'mail':
      return t('flow.agent.mail');
    default:
      return t('flow.agent.generic');
  }
}

/** Renders the icon element directly — a dynamically-picked component
 * reference (`const Icon = ...; <Icon />`) makes React treat it as a new
 * component type on every render. */
function SkillIcon({ skill, className }: { skill: string; className?: string }) {
  const ns = skill.split('.', 1)[0];
  switch (ns) {
    case 'calendar':
      return <CalendarPlus className={className} />;
    case 'web':
    case 'research':
      return <Globe className={className} />;
    case 'docs':
    case 'documents':
      return <FileText className={className} />;
    case 'advice':
    case 'advisor':
      return <Lightbulb className={className} />;
    case 'github':
      return <GitBranch className={className} />;
    case 'mail':
      return <Mail className={className} />;
    default:
      return <Bot className={className} />;
  }
}

const STATE_STYLE: Record<TaskStateInfo['state'], { ring: string; icon: string; label: string; text: string; line: string }> = {
  pending: { ring: 'border-surface-700/40 bg-surface-900/40', icon: 'bg-surface-800/80 text-surface-500', label: 'flow.stPending', text: 'text-surface-500', line: '#3f3f46' },
  working: { ring: 'border-primary-600/60 bg-surface-800/70 shadow-md shadow-primary-500/10', icon: 'bg-primary-500/20 text-primary-300', label: 'flow.stWorking', text: 'text-primary-400', line: '#4ade80' },
  completed: { ring: 'border-emerald-800/50 bg-surface-900/60', icon: 'bg-emerald-950/50 text-emerald-400', label: 'flow.stCompleted', text: 'text-emerald-400', line: '#10b981' },
  failed: { ring: 'border-red-900/50 bg-surface-900/60', icon: 'bg-red-950/50 text-red-400', label: 'flow.stFailed', text: 'text-red-400', line: '#ef4444' },
  canceled: { ring: 'border-surface-700/50 bg-surface-900/50', icon: 'bg-surface-800/80 text-surface-500', label: 'flow.stCanceled', text: 'text-surface-500', line: '#52525b' },
  // Deliberately not red: a skipped task is not broken, it was never attempted.
  skipped: { ring: 'border-amber-900/40 bg-surface-900/50', icon: 'bg-amber-950/40 text-amber-500/80', label: 'flow.stSkipped', text: 'text-amber-500/80', line: '#a16207' },
};

function StatusPill({ state }: { state: TaskStateInfo['state'] }) {
  const { t } = useI18n();
  const style = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.text}`}>
      {state === 'working' && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === 'completed' && <Check className="h-3 w-3" />}
      {state === 'failed' && <X className="h-3 w-3" />}
      {state === 'canceled' && <Ban className="h-3 w-3" />}
      {state === 'skipped' && <SkipForward className="h-3 w-3" />}
      {state === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-surface-600" />}
      {t(style.label)}
    </span>
  );
}

/** One line describing what an agent is doing right now — the closest thing
 * to "live thinking" the backend actually exposes: workers don't stream
 * reasoning tokens (only the aggregator's final answer streams, by design —
 * otherwise several agents' raw output would interleave in the chat), but
 * each tool call it makes is a real-time signal of current activity. */
function currentActivity(info: TaskStateInfo, t: T): string {
  if (info.state === 'pending') return t('flow.actWaitingDeps');
  const tools = info.tools ?? [];
  const inFlight = [...tools].reverse().find((tool) => tool.result === undefined);
  if (inFlight) return t('flow.actCalling', { tool: inFlight.name.replace(/_/g, ' ') });
  if (info.state === 'working') return t(tools.length > 0 ? 'flow.actReviewing' : 'flow.actWorking');
  if (info.state === 'completed') return info.artifact?.slice(0, 220) || t('flow.actCompleted');
  if (info.state === 'failed') return info.error?.slice(0, 220) || t('flow.actFailed');
  return '';
}

/** Total tokens one agent spent, in whichever naming its provider reported. */
function taskTokens(info: TaskStateInfo): number | null {
  const usage = info.token_usage;
  if (!usage) return null;
  const total =
    (usage.total_tokens as number | undefined) ??
    ((usage.prompt_tokens as number | undefined) ?? usage.input_tokens ?? 0) +
      ((usage.completion_tokens as number | undefined) ?? usage.output_tokens ?? 0);
  return total > 0 ? total : null;
}

function agentsSummary(plan: AgentPlanTask[], taskStates: Record<string, TaskStateInfo>) {
  const countOf = (state: TaskStateInfo['state']) =>
    plan.filter((task) => taskStates[task.id]?.state === state).length;
  const completed = countOf('completed');
  const failed = countOf('failed');
  const canceled = countOf('canceled') + countOf('skipped');
  const working = countOf('working');
  const settled = completed + failed + canceled;
  return {
    completed,
    failed,
    canceled,
    working,
    settled,
    done: settled === plan.length,
    /** 0–1, for the progress bar: a long run needs a sense of how far along it is. */
    progress: plan.length > 0 ? settled / plan.length : 0,
  };
}

/** Groups tasks into left-to-right "waves" by dependency depth — the same
 * order the executor actually runs them in. */
function computeWaves(plan: AgentPlanTask[]): AgentPlanTask[][] {
  const byId = new Map(plan.map((t) => [t.id, t]));
  const depthOf = new Map<string, number>();

  function depth(id: string, guard: Set<string>): number {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (guard.has(id)) return 0; // defensive: a cycle should never reach the UI
    const task = byId.get(id);
    if (!task || task.depends_on.length === 0) {
      depthOf.set(id, 0);
      return 0;
    }
    guard.add(id);
    const d = 1 + Math.max(...task.depends_on.map((dep) => depth(dep, guard)));
    depthOf.set(id, d);
    return d;
  }

  for (const task of plan) depth(task.id, new Set());
  const maxDepth = Math.max(0, ...plan.map((t) => depthOf.get(t.id) ?? 0));
  const waves: AgentPlanTask[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const task of plan) waves[depthOf.get(task.id) ?? 0].push(task);
  return waves;
}

/** Position of `el`, in unscaled layout pixels relative to `ancestor`.
 * `offsetLeft`/`offsetTop` are layout properties — unaffected by a CSS
 * `transform: scale()` on an intermediate wrapper — which is what lets the
 * connector lines stay correct at any zoom level without recomputing on
 * every zoom change. */
function relativePosition(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/* ── Cursor-following hover detail ───────────────────────────────────── */

function HoverDetail({
  title,
  skill,
  goal,
  info,
  x,
  y,
}: {
  title: string;
  skill: string;
  goal: string;
  info: TaskStateInfo;
  x: number;
  y: number;
}) {
  const { t } = useI18n();
  const TOOLTIP_W = 288;
  const TOOLTIP_H = 220;
  const left = Math.min(x + 18, window.innerWidth - TOOLTIP_W - 8);
  const top = Math.min(y + 18, window.innerHeight - TOOLTIP_H - 8);

  return createPortal(
    <div
      className="pointer-events-none fixed z-[70] w-[288px] rounded-xl border border-surface-700/50 bg-surface-900/95 p-3.5 shadow-2xl backdrop-blur-sm"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${STATE_STYLE[info.state].icon}`}>
          <SkillIcon skill={skill} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-surface-100">{title}</div>
          <StatusPill state={info.state} />
        </div>
        {info.elapsed_seconds != null && <span className="shrink-0 text-[10px] text-surface-500">{info.elapsed_seconds}s</span>}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-surface-400">{goal}</p>
      {(info.tools?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {info.tools!.slice(-4).map((tool, i) => (
            <span key={`${tool.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-surface-800/80 px-1.5 py-0.5 text-[9px] text-surface-300">
              <Wrench className="h-2.5 w-2.5" />
              {tool.name.replace(/_/g, ' ')}
              {tool.result === undefined && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            </span>
          ))}
        </div>
      )}
      <p
        className={`mt-2 max-h-24 overflow-hidden whitespace-pre-wrap text-[11px] leading-relaxed ${
          info.state === 'failed' ? 'text-red-300' : 'text-surface-300'
        }`}
      >
        {currentActivity(info, t)}
      </p>
    </div>,
    document.body,
  );
}

/* ── Click-to-open full detail ────────────────────────────────────────── */

function TaskDetailModal({
  open,
  onClose,
  task,
  info,
}: {
  open: boolean;
  onClose: () => void;
  task: AgentPlanTask | null;
  info: TaskStateInfo;
}) {
  const { t } = useI18n();
  if (!task) return null;
  return (
    // z-[60]: the expanded diagram overlay sits at z-50 and this opens on top of it.
    <Modal
      open={open}
      onClose={onClose}
      title={t('flow.agentSuffix', { agent: agentTitle(task.skill, t) })}
      maxWidthClassName="max-w-2xl"
      zIndexClassName="z-[60]"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-surface-500">{task.skill}</span>
        <StatusPill state={info.state} />
        {info.elapsed_seconds != null && <span className="text-[10px] text-surface-500">{info.elapsed_seconds}s</span>}
        {taskTokens(info) != null && (
          <span className="inline-flex items-center gap-1 text-[10px] text-surface-500">
            <Zap className="h-2.5 w-2.5 text-primary-600" />
            {taskTokens(info)!.toLocaleString()} {t('flow.tokens')}
          </span>
        )}
      </div>

      {/* A task can be completed *and* have been cut short — saying so is the
          difference between a thin answer and an unexplained one. */}
      {info.budget_note && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-900/40 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-300/90">
          <TimerOff className="mt-px h-3 w-3 shrink-0" />
          <span>{t('flow.budgetNote', { note: info.budget_note })}</span>
        </div>
      )}
      {task.depends_on.length > 0 && (
        <div className="mt-1 text-[11px] text-surface-600">
          {t('flow.waitsOn', { ids: task.depends_on.join(', ') })}
        </div>
      )}
      {info.repairs && (
        <div className="mt-1 text-[11px] text-surface-600">{t('flow.repairsOf', { id: info.repairs })}</div>
      )}

      <p className="mt-3 text-[13px] leading-relaxed text-surface-300">{task.goal}</p>

      {(info.tools?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-surface-500">
            {t(info.state === 'working' ? 'flow.liveLog' : 'flow.toolsUsed')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {info.tools!.map((tool, i) => (
              <span key={`${tool.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-surface-300">
                <Wrench className="h-2.5 w-2.5" />
                {tool.name.replace(/_/g, ' ')}
                {tool.result === undefined && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {(info.artifact || info.error) && (
        <div className="mt-3">
          <div className={`mb-1 text-[10px] uppercase tracking-widest ${info.state === 'failed' ? 'text-red-400/80' : 'text-primary-400/80'}`}>
            {t(info.state === 'failed' ? 'flow.error' : 'flow.result')}
          </div>
          <div
            className={`max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 py-2.5 pl-3 pr-2 text-[12.5px] leading-relaxed scrollbar-thin ${
              info.state === 'failed'
                ? 'border-red-500/50 bg-red-950/20 text-red-300'
                : 'border-primary-500/50 bg-surface-800/40 text-surface-400'
            }`}
          >
            {info.error || info.artifact}
          </div>
        </div>
      )}

      {info.state === 'pending' && !info.artifact && !info.error && (
        <p className="mt-3 text-[12px] text-surface-500">{t('flow.actWaitingDeps')}</p>
      )}
    </Modal>
  );
}

/* ── Node cards ───────────────────────────────────────────────────────── */

function RootNode({
  innerRef,
  plan,
  running,
}: {
  innerRef: (el: HTMLDivElement | null) => void;
  plan: AgentPlanTask[];
  running: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      ref={innerRef}
      data-node
      className={`relative flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${
        running ? 'border-primary-600/70 bg-primary-950/60' : 'border-primary-700/40 bg-primary-950/30'
      }`}
    >
      {running && (
        <motion.span
          className="absolute inset-0 rounded-full ring-1 ring-primary-500/60"
          animate={{ opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <Bot className="h-4 w-4 text-primary-400" />
      <span className="text-[11px] font-semibold text-primary-300">NOVA</span>
      <span className="text-[10px] text-surface-500">
        {plan.length === 1 ? t('flow.agentsOne') : t('flow.agents', { n: plan.length })}
      </span>
    </div>
  );
}

function TaskNode({
  innerRef,
  task,
  info,
  onHoverMove,
  onHoverEnd,
  onClick,
}: {
  innerRef: (el: HTMLButtonElement | null) => void;
  task: AgentPlanTask;
  info: TaskStateInfo;
  onHoverMove: (e: ReactMouseEvent) => void;
  onHoverEnd: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const style = STATE_STYLE[info.state];
  const activeTool = [...(info.tools ?? [])].reverse().find((tool) => tool.result === undefined);
  return (
    <button
      type="button"
      ref={innerRef}
      data-node
      onMouseMove={onHoverMove}
      onMouseLeave={onHoverEnd}
      onClick={onClick}
      className={`relative flex w-28 cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors hover:brightness-125 ${style.ring}`}
    >
      {/* A working agent keeps breathing so the diagram reads as live even
          when no new tool call has landed for a while. */}
      {info.state === 'working' && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary-500/70"
          animate={{ opacity: [0.2, 0.85, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.icon}`}>
        {info.state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkillIcon skill={task.skill} className="h-4 w-4" />}
      </span>
      <span className="w-full truncate text-[11px] font-medium text-surface-200">{agentTitle(task.skill, t)}</span>
      <span className={`w-full truncate text-[9px] leading-tight ${style.text}`}>
        {activeTool
          ? activeTool.name.replace(/_/g, ' ')
          : `${info.elapsed_seconds != null ? `${info.elapsed_seconds}s · ` : ''}${t(style.label).toLowerCase()}`}
      </span>
    </button>
  );
}

/* ── Live activity log ────────────────────────────────────────────────── */

type LogKind = 'start' | 'tool' | 'tool-done' | 'done' | 'fail';

interface LogEntry {
  key: string;
  taskId: string;
  agent: string;
  skill: string;
  text: string;
  kind: LogKind;
}

const LOG_KIND_STYLE: Record<LogKind, string> = {
  start: 'text-primary-300',
  tool: 'text-surface-300',
  'tool-done': 'text-surface-500',
  done: 'text-emerald-400',
  fail: 'text-red-400',
};

/**
 * Every event visible in the current task state, ordered so it reads like a
 * live feed: by dependency wave first, then by how far into its own run each
 * agent was. Agents in the same wave execute in parallel, so interleaving them
 * step by step is much closer to the real chronology than listing one agent's
 * whole run before the next one's — and unlike tracking arrival order, it is a
 * pure function of the state, so a reloaded conversation shows the same log.
 */
function buildLog(
  plan: AgentPlanTask[],
  taskStates: Record<string, TaskStateInfo>,
  waveOf: Map<string, number>,
  t: T,
): LogEntry[] {
  const entries: (LogEntry & { rank: number })[] = [];

  plan.forEach((task, taskIndex) => {
    const info = taskStates[task.id];
    if (!info) return;
    const wave = waveOf.get(task.id) ?? 0;
    const base = { taskId: task.id, agent: agentTitle(task.skill, t), skill: task.skill };
    // wave ≫ step ≫ task keeps the ordering stable while still interleaving.
    const push = (key: string, step: number, text: string, kind: LogKind) =>
      entries.push({ key, text, kind, ...base, rank: wave * 1e6 + step * 1e3 + taskIndex });

    if (info.repairs) push(`${task.id}:repairs`, -1, t('flow.evRepairs', { id: info.repairs }), 'start');
    if (info.state !== 'pending') push(`${task.id}:start`, 0, t('flow.evStarted'), 'start');
    if (info.attempt && info.attempt > 1) {
      push(
        `${task.id}:attempt:${info.attempt}`,
        0,
        t('flow.evRetry', { attempt: info.attempt, of: info.attempts_allowed ?? info.attempt }),
        'fail',
      );
    }
    (info.tools ?? []).forEach((tool, i) => {
      const name = tool.name.replace(/_/g, ' ');
      push(`${task.id}:tool:${i}`, 1 + i * 2, t('flow.evCalling', { tool: name }), 'tool');
      if (tool.result !== undefined) {
        push(`${task.id}:tool:${i}:done`, 2 + i * 2, t('flow.evReturned', { tool: name }), 'tool-done');
      }
    });
    if (info.budget_note) push(`${task.id}:budget`, 899, t('flow.evBudget'), 'fail');
    if (info.state === 'completed') push(`${task.id}:end`, 900, t('flow.evFinished'), 'done');
    if (info.state === 'failed') push(`${task.id}:end`, 900, info.error?.slice(0, 140) || t('flow.evFailed'), 'fail');
    if (info.state === 'canceled') push(`${task.id}:end`, 900, t('flow.evCanceled'), 'fail');
    if (info.state === 'skipped') push(`${task.id}:end`, 900, info.error || t('flow.evSkipped'), 'fail');
  });

  return entries.sort((a, b) => a.rank - b.rank);
}

function LiveLog({ entries, running }: { entries: LogEntry[]; running: boolean }) {
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest text-surface-500">
        <Activity className="h-3 w-3" />
        {t('flow.activity')}
        {running && (
          <motion.span
            className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-none">
        {entries.length === 0 ? (
          <p className="text-[11px] text-surface-600">{t('flow.activityEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.key} className="flex gap-1.5 text-[11px] leading-snug">
                <SkillIcon skill={entry.skill} className="mt-[3px] h-2.5 w-2.5 shrink-0 text-surface-500" />
                <span className="min-w-0">
                  <span className="font-medium text-surface-300">{entry.agent}</span>{' '}
                  <span className={LOG_KIND_STYLE[entry.kind]}>{entry.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ── The diagram ──────────────────────────────────────────────────────── */

/** Geometry only — the colour is resolved at render time from live task state,
 * so an edge lights up the moment its target agent changes state. */
interface Edge {
  key: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface AgentFlowProps {
  plan: AgentPlanTask[];
  taskStates: Record<string, TaskStateInfo>;
}

/**
 * Width cap for message bubbles. The conversation column itself is wider than
 * this (see `ChatArea`) so the flow diagram has room to breathe; text stays at
 * a readable measure by opting into this class instead.
 */
export const MESSAGE_COLUMN_CLASS = 'mx-auto w-full max-w-3xl';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
/** The fullscreen view exists to see the diagram big — start it zoomed in. */
const EXPANDED_ZOOM = 1.8;

/**
 * Inline branching flow diagram: NOVA at the root, fanning out into the
 * agents the orchestrator dispatched, wired by actual dependency (not just
 * wave order) so a task only connects to the specific step it waited on.
 * Cards show just an icon and a name; hover previews everything else next to
 * the cursor. Pan by dragging or scrolling, zoom with the controls, the
 * wheel, or a pinch gesture.
 */
export function AgentFlow({ plan, taskStates }: AgentFlowProps) {
  const { t } = useI18n();
  // Inline and fullscreen keep their own zoom: the big view opens zoomed in,
  // and closing it must not drag that zoom back into the chat.
  const [inlineZoom, setInlineZoom] = useState(1);
  const [expandedZoom, setExpandedZoom] = useState(EXPANDED_ZOOM);
  const [hover, setHover] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
  const [expanded, setExpanded] = useState(false);
  const [clickedTaskId, setClickedTaskId] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const waves = useMemo(() => computeWaves(plan), [plan]);
  const waveOf = useMemo(() => {
    const map = new Map<string, number>();
    waves.forEach((wave, i) => wave.forEach((task) => map.set(task.id, i)));
    return map;
  }, [waves]);
  const topology = plan.map((task) => `${task.id}:${task.depends_on.join(',')}`).join('|');
  const log = useMemo(() => buildLog(plan, taskStates, waveOf, t), [plan, taskStates, waveOf, t]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const root = rootRef.current;
    if (!wrapper || !root) return;

    const rootPos = relativePosition(root, wrapper);
    const rootAnchor = { x: rootPos.x + root.offsetWidth / 2, y: rootPos.y + root.offsetHeight };

    const next: Edge[] = [];
    for (const task of plan) {
      const el = nodeRefs.current.get(task.id);
      if (!el) continue;
      const pos = relativePosition(el, wrapper);
      const top = { x: pos.x + el.offsetWidth / 2, y: pos.y };

      if (task.depends_on.length === 0) {
        next.push({ key: `root-${task.id}`, target: task.id, x1: rootAnchor.x, y1: rootAnchor.y, x2: top.x, y2: top.y });
      } else {
        for (const depId of task.depends_on) {
          const depEl = nodeRefs.current.get(depId);
          if (!depEl) continue;
          const depPos = relativePosition(depEl, wrapper);
          const depBottom = { x: depPos.x + depEl.offsetWidth / 2, y: depPos.y + depEl.offsetHeight };
          next.push({ key: `${depId}-${task.id}`, target: task.id, x1: depBottom.x, y1: depBottom.y, x2: top.x, y2: top.y });
        }
      }
    }
    setEdges(next);
    setContentSize({ w: wrapper.scrollWidth, h: wrapper.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, expanded]);

  if (plan.length === 0) return null;

  const { completed, failed, canceled, working, settled, done, progress } = agentsSummary(plan, taskStates);
  const running = !done;
  const spentTokens = plan.reduce(
    (total, task) => total + (taskTokens(taskStates[task.id] ?? { state: 'pending' }) ?? 0),
    0,
  );

  const zoom = expanded ? expandedZoom : inlineZoom;
  const setZoom = expanded ? setExpandedZoom : setInlineZoom;
  const zoomBy = (delta: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  const toggleExpanded = () => {
    setExpanded((wasExpanded) => {
      if (!wasExpanded) setExpandedZoom(EXPANDED_ZOOM);
      return !wasExpanded;
    });
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel still scrolls/pans normally
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    const vp = viewportRef.current;
    if (!vp) return;
    drag.current = { x: e.clientX, y: e.clientY, scrollLeft: vp.scrollLeft, scrollTop: vp.scrollTop };
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    if (!drag.current) return;
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollLeft = drag.current.scrollLeft - (e.clientX - drag.current.x);
    vp.scrollTop = drag.current.scrollTop - (e.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const hoveredTask = hover ? plan.find((t) => t.id === hover.taskId) : undefined;
  const clickedTask = clickedTaskId ? plan.find((t) => t.id === clickedTaskId) ?? null : null;

  const header = (
    <div className="flex items-center gap-2 border-b border-surface-800/60 px-3 py-2">
      <Bot className={`h-3.5 w-3.5 shrink-0 ${running ? 'text-primary-400' : 'text-surface-500'}`} />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-surface-400">
        {t('flow.title')}
      </span>
      <span className="hidden text-[11px] text-surface-600 sm:inline">·</span>
      <span className={`hidden text-[11px] sm:inline ${failed > 0 ? 'text-red-400' : running ? 'text-primary-400' : 'text-emerald-400'}`}>
        {done
          ? failed + canceled > 0
            ? t('flow.completedFailed', { done: completed, total: plan.length, failed: failed + canceled })
            : t('flow.completed', { done: completed, total: plan.length })
          : working === 1
            ? t('flow.runningOne')
            : t('flow.runningMany', { n: working })}
      </span>
      <span className="flex-1" />
      {/* Running cost: it climbs as each agent finishes, rather than appearing
          only once the whole turn has settled. */}
      {spentTokens > 0 && (
        <span className="mr-1 hidden items-center gap-1 text-[10px] text-surface-500 sm:inline-flex">
          <Zap className="h-2.5 w-2.5 text-primary-600" />
          {spentTokens.toLocaleString()} {t('flow.tokens')}
        </span>
      )}
      <div className="flex items-center gap-0.5 rounded-lg border border-surface-700/50 bg-surface-900/60 p-0.5">
        <button type="button" onClick={() => zoomBy(-ZOOM_STEP)} title={t('flow.zoomOut')} className="cursor-pointer rounded-md p-1 text-surface-400 hover:bg-surface-800 hover:text-surface-200">
          <Minus className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => setZoom(expanded ? EXPANDED_ZOOM : 1)} title={t('flow.zoomReset')} className="cursor-pointer rounded-md px-1.5 py-1 text-[10px] text-surface-400 hover:bg-surface-800 hover:text-surface-200">
          <RotateCcw className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} title={t('flow.zoomIn')} className="cursor-pointer rounded-md p-1 text-surface-400 hover:bg-surface-800 hover:text-surface-200">
          <Plus className="h-3 w-3" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-surface-700/60" />
        <button
          type="button"
          onClick={toggleExpanded}
          title={t(expanded ? 'flow.collapse' : 'flow.expand')}
          className="cursor-pointer rounded-md p-1 text-surface-400 hover:bg-surface-800 hover:text-surface-200"
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );

  const canvas = (
    <div
      ref={viewportRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      /* `scrollbar-none`: the canvas is panned by dragging or the wheel, so the
         bars are just noise on top of the diagram. `safe center` centres the
         diagram when it fits and falls back to start-alignment when it does
         not — plain centring would push the overflowing part out of reach. */
      className={`flex cursor-grab overflow-auto active:cursor-grabbing scrollbar-none [align-items:safe_center] [justify-content:safe_center] ${
        expanded ? 'h-full' : 'h-[300px]'
      }`}
    >
      {/* Reserves the *scaled* footprint in layout. The diagram itself is
          scaled by a transform, which leaves the layout box at 1× — without
          this spacer the centring above would work off the wrong size and the
          zoomed diagram would drift off to one side. */}
      <div
        className="relative shrink-0"
        style={{ width: contentSize.w * zoom || undefined, height: contentSize.h * zoom || undefined }}
      >
        <motion.div
          ref={wrapperRef}
          className="absolute left-0 top-0 inline-flex origin-top-left flex-col items-center gap-8 p-6"
          animate={{ scale: zoom }}
          transition={{ duration: 0.15 }}
        >
          <svg className="pointer-events-none absolute left-0 top-0" width={contentSize.w} height={contentSize.h}>
            {edges.map((edge) => {
              const midY = (edge.y1 + edge.y2) / 2;
              const state = taskStates[edge.target]?.state ?? 'pending';
              const active = state === 'working';
              return (
                <path
                  key={edge.key}
                  d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${midY}, ${edge.x2} ${midY}, ${edge.x2} ${edge.y2}`}
                  fill="none"
                  stroke={STATE_STYLE[state].line}
                  strokeWidth={active ? 2 : 1.5}
                  strokeOpacity={active ? 0.95 : 0.6}
                  strokeDasharray={active ? '5 5' : undefined}
                >
                  {/* Dashes crawl towards the agent that is currently working. */}
                  {active && (
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.9s" repeatCount="indefinite" />
                  )}
                </path>
              );
            })}
          </svg>

          <RootNode innerRef={(el) => { rootRef.current = el; }} plan={plan} running={working > 0} />

          {waves.map((wave, wi) => (
            <div key={wi} className="flex gap-4">
              {wave.map((task) => (
                <TaskNode
                  key={task.id}
                  innerRef={(el) => {
                    if (el) nodeRefs.current.set(task.id, el);
                    else nodeRefs.current.delete(task.id);
                  }}
                  task={task}
                  info={taskStates[task.id] ?? { state: 'pending' }}
                  onHoverMove={(e) => setHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                  onHoverEnd={() => setHover((h) => (h?.taskId === task.id ? null : h))}
                  onClick={() => setClickedTaskId(task.id)}
                />
              ))}
            </div>
          ))}
        </motion.div>
        </div>
    </div>
  );

  const body = (
    <div
      className={`flex min-h-0 select-none flex-col overflow-hidden rounded-2xl border bg-surface-950/70 transition-colors ${
        running
          ? 'border-primary-700/50 shadow-[0_0_30px_-14px_rgba(74,222,128,0.75)]'
          : failed > 0
            ? 'border-red-900/40'
            : 'border-surface-700/40'
      } ${expanded ? 'h-full w-full shadow-2xl' : ''}`}
    >
      {header}

      {/* Task-based progress: on a run that takes minutes, "3 of 5 settled" is
          the only honest answer to "how much longer", and a spinner is not. */}
      <div className="h-px w-full shrink-0 bg-surface-800/70">
        <motion.div
          className={`h-full ${failed > 0 ? 'bg-red-500/70' : 'bg-primary-500/80'}`}
          initial={false}
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          role="progressbar"
          aria-valuenow={settled}
          aria-valuemin={0}
          aria-valuemax={plan.length}
        />
      </div>

      {/* Side by side once expanded — the log is the point of the big view. */}
      <div className={`flex min-h-0 flex-1 ${expanded ? 'flex-row' : 'flex-col'}`}>
        <div className="min-h-0 min-w-0 flex-1">{canvas}</div>
        <div
          className={
            expanded
              ? 'flex w-72 shrink-0 flex-col border-l border-surface-800/60'
              : 'flex h-28 shrink-0 flex-col border-t border-surface-800/60'
          }
        >
          <LiveLog entries={log} running={running} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {expanded
        ? createPortal(
            <AnimatePresence>
              <motion.div
                className="fixed inset-0 z-50 p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setExpanded(false)} />
                <motion.div
                  className="relative z-10 h-full w-full"
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.98, opacity: 0 }}
                >
                  {body}
                </motion.div>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : body}

      {hoveredTask && (
        <HoverDetail
          title={agentTitle(hoveredTask.skill, t)}
          skill={hoveredTask.skill}
          goal={hoveredTask.goal}
          info={taskStates[hoveredTask.id] ?? { state: 'pending' }}
          x={hover!.x}
          y={hover!.y}
        />
      )}

      <TaskDetailModal
        open={clickedTask !== null}
        onClose={() => setClickedTaskId(null)}
        task={clickedTask}
        info={taskStates[clickedTaskId ?? ''] ?? { state: 'pending' }}
      />
    </>
  );
}
