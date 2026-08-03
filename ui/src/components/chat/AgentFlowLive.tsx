import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Wrench,
  X,
} from 'lucide-react';
import type { AgentPlanTask } from '@/lib/types';

export interface TaskStateInfo {
  state: 'pending' | 'working' | 'completed' | 'failed';
  agent?: string;
  skill?: string;
  goal?: string;
  artifact?: string;
  error?: string;
  elapsed_seconds?: number;
  tools?: { name: string; result?: string }[];
}

interface AgentFlowLiveProps {
  plan: AgentPlanTask[];
  taskStates: Record<string, TaskStateInfo>;
  /** Folded by default — used when this diagram belongs to a settled message. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

/** Friendly display name per skill namespace — same language as the landing page's A2AFlow. */
function agentTitle(skill: string): string {
  const ns = skill.split('.', 1)[0];
  switch (ns) {
    case 'calendar':
      return 'Calendar agent';
    case 'web':
    case 'research':
      return 'Research agent';
    case 'docs':
    case 'documents':
      return 'Documents agent';
    case 'advice':
    case 'advisor':
      return 'Advisor agent';
    default:
      return 'Agent';
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
    default:
      return <Bot className={className} />;
  }
}

const STATE_STYLE: Record<TaskStateInfo['state'], { ring: string; icon: string; label: string; text: string }> = {
  pending: { ring: 'border-surface-700/40 bg-surface-900/40 hover:border-surface-600/60', icon: 'bg-surface-800/80 text-surface-500', label: 'Waiting', text: 'text-surface-500' },
  working: { ring: 'border-primary-600/60 bg-surface-800/70 shadow-lg shadow-primary-500/10', icon: 'bg-primary-500/20 text-primary-300', label: 'Working', text: 'text-primary-400' },
  completed: { ring: 'border-emerald-800/50 bg-surface-900/60 hover:border-emerald-700/60', icon: 'bg-emerald-950/50 text-emerald-400', label: 'Completed', text: 'text-emerald-400' },
  failed: { ring: 'border-red-900/50 bg-surface-900/60 hover:border-red-800/60', icon: 'bg-red-950/50 text-red-400', label: 'Failed', text: 'text-red-400' },
};

function StatusPill({ state }: { state: TaskStateInfo['state'] }) {
  const style = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.text}`}>
      {state === 'working' && <Loader2 className="h-3 w-3 animate-spin" />}
      {state === 'completed' && <Check className="h-3 w-3" />}
      {state === 'failed' && <X className="h-3 w-3" />}
      {state === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-surface-600" />}
      {style.label}
    </span>
  );
}

/** Groups tasks into left-to-right "waves" by dependency depth — the same
 * order the executor actually runs them in, so the diagram reads as a real
 * flow chart rather than an arbitrary list. */
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

function NodeBox({
  task,
  info,
  active,
  onActivate,
}: {
  task: AgentPlanTask;
  info: TaskStateInfo;
  active: boolean;
  onActivate: () => void;
}) {
  const style = STATE_STYLE[info.state];

  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      className={`group relative flex w-44 shrink-0 cursor-pointer flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition-all duration-300 ${style.ring} ${
        active ? 'ring-1 ring-primary-500/40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${style.icon}`}>
          <SkillIcon skill={task.skill} className="h-4 w-4" />
        </span>
        {info.state === 'working' && (
          <motion.span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-surface-100">{agentTitle(task.skill)}</div>
        <div className="truncate font-mono text-[10px] text-surface-600">{task.skill}</div>
      </div>
      <StatusPill state={info.state} />

      {active && (
        <motion.span
          layoutId="agent-flow-active-marker"
          className="absolute -left-px top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary-400"
        />
      )}
    </button>
  );
}

function WaveConnector({ animate }: { animate: boolean }) {
  return (
    <div className="flex w-8 shrink-0 items-center justify-center self-stretch">
      <div className="relative h-px w-full bg-gradient-to-r from-surface-700/60 to-surface-700/60">
        {animate && (
          <motion.span
            className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-primary-400 shadow-[0_0_6px] shadow-primary-400"
            animate={{ left: ['-4px', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 -ml-1 text-surface-600" />
    </div>
  );
}

/** Rich detail card for whichever step is active — mirrors the landing
 * page's A2AFlow detail panel so the two feel like the same product. */
function DetailPanel({ task, info }: { task: AgentPlanTask; info: TaskStateInfo }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={task.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="rounded-xl border border-surface-700/40 bg-surface-900/70 p-3.5"
      >
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STATE_STYLE[info.state].icon}`}>
            <SkillIcon skill={task.skill} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-surface-100">{agentTitle(task.skill)}</span>
              <span className="font-mono text-[10px] text-surface-500">{task.skill}</span>
              <StatusPill state={info.state} />
              {info.elapsed_seconds != null && (
                <span className="text-[10px] text-surface-500">{info.elapsed_seconds}s</span>
              )}
            </div>
            {task.depends_on.length > 0 && (
              <div className="mt-0.5 text-[10px] text-surface-600">waits on {task.depends_on.join(', ')}</div>
            )}
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-surface-300">{task.goal}</p>

        {(info.tools?.length ?? 0) > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-surface-500">
              {info.state === 'working' ? 'Working on' : 'Used'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {info.tools!.map((tool, i) => (
                <span
                  key={`${tool.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-surface-300"
                >
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
              {info.state === 'failed' ? 'Error' : 'Result'}
            </div>
            <div
              className={`max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 py-2 pl-3 pr-2 text-[11px] leading-relaxed scrollbar-thin ${
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
          <p className="mt-3 text-[11px] text-surface-500">Waiting for its dependencies to finish.</p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Horizontal flow-chart visualisation of an orchestrator run.
 *
 * Steps are grouped into left-to-right waves by dependency depth — the same
 * order the executor runs them in — so independent agents sit side by side
 * and dependants appear one column to the right. Hovering (or tapping) a box
 * pins the detail panel below to that step: title, goal, live status, the
 * tools it's calling, and its result or error.
 */
export function AgentFlowLive({ plan, taskStates, collapsible = false, defaultCollapsed = false }: AgentFlowLiveProps) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const [pinned, setPinned] = useState<string | null>(null);

  const waves = useMemo(() => computeWaves(plan), [plan]);

  if (plan.length === 0) return null;

  const completed = plan.filter((t) => taskStates[t.id]?.state === 'completed').length;
  const failed = plan.filter((t) => taskStates[t.id]?.state === 'failed').length;
  const working = plan.filter((t) => taskStates[t.id]?.state === 'working').length;
  const done = completed + failed === plan.length;

  const activeTask =
    plan.find((t) => t.id === pinned) ??
    plan.find((t) => taskStates[t.id]?.state === 'working') ??
    plan.find((t) => taskStates[t.id]?.state === 'failed') ??
    plan[0];
  const activeInfo = taskStates[activeTask.id] ?? { state: 'pending' as const };

  return (
    <div className="rounded-2xl border border-surface-700/30 bg-surface-950/50 p-3.5">
      <button
        type="button"
        onClick={() => collapsible && setCollapsed((v) => !v)}
        className={`flex w-full items-center gap-2 px-0.5 py-0.5 text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Bot className="h-4 w-4 shrink-0 text-primary-400/80" />
        <span className="text-xs font-semibold uppercase tracking-widest text-surface-400">
          NOVA orchestrated {plan.length} agent{plan.length > 1 ? 's' : ''}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-surface-500">
          {done
            ? failed > 0
              ? `${completed}/${plan.length} completed · ${failed} failed`
              : `${completed}/${plan.length} completed`
            : `${working} running…`}
        </span>
        {collapsible && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-surface-600 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-3.5 flex items-stretch gap-0 overflow-x-auto pb-2 scrollbar-thin"
              onMouseLeave={() => setPinned(null)}
            >
              {waves.map((wave, wi) => (
                <div key={wi} className="flex items-stretch">
                  {wi > 0 && <WaveConnector animate={!done} />}
                  <div className="flex flex-col justify-center gap-2">
                    {wave.map((task) => (
                      <NodeBox
                        key={task.id}
                        task={task}
                        info={taskStates[task.id] ?? { state: 'pending' }}
                        active={activeTask.id === task.id}
                        onActivate={() => setPinned(task.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-1">
              <DetailPanel task={activeTask} info={activeInfo} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
