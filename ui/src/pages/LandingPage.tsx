import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRoadmap, type RoadmapIssue, type RoadmapIteration } from '@/hooks/useRoadmap';
import {
  GoogleIcon,
  MicrosoftIcon,
  GitHubIcon,
  OllamaIcon,
  OpenAIIcon,
  AnthropicIcon,
} from '@/components/ui/BrandIcons';

const GITHUB_REPO = 'https://github.com/nova-ai-sys/nova-agent';
const GITHUB_PROFILE = 'https://github.com/thisisrobyn';
const IS_PROD = import.meta.env.PROD;

import {
  ArrowRight,
  Brain,
  Code,
  Database,
  FileSearch,
  Globe,
  MessageSquare,
  Clock,
  Plug,
  Terminal,
  Cpu,
  Layers,
  BookOpen,
  ExternalLink,
  Github,
  ChevronDown,
  Zap,
  Shield,
  Server,
  Lock,
  Sparkles,
  Link2,
  Network,
  Users,
  Check,
} from 'lucide-react';

import { A2AFlow } from '@/components/landing/A2AFlow';

/* ─── Animated Section Wrapper ─── */
function FadeInSection({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Animated Grid Background ─── */
function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(74, 222, 128, 0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74, 222, 128, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow top */}
      <div className="absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary-500/[0.07] blur-[120px]" />

      {/* Floating orbs */}
      <motion.div
        className="absolute top-[20%] left-[10%] h-[300px] w-[300px] rounded-full bg-primary-500/[0.04] blur-[80px]"
        animate={{ y: [0, 30, 0], x: [0, 15, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-[60%] right-[10%] h-[250px] w-[250px] rounded-full bg-primary-400/[0.03] blur-[80px]"
        animate={{ y: [0, -20, 0], x: [0, -10, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ─── NOVA acronym (easter egg) ───
   Hovering — or tapping, on touch — the wordmark spells the name out. The `O`
   is the one that is about to grow: orchestration is the next milestone, so it
   carries the hint. */
const ACRONYM = [
  { letter: 'N', word: 'eural' },
  { letter: 'O', word: 'rchestration' },
  { letter: 'V', word: 'irtual' },
  { letter: 'A', word: 'gent' },
];

function NovaAcronym() {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      className="relative inline-block cursor-help"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onClick={() => setRevealed((r) => !r)}
      title="Neural Orchestration & Virtual Agent"
    >
      <span className="bg-gradient-to-r from-primary-400 via-primary-300 to-emerald-300 bg-clip-text text-transparent">
        NOVA
      </span>

      <motion.span
        initial={false}
        animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : -6 }}
        transition={{ duration: 0.25 }}
        aria-hidden={!revealed}
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 flex-wrap justify-center gap-x-2 whitespace-nowrap rounded-lg border border-surface-700/50 bg-surface-900/95 px-3 py-1.5 text-xs font-normal tracking-normal shadow-xl shadow-black/40 backdrop-blur-sm sm:text-sm"
      >
        {ACRONYM.map(({ letter, word }) => (
          <span key={letter} className="text-surface-400">
            <span className="font-bold text-primary-400">{letter}</span>
            {word}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/* ─── Feature Card ─── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <FadeInSection delay={delay}>
      <div className="group relative h-full rounded-xl border border-surface-700/30 bg-surface-900/40 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary-700/40 hover:bg-surface-900/60 hover:shadow-lg hover:shadow-primary-500/5">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400 transition-colors group-hover:bg-primary-500/20">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-surface-100">{title}</h3>
        <p className="text-sm leading-relaxed text-surface-300">{description}</p>
      </div>
    </FadeInSection>
  );
}

/* ─── Architecture Layer ─── */
function ArchLayer({
  label,
  tech,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  tech: string;
  icon: React.ElementType;
  color: string;
  delay?: number;
}) {
  return (
    <FadeInSection delay={delay}>
      <div className="flex items-center gap-4 rounded-xl border border-surface-700/30 bg-surface-900/50 p-5 backdrop-blur-sm">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-6 w-6" style={{ color }} />
        </div>
        <div>
          <h4 className="font-semibold text-surface-100">{label}</h4>
          <p className="text-sm text-surface-400">{tech}</p>
        </div>
      </div>
    </FadeInSection>
  );
}

/* ─── Doc Preview Card ─── */
function DocCard({
  title,
  description,
  slug,
  delay = 0,
}: {
  title: string;
  description: string;
  slug: string;
  delay?: number;
}) {
  const navigate = useNavigate();
  return (
    <FadeInSection delay={delay}>
      <button
        onClick={() => navigate(`/docs/${slug}`)}
        className="group flex h-full w-full cursor-pointer flex-col rounded-xl border border-surface-700/30 bg-surface-900/40 p-5 text-left backdrop-blur-sm transition-all duration-300 hover:border-primary-700/40 hover:bg-surface-900/60"
      >
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary-500" />
          <h4 className="font-semibold text-surface-100 group-hover:text-primary-300 transition-colors">{title}</h4>
        </div>
        <p className="text-sm text-surface-400 leading-relaxed flex-1">{description}</p>
        <div className="mt-3 flex items-center gap-1 text-xs text-primary-500 opacity-0 transition-opacity group-hover:opacity-100">
          Read more <ArrowRight className="h-3 w-3" />
        </div>
      </button>
    </FadeInSection>
  );
}

/* ─── Stat Counter ─── */
function Stat({ value, label, delay = 0 }: { value: string; label: string; delay?: number }) {
  return (
    <FadeInSection delay={delay} className="text-center">
      <div className="text-3xl font-bold text-primary-400 text-glow">{value}</div>
      <div className="mt-1 text-sm text-surface-400">{label}</div>
    </FadeInSection>
  );
}

/* ─── Connected services ─── */
/* Kept in sync with `nova_mcp/servers/*.py` — the tool counts are the length of
   each module's `TOOLS` list, which is what the agent actually binds. */
const SERVICES = [
  {
    id: 'google',
    label: 'Google',
    icon: GoogleIcon,
    tools: 11,
    surfaces: ['Gmail', 'Calendar', 'Drive', 'Sheets', 'Docs'],
    detail: 'Read, search and send mail; create and move calendar events; list Drive files; create spreadsheets and documents.',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    icon: MicrosoftIcon,
    tools: 8,
    surfaces: ['Outlook', 'Calendar', 'OneDrive'],
    detail: 'Read, search and send Outlook mail; create, update and cancel meetings; browse OneDrive.',
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: GitHubIcon,
    tools: 9,
    surfaces: ['Repos', 'Issues', 'Pull requests'],
    detail: 'List and create repositories, read files and commits, triage issues, comment, review open pull requests.',
  },
] as const;

const SERVICE_PROMPTS = [
  'Summarise the unread emails from this morning',
  'Book a 30-minute review with Ana on Thursday',
  'Open an issue in nova-agent about the login bug',
  'Create a spreadsheet with last week’s expenses',
];

function ConnectedServicesSection() {
  const navigate = useNavigate();

  return (
    <section id="connections" className="relative border-t border-surface-700/20 py-32">
      <div className="mx-auto max-w-6xl px-6">
        <FadeInSection className="text-center">
          <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
            Connect your <span className="text-primary-400">own accounts</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-surface-400">
            Sign in once to Google, Microsoft or GitHub and NOVA works inside your real
            mail, calendar, files and repositories — 28 extra tools, no API keys pasted
            into a config file. These are the hands the orchestrator above reaches for.
          </p>
        </FadeInSection>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {SERVICES.map(({ id, label, icon: Icon, tools, surfaces, detail }, i) => (
            <FadeInSection key={id} delay={i * 0.08}>
              <div className="group h-full rounded-xl border border-surface-700/30 bg-surface-900/40 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary-700/40 hover:bg-surface-900/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-800/80">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-surface-100">{label}</h3>
                  </div>
                  <span className="rounded-full bg-primary-500/10 px-2.5 py-0.5 font-mono text-[10px] text-primary-300">
                    {tools} tools
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {surfaces.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-surface-700/40 px-2 py-0.5 text-[11px] text-surface-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-relaxed text-surface-300">{detail}</p>
              </div>
            </FadeInSection>
          ))}
        </div>

        {/* Example prompts */}
        <FadeInSection delay={0.25}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {SERVICE_PROMPTS.map((prompt) => (
              <span
                key={prompt}
                className="rounded-full border border-surface-700/30 bg-surface-900/40 px-4 py-2 text-xs text-surface-400"
              >
                “{prompt}”
              </span>
            ))}
          </div>
        </FadeInSection>

        {/* How it stays safe */}
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Link2,
              title: 'One click to connect',
              desc: 'The user opens the connections panel and signs in. GitHub registers its own app from a manifest; Microsoft takes a single script.',
            },
            {
              icon: Lock,
              title: 'Tokens encrypted at rest',
              desc: 'Access and refresh tokens are Fernet-encrypted in SQLite, refreshed automatically, and the client secret never reaches the browser.',
            },
            {
              icon: Plug,
              title: 'Real MCP servers',
              desc: 'Each service is a standalone MCP server, so Claude Desktop or your IDE can use the same tools NOVA does.',
            },
          ].map(({ icon: Icon, title, desc }, i) => (
            <FadeInSection key={title} delay={0.3 + i * 0.05}>
              <div className="h-full rounded-xl border border-surface-700/30 bg-surface-900/30 p-5">
                <Icon className="h-5 w-5 text-primary-400" />
                <h4 className="mt-3 font-semibold text-surface-100">{title}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-surface-400">{desc}</p>
              </div>
            </FadeInSection>
          ))}
        </div>

        <FadeInSection delay={0.45} className="mt-10 text-center">
          <button
            onClick={() => navigate('/docs/connections')}
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-surface-600 px-6 py-3 text-sm text-surface-300 transition-all hover:border-primary-700/50 hover:text-primary-300"
          >
            Read the connections guide
            <ArrowRight className="h-4 w-4" />
          </button>
        </FadeInSection>
      </div>
    </section>
  );
}

/* ─── Multi-agent orchestration (A2A) ───
   Pays off the acronym in the hero: the O was the quiet letter until now. This
   is the headline of the release, so it sits ahead of the connectors section
   and carries the interactive flow diagram. */
function OrchestrationSection() {
  return (
    <section id="orchestration" className="relative border-t border-surface-700/20 py-32">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <FadeInSection className="text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-700/30 bg-primary-900/20 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-primary-400" />
            <span className="text-xs font-medium text-primary-300">New — latest release</span>
          </div>
          <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
            Multi-agent <span className="text-primary-400">orchestration</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-surface-400">
            One agent doing everything is a bottleneck. NOVA now splits the work across
            specialised agents that talk to each other over <strong className="font-medium text-surface-200">A2A</strong> —
            a supervisor decomposes the request, workers own a domain each, and the results
            are merged back into a single answer.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-surface-500">
            It is the letter the name had been saving:{' '}
            <span className="text-surface-300">
              Neural <span className="text-primary-400">Orchestration</span> &amp; Virtual Agent
            </span>
            .
          </p>
        </FadeInSection>

        {/* Pillars */}
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Network,
              title: 'Supervisor routing',
              desc: 'A LangGraph supervisor decides which agent handles each step, instead of one prompt juggling every tool.',
            },
            {
              icon: Users,
              title: 'Specialised workers',
              desc: 'Research, calendar, documents and advice agents, each with a narrow tool belt — and therefore a context window that fits.',
            },
            {
              icon: Layers,
              title: 'Bounded by design',
              desc: 'Every task runs under a budget of steps, tools and time. Out of budget answers with what it found, instead of searching forever.',
            },
          ].map(({ icon: Icon, title, desc }, i) => (
            <FadeInSection key={title} delay={0.1 + i * 0.06}>
              <div className="h-full rounded-xl border border-surface-700/30 bg-surface-900/40 p-6 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-primary-400" />
                <h3 className="mt-3 font-semibold text-surface-100">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-surface-400">{desc}</p>
              </div>
            </FadeInSection>
          ))}
        </div>

        {/* Interactive flow */}
        <FadeInSection delay={0.15} className="mt-20">
          <div className="mb-8 text-center">
            <h3 className="text-xl font-semibold text-surface-100 sm:text-2xl">
              How a request travels through the <span className="text-primary-400">A2A flow</span>
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-surface-400">
              Hover any step to see what happens there — and what it does to one real,
              deliberately messy prompt.
            </p>
          </div>
          <A2AFlow />
        </FadeInSection>

        <FadeInSection delay={0.3} className="mt-12 text-center">
          <a
            href="#roadmap"
            className="inline-flex items-center gap-1.5 text-sm text-surface-400 transition-colors hover:text-primary-300"
          >
            Follow it on the roadmap
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </FadeInSection>
      </div>
    </section>
  );
}

/* ─── Status badge colors ─── */
/* Keyed by the board's Status column, lowercased so renamed casing still matches. */
const STATUS_COLORS: Record<string, string> = {
  'backlog': 'bg-surface-600/50 text-surface-300',
  'ready': 'bg-blue-900/40 text-blue-300',
  'in progress': 'bg-yellow-900/40 text-yellow-300',
  'in review': 'bg-purple-900/40 text-purple-300',
  'done': 'bg-primary-900/40 text-primary-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  'P0': 'text-red-400',
  'P1': 'text-orange-400',
  'P2': 'text-yellow-400',
  'P3': 'text-surface-400',
};

/* ─── Status ordering ───
   The board reads top-down as "closest to shipping first": what is being
   reviewed, then what is being built, then what is queued — and everything
   already finished settles at the bottom. */
const STATUS_ORDER = ['in review', 'review', 'in progress', 'ready', 'backlog', 'done'];
const DONE_RANK = STATUS_ORDER.indexOf('done');

function statusRank(status: string | null): number {
  const i = STATUS_ORDER.indexOf((status || '').toLowerCase());
  // An unrecognised status is still live work, so it sorts above Done.
  return i === -1 ? DONE_RANK - 0.5 : i;
}

function isDone(issue: RoadmapIssue): boolean {
  return (issue.status || '').toLowerCase() === 'done';
}

/** Stable sort by status; issues keep their board order inside each group. */
function sortByStatus(issues: RoadmapIssue[]): RoadmapIssue[] {
  return [...issues].sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

/* ─── Issue Row ─── */
function IssueRow({ issue }: { issue: RoadmapIssue }) {
  const done = isDone(issue);
  const statusClass =
    STATUS_COLORS[(issue.status || '').toLowerCase()] || 'bg-surface-600/50 text-surface-300';

  return (
    <a
      href={issue.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-lg border px-4 py-3 transition-all hover:border-primary-700/30 hover:bg-surface-800/50 ${
        done
          ? 'border-surface-700/10 bg-surface-900/20 hover:opacity-100 opacity-70'
          : 'border-surface-700/20 bg-surface-900/30'
      }`}
    >
      {/* Priority indicator */}
      {issue.priority && (
        <span
          className={`shrink-0 text-xs font-bold ${
            done ? 'text-surface-600' : PRIORITY_COLORS[issue.priority] || 'text-surface-400'
          }`}
        >
          {issue.priority}
        </span>
      )}

      {/* Issue number */}
      {issue.number && (
        <span className={`shrink-0 font-mono text-xs ${done ? 'text-surface-600' : 'text-surface-500'}`}>
          #{issue.number}
        </span>
      )}

      {/* Title — finished work reads as settled rather than current */}
      <span
        className={`min-w-0 flex-1 truncate text-sm transition-colors group-hover:text-primary-300 ${
          done ? 'text-surface-500' : 'text-surface-200'
        }`}
      >
        {issue.title}
      </span>

      {/* Labels */}
      <div className={`hidden items-center gap-1.5 sm:flex ${done ? 'opacity-50' : ''}`}>
        {issue.labels.map((label) => (
          <span
            key={label.name}
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `#${label.color}20`,
              color: `#${label.color}`,
              border: `1px solid #${label.color}30`,
            }}
          >
            {label.name}
          </span>
        ))}
      </div>

      {/* Status badge */}
      {issue.status && (
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            done ? 'bg-surface-800/60 text-surface-500' : statusClass
          }`}
        >
          {done && <Check className="h-2.5 w-2.5" />}
          {done ? 'Completed' : issue.status}
        </span>
      )}

      {/* Size */}
      {issue.size && (
        <span className="shrink-0 text-[10px] text-surface-500 font-mono">
          {issue.size}
        </span>
      )}

      <ExternalLink className="h-3 w-3 shrink-0 text-surface-600 transition-colors group-hover:text-primary-500" />
    </a>
  );
}

/* ─── Iteration date helpers ─── */

type IterationPhase = 'completed' | 'active' | 'upcoming' | 'unknown';

/** Parse an ISO `YYYY-MM-DD` day as UTC so the phase never shifts by timezone. */
function parseDay(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(dateStr: string | null, withYear = true): string {
  const d = parseDay(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

/** "May 10 – Jun 30, 2026", collapsing the year when both ends share it. */
function formatRange(iteration: RoadmapIteration): string {
  const start = parseDay(iteration.start_date);
  const end = parseDay(iteration.end_date);
  if (!start) return '';
  if (!end) return formatDay(iteration.start_date);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${formatDay(iteration.start_date, !sameYear)} – ${formatDay(iteration.end_date)}`;
}

function iterationPhase(iteration: RoadmapIteration, now: Date): IterationPhase {
  const start = parseDay(iteration.start_date);
  const end = parseDay(iteration.end_date);
  if (!start || !end) return 'unknown';
  if (now < start) return 'upcoming';
  // `end` is the inclusive last day, so the iteration runs until its midnight.
  if (now.getTime() >= end.getTime() + 86400000) return 'completed';
  return 'active';
}

/** How far through the iteration we are, as a 0–1 fraction. */
function iterationProgress(iteration: RoadmapIteration, now: Date): number | null {
  const start = parseDay(iteration.start_date);
  const end = parseDay(iteration.end_date);
  if (!start || !end) return null;
  const total = end.getTime() + 86400000 - start.getTime();
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total));
}

const PHASE_LABEL: Record<IterationPhase, string> = {
  completed: 'Completed',
  active: 'In progress',
  upcoming: 'Upcoming',
  unknown: '',
};

const PHASE_CLASS: Record<IterationPhase, string> = {
  completed: 'bg-surface-700/40 text-surface-400',
  active: 'bg-primary-500/20 text-primary-300',
  upcoming: 'bg-surface-700/30 text-surface-400',
  unknown: '',
};

/* ─── Iteration Panel ─── */
function IterationPanel({ iteration, now }: { iteration: RoadmapIteration; now: Date }) {
  const phase = iterationPhase(iteration, now);
  const range = formatRange(iteration);
  const progress = phase === 'active' ? iterationProgress(iteration, now) : null;
  const items = useMemo(() => sortByStatus(iteration.items), [iteration.items]);
  const doneCount = items.filter(isDone).length;

  return (
    <div className="space-y-2">
      {/* Iteration header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-surface-300">
            {items.length} issue{items.length !== 1 ? 's' : ''}
            {doneCount > 0 && (
              <span className="ml-2 text-surface-500">{doneCount} completed</span>
            )}
          </span>
          {phase !== 'unknown' && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PHASE_CLASS[phase]}`}>
              {PHASE_LABEL[phase]}
            </span>
          )}
        </div>
        {range && (
          <span className="font-mono text-xs text-surface-500">
            {range}
            {iteration.duration && (
              <span className="ml-2 text-surface-600">({iteration.duration}d)</span>
            )}
          </span>
        )}
      </div>

      {/* Progress through the current iteration */}
      {progress !== null && (
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-700/40">
          <motion.div
            className="h-full rounded-full bg-primary-500/70"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Issues — live work first, completed work settled at the bottom */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-700/30 py-8 text-center text-sm text-surface-500">
          No issues assigned to this iteration yet
        </div>
      ) : (
        items.map((issue, i) => <IssueRow key={i} issue={issue} />)
      )}
    </div>
  );
}

/* ─── Roadmap Section ─── */
function RoadmapSection() {
  const { data, loading, error } = useRoadmap();
  const [selectedTab, setSelectedTab] = useState<number | null>(null);
  // Pinned once per mount so every phase/progress calculation agrees.
  const [now] = useState(() => new Date());

  // Default to the iteration we are currently in; otherwise the first one
  // that has items, otherwise the first one. An explicit click wins.
  const defaultTab = useMemo(() => {
    if (!data || data.iterations.length === 0) return 0;
    const current = data.iterations.findIndex((it) => iterationPhase(it, now) === 'active');
    if (current >= 0) return current;
    const firstWithItems = data.iterations.findIndex((it) => it.items.length > 0);
    return firstWithItems >= 0 ? firstWithItems : 0;
  }, [data, now]);

  const activeTab = selectedTab ?? defaultTab;
  const setActiveTab = setSelectedTab;

  const tabs = data
    ? [
        ...data.iterations.map((it) => ({
          label: it.title,
          count: it.items.length,
          range: formatRange(it),
          phase: iterationPhase(it, now),
        })),
        ...(data.backlog.length > 0
          ? [
              {
                label: 'Backlog',
                count: data.backlog.length,
                range: 'No iteration',
                phase: 'unknown' as IterationPhase,
              },
            ]
          : []),
      ]
    : [];

  const activePanel =
    data && activeTab < data.iterations.length
      ? data.iterations[activeTab]
      : null;
  const showBacklog = data && activeTab === data.iterations.length && data.backlog.length > 0;

  return (
    <section id="roadmap" className="relative border-t border-surface-700/20 py-32">
      <div className="mx-auto max-w-5xl px-6">
        <FadeInSection className="text-center">
          <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
            Follow the <span className="text-primary-400">development</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-surface-400">
            NOVA is actively developed in the open. Track features, bugs, and milestones
            across each iteration.
          </p>
        </FadeInSection>

        <FadeInSection delay={0.15}>
          <div className="mt-12 overflow-hidden rounded-xl border border-surface-700/30 bg-surface-900/40 backdrop-blur-sm">
            {loading ? (
              /* Loading state */
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-surface-400">
                  <motion.div
                    className="h-2 w-2 rounded-full bg-primary-500"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-sm">Loading roadmap from GitHub...</span>
                </div>
              </div>
            ) : error ? (
              /* Error state */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-surface-400 mb-4">{error}</p>
                <a
                  href="https://github.com/users/thisisrobyn/projects/3/views/1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary-400 hover:underline"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : data ? (
              <>
                {/* Quarter selector */}
                {tabs.length > 0 && (
                  <div className="flex flex-wrap items-stretch border-b border-surface-700/30">
                    {tabs.map((tab, i) => (
                      <button
                        key={tab.label}
                        onClick={() => setActiveTab(i)}
                        aria-current={i === activeTab}
                        className={`cursor-pointer relative px-5 py-3 text-left transition-colors ${
                          i === activeTab
                            ? 'text-primary-300'
                            : 'text-surface-400 hover:text-surface-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {tab.label}
                          {tab.phase === 'active' && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-400 shadow-[0_0_6px] shadow-primary-400" />
                          )}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                              i === activeTab
                                ? 'bg-primary-500/20 text-primary-300'
                                : 'bg-surface-700/50 text-surface-400'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </span>
                        {tab.range && (
                          <span className="mt-0.5 block font-mono text-[10px] text-surface-500">
                            {tab.range}
                          </span>
                        )}
                        {i === activeTab && (
                          <motion.div
                            layoutId="roadmap-tab"
                            className="absolute bottom-0 left-0 h-0.5 w-full bg-primary-400"
                          />
                        )}
                      </button>
                    ))}

                    {/* Link to full board */}
                    <div className="ml-auto flex items-center px-4">
                      <a
                        href={data.project_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-surface-500 transition-colors hover:text-primary-400"
                      >
                        <Github className="h-3.5 w-3.5" />
                        Full board
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Panel content */}
                <div className="p-5">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {activePanel && <IterationPanel iteration={activePanel} now={now} />}
                    {showBacklog && (
                      <div className="space-y-2">
                        <div className="mb-4 text-sm font-medium text-surface-300">
                          {data.backlog.length} item{data.backlog.length !== 1 ? 's' : ''} not assigned to an iteration
                        </div>
                        {sortByStatus(data.backlog).map((issue, i) => (
                          <IssueRow key={i} issue={issue} />
                        ))}
                      </div>
                    )}
                  </motion.div>
                </div>
              </>
            ) : null}
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════ */
export function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'NOVA — AI Agent';
  }, []);

  return (
    <div className="relative min-h-screen bg-surface-950 text-surface-100 scrollbar-thin">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 z-50 w-full border-b border-surface-700/30 bg-surface-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}ai-bot.png`} alt="NOVA" className="h-7 w-7" />
            <span className="text-lg font-bold text-primary-400 text-glow tracking-wider">
              NOVA
            </span>
          </div>
          <div className="hidden items-center gap-6 lg:flex">
            <a href="#features" className="text-sm text-surface-300 transition-colors hover:text-primary-400">
              Features
            </a>
            <a href="#orchestration" className="group inline-flex items-center gap-1.5 text-sm text-surface-300 transition-colors hover:text-primary-400">
              Orchestration
              <span className="rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary-300">
                New
              </span>
            </a>
            <a href="#connections" className="text-sm text-surface-300 transition-colors hover:text-primary-400">
              Connections
            </a>
            <a href="#architecture" className="text-sm text-surface-300 transition-colors hover:text-primary-400">
              Architecture
            </a>
            <a href="#docs" className="text-sm text-surface-300 transition-colors hover:text-primary-400">
              Docs
            </a>
            <a
              href="https://github.com/users/thisisrobyn/projects/3/views/1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-surface-300 transition-colors hover:text-primary-400"
            >
              Roadmap
            </a>
          </div>
          <div className="flex items-center gap-3">
            {/* The wordmark's GitHub icon points at the author; the button next
                to it is the one that goes to the repository. */}
            <a
              href={GITHUB_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              title="thisisrobyn on GitHub"
              aria-label="thisisrobyn on GitHub"
              className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200"
            >
              <Github className="h-5 w-5" />
            </a>
            <button
              onClick={() => IS_PROD ? window.open(GITHUB_REPO, '_blank') : navigate('/chat')}
              className="cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-black transition-all hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-500/20"
            >
              {IS_PROD ? 'View on GitHub' : 'Open Agent'}
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section ref={heroRef} className="relative flex min-h-screen flex-col items-center justify-center px-6 py-24">
        <GridBackground />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-primary-700/30 bg-primary-900/20 px-4 py-1.5"
          >
            <div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
            <span className="text-xs text-primary-300">Open Source AI Agent</span>
            <span className="flex items-center gap-1.5 border-l border-primary-700/30 pl-2 text-primary-300/70">
              <OllamaIcon className="h-3.5 w-3.5" />
              <OpenAIIcon className="h-3.5 w-3.5" />
              <AnthropicIcon className="h-3.5 w-3.5" />
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl md:text-7xl"
          >
            <span className="text-surface-100">Meet </span>
            <NovaAcronym />
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-surface-300 sm:text-xl"
          >
            An AI assistant that reasons, searches the web, executes code, and remembers your
            conversations — and now splits a request across specialised agents that coordinate
            over A2A, inside your own Google, Microsoft and GitHub accounts. Runs on a local
            Ollama model, or on OpenAI or Anthropic if you prefer.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <button
              onClick={() => IS_PROD ? window.open(GITHUB_REPO, '_blank') : navigate('/chat')}
              className="group flex cursor-pointer items-center gap-2 rounded-xl bg-primary-600 px-8 py-3.5 text-sm font-semibold text-black transition-all hover:bg-primary-500 hover:shadow-xl hover:shadow-primary-500/25"
            >
              {IS_PROD ? 'Get it on GitHub' : 'Start Chatting'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigate('/docs')}
              className="cursor-pointer rounded-xl border border-surface-600 bg-surface-800/50 px-8 py-3.5 text-sm font-medium text-surface-200 transition-all hover:border-surface-500 hover:bg-surface-700/50"
            >
              View Documentation
            </button>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 4.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-5 w-5 text-surface-500" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="relative border-y border-surface-700/20 bg-surface-900/30 py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          <Stat value="39" label="Agent Tools" delay={0} />
          <Stat value="38" label="API Endpoints" delay={0.1} />
          <Stat value="3" label="Connected Services" delay={0.2} />
          <Stat value="9" label="Core Capabilities" delay={0.3} />
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="relative py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeInSection className="text-center">
            <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
              Everything you need in an{' '}
              <span className="text-primary-400">AI agent</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-surface-400">
              NOVA combines conversational AI with a powerful toolset. Reason, act, search,
              execute, and remember — all in one system that runs entirely on your machine.
            </p>
          </FadeInSection>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Link2}
              title="Connected Accounts"
              description="Sign in with Google, Microsoft or GitHub and the agent works in your real mail, calendar, files and repositories."
              delay={0}
            />
            <FeatureCard
              icon={MessageSquare}
              title="Conversational AI"
              description="Multi-turn conversations with ReAct reasoning. The agent thinks step-by-step and decides when to use tools autonomously."
              delay={0}
            />
            <FeatureCard
              icon={Brain}
              title="Long-Term Memory"
              description="Automatically extracts and stores facts from your conversations. Remembers your preferences and context across sessions."
              delay={0.05}
            />
            <FeatureCard
              icon={FileSearch}
              title="Knowledge Base (RAG)"
              description="Upload PDFs, text, and markdown files. NOVA chunks, embeds, and retrieves relevant information when you ask."
              delay={0.1}
            />
            <FeatureCard
              icon={Globe}
              title="Web Search"
              description="Real-time web search via Tavily or DuckDuckGo. Get current information without leaving the conversation."
              delay={0.15}
            />
            <FeatureCard
              icon={Code}
              title="Code Execution"
              description="Write and run Python code in a sandboxed subprocess with security restrictions and self-healing on errors."
              delay={0.2}
            />
            <FeatureCard
              icon={Clock}
              title="Scheduled Tasks"
              description="Create cron or interval-based tasks that run agent prompts autonomously. Perfect for daily summaries and monitoring."
              delay={0.25}
            />
            <FeatureCard
              icon={Plug}
              title="MCP Integration"
              description="Connect to external tool servers via Model Context Protocol. Extend NOVA's capabilities without modifying its core."
              delay={0.3}
            />
            <FeatureCard
              icon={Database}
              title="Session Management"
              description="Persistent conversation sessions stored on disk. Resume any conversation right where you left off."
              delay={0.35}
            />
          </div>
        </div>
      </section>

      {/* ─── Privacy Section ─── */}
      <section className="relative border-t border-surface-700/20 py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <FadeInSection>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10">
                <Shield className="h-7 w-7 text-primary-400" />
              </div>
              <h2 className="mt-6 text-3xl font-bold text-surface-100 sm:text-4xl">
                Local by default.{' '}
                <span className="text-primary-400">Private by design.</span>
              </h2>
              <p className="mt-4 leading-relaxed text-surface-400">
                Out of the box NOVA runs entirely on your machine through Ollama: conversations,
                documents and memory never leave your hardware, and there is no telemetry. Cloud
                models and connected accounts are opt-in — nothing reaches a third party until
                you pick one, and the OAuth tokens that make it possible stay encrypted on your
                own disk.
              </p>
            </FadeInSection>

            <FadeInSection delay={0.15}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Your Model', desc: 'Local Ollama, or OpenAI / Anthropic' },
                  { label: 'Local Storage', desc: 'SQLite + ChromaDB on disk' },
                  { label: 'No Cloud by Default', desc: 'Zero external API calls*' },
                  { label: 'Open Source', desc: 'Fully auditable codebase' },
                  { label: 'Encrypted Tokens', desc: 'Fernet at rest, secrets server-side' },
                  { label: 'Revocable', desc: 'Disconnect any account at any time' },
                ].map(({ label, desc }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-surface-700/30 bg-surface-900/40 p-5 backdrop-blur-sm"
                  >
                    <div className="font-semibold text-surface-100">{label}</div>
                    <div className="mt-1 text-xs text-surface-400">{desc}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-surface-500">
                * Except what you switch on yourself: a cloud model provider, web search
                (Tavily/DDG), external MCP servers, and the Google,
                Microsoft or GitHub accounts you choose to connect — those calls go to the
                provider you signed into, and nowhere else.
              </p>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* ─── Multi-agent orchestration (A2A) — the headline of this release ─── */}
      <OrchestrationSection />

      {/* ─── Connected Services — the hands the orchestrator reaches for ─── */}
      <ConnectedServicesSection />

      {/* ─── Architecture Section ─── */}
      <section id="architecture" className="relative border-t border-surface-700/20 py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <FadeInSection>
                <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
                  Built on a{' '}
                  <span className="text-primary-400">modern stack</span>
                </h2>
                <p className="mt-4 leading-relaxed text-surface-400">
                  Four clean layers — a React frontend, a FastAPI backend, a LangGraph agent
                  engine, and the A2A orchestration layer on top of it — connected by SSE
                  streaming for real-time responses. The model behind it is swappable: a local
                  Ollama model out of the box, or OpenAI or Anthropic selected from the settings
                  panel, without touching the graph.
                </p>
              </FadeInSection>

              <div className="mt-10 space-y-4">
                <ArchLayer
                  icon={Layers}
                  label="Frontend"
                  tech="React 19 + Vite 7 + Tailwind CSS 4"
                  color="#4ade80"
                  delay={0.1}
                />
                <ArchLayer
                  icon={Server}
                  label="Backend"
                  tech="FastAPI + Uvicorn + 38 REST Endpoints"
                  color="#60a5fa"
                  delay={0.2}
                />
                <ArchLayer
                  icon={Cpu}
                  label="Agent Engine"
                  tech="LangGraph + ReAct Loop + Ollama / OpenAI / Anthropic"
                  color="#c084fc"
                  delay={0.3}
                />
                <ArchLayer
                  icon={Network}
                  label="Orchestration"
                  tech="A2A supervisor + specialised workers, budgeted per task"
                  color="#f472b6"
                  delay={0.4}
                />
              </div>
            </div>

            {/* Flow diagram */}
            <FadeInSection delay={0.2}>
              <div className="rounded-xl border border-surface-700/30 bg-surface-900/50 p-6 backdrop-blur-sm">
                <div className="mb-1 text-xs font-medium text-surface-400 uppercase tracking-widest">
                  Single-agent ReAct loop
                </div>
                <p className="mb-4 text-xs leading-relaxed text-surface-500">
                  What one agent does with a request it can handle alone. A request that spans
                  several domains goes to the A2A supervisor instead, which runs this same loop
                  inside each worker.
                </p>
                <div className="space-y-3 text-sm">
                  {[
                    { step: '01', label: 'User sends message', color: 'text-primary-400' },
                    { step: '02', label: 'Agent reasons about the task', color: 'text-blue-400' },
                    { step: '03', label: 'Decides: respond or use tool?', color: 'text-purple-400' },
                    { step: '04', label: 'Executes tool if needed', color: 'text-yellow-400' },
                    { step: '05', label: 'Feeds result back to LLM', color: 'text-orange-400' },
                    { step: '06', label: 'Generates final response', color: 'text-primary-400' },
                    { step: '07', label: 'Extracts memory in background', color: 'text-cyan-400' },
                  ].map(({ step, label, color }) => (
                    <div key={step} className="flex items-center gap-4 rounded-lg bg-surface-800/50 px-4 py-3">
                      <span className={`font-mono font-bold ${color}`}>{step}</span>
                      <span className="text-surface-300">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* ─── Tools Section ─── */}
      <section className="relative border-t border-surface-700/20 py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeInSection className="text-center">
            <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
              Powerful <span className="text-primary-400">built-in tools</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-surface-400">
              The agent decides autonomously which tools to use based on your request.
              Service tools appear only once you connect the account, so the model's context
              stays small. Extend with custom tools or connect external MCP servers.
            </p>
          </FadeInSection>

          <div className="mx-auto mt-16 max-w-4xl">
            <FadeInSection>
              <div className="overflow-hidden rounded-xl border border-surface-700/30 bg-surface-900/40 backdrop-blur-sm">
                {[
                  { name: 'calculator', desc: 'Evaluate math expressions safely', icon: Zap },
                  { name: 'web_search', desc: 'Search the web (Tavily + DuckDuckGo)', icon: Globe },
                  { name: 'execute_python', desc: 'Run Python in a sandboxed subprocess', icon: Code },
                  { name: 'rag_search', desc: 'Query your document knowledge base', icon: FileSearch },
                  { name: 'get_current_datetime', desc: 'Get current date/time in any timezone', icon: Clock },
                  { name: 'read_csv / read_excel', desc: 'Parse and preview spreadsheet data', icon: Database },
                  { name: 'list_directory', desc: 'Browse files and folders', icon: Terminal },
                  { name: 'count_tokens', desc: 'Track token usage in conversations', icon: Cpu },
                  { name: 'google_* (11)', desc: 'Gmail, Calendar, Drive, Sheets, Docs', icon: Link2 },
                  { name: 'microsoft_* (8)', desc: 'Outlook mail, Calendar, OneDrive', icon: Link2 },
                  { name: 'github_* (9)', desc: 'Repos, files, commits, issues, pull requests', icon: Link2 },
                ].map(({ name, desc, icon: ToolIcon }, i) => (
                  <div
                    key={name}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-800/40 ${
                      i > 0 ? 'border-t border-surface-700/20' : ''
                    }`}
                  >
                    <ToolIcon className="h-4 w-4 shrink-0 text-primary-500" />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm text-primary-300">{name}</span>
                      <span className="ml-3 text-sm text-surface-400">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* ─── Documentation Preview ─── */}
      <section id="docs" className="relative border-t border-surface-700/20 py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeInSection className="text-center">
            <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
              Comprehensive <span className="text-primary-400">documentation</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-surface-400">
              Everything you need to get started, understand the architecture, and extend NOVA
              with your own tools and integrations.
            </p>
          </FadeInSection>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DocCard
              title="Setup Guide"
              description="Install prerequisites, pull models, configure environment variables, and start the app."
              slug="setup"
              delay={0}
            />
            <DocCard
              title="Connected Services"
              description="Connect Google, Microsoft and GitHub: one-time app setup, the sign-in flow, what each service can do, and troubleshooting."
              slug="connections"
              delay={0.05}
            />
            <DocCard
              title="FAQ"
              description="Short answers to the questions that come up most: models, privacy, connections, memory, errors, and limits."
              slug="faq"
              delay={0.075}
            />
            <DocCard
              title="Architecture"
              description="System architecture, ReAct loop, state graph, tool registry, memory system, and data storage layout."
              slug="architecture"
              delay={0.1}
            />
            <DocCard
              title="API Reference"
              description="Complete REST API documentation with 38 endpoints, request/response examples, and SSE streaming."
              slug="api"
              delay={0.15}
            />
            <DocCard
              title="Tools"
              description="11 built-in tools plus 28 connected-service tools explained, and how to write your own."
              slug="tools"
              delay={0.2}
            />
            <DocCard
              title="Memory & RAG"
              description="Semantic and episodic memory, ChromaDB vector store, document ingestion pipeline, and retrieval."
              slug="memory"
              delay={0.25}
            />
            <DocCard
              title="Capabilities"
              description="Deep dive into all 9 capabilities: conversations, memory, RAG, web search, code execution, connected services, and more."
              slug="capabilities"
              delay={0.3}
            />
            <DocCard
              title="MCP"
              description="NOVA as MCP client and server, plus the per-account servers that power Google, Microsoft and GitHub."
              slug="mcp"
              delay={0.35}
            />
          </div>

          <FadeInSection delay={0.3} className="mt-8 text-center">
            <button
              onClick={() => navigate('/docs')}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-surface-600 px-6 py-3 text-sm text-surface-300 transition-all hover:border-primary-700/50 hover:text-primary-300"
            >
              View all documentation
              <ArrowRight className="h-4 w-4" />
            </button>
          </FadeInSection>
        </div>
      </section>

      {/* ─── Project Board / Roadmap Section ─── */}
      <RoadmapSection />

      {/* ─── CTA Section ─── */}
      <section className="relative border-t border-surface-700/20 py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute bottom-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary-500/[0.05] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <FadeInSection>
            <h2 className="text-3xl font-bold text-surface-100 sm:text-4xl">
              Ready to try <span className="text-primary-400">NOVA</span>?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-surface-400">
              Start a conversation with your own AI agent. No sign-up required, and with the
              default local model, no data leaves your machine.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={() => IS_PROD ? window.open(GITHUB_REPO, '_blank') : navigate('/chat')}
                className="group flex cursor-pointer items-center gap-2 rounded-xl bg-primary-600 px-8 py-3.5 text-sm font-semibold text-black transition-all hover:bg-primary-500 hover:shadow-xl hover:shadow-primary-500/25"
              >
                {IS_PROD ? 'Get it on GitHub' : 'Launch NOVA'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-surface-700/20 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}ai-bot.png`} alt="NOVA" className="h-6 w-6 opacity-50" />
              <span className="text-sm text-surface-500">
                NOVA — Neural Orchestration & Virtual Agent
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/nova-ai-sys/nova-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-surface-500 transition-colors hover:text-surface-300"
              >
                GitHub
              </a>
              <button
                onClick={() => navigate('/docs')}
                className="cursor-pointer text-sm text-surface-500 transition-colors hover:text-surface-300"
              >
                Documentation
              </button>
              <a
                href="https://github.com/users/thisisrobyn/projects/3/views/1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-surface-500 transition-colors hover:text-surface-300"
              >
                Project Board
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
