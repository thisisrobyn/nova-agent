import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import {
  Bot,
  CalendarPlus,
  Database,
  FileText,
  Globe,
  IdCard,
  Lightbulb,
  MessageSquare,
  Merge,
  Radio,
  Route,
  Send,
  Workflow,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════
   A2A FLOW — interactive diagram
   ═══════════════════════════════════════════════════════
   The whole point of the section is that orchestration is hard to explain in
   prose: it is a graph, it fans out, and the interesting part is what each hop
   actually does. So every node carries its own explanation plus a worked
   example taken from one single prompt — the interview request below — and the
   diagram walks itself through them until the visitor takes over by hovering.

   The example prompt, kept in one place so every step can quote a piece of it:

     "Create an event in my Microsoft calendar for next Tuesday at 13:40 — an
      interview for an Agentic Engineer role. Pull the key points for that role
      from the web, drop them into a Google Doc, and give me advice to walk in
      prepared."
*/

export const A2A_EXAMPLE_PROMPT =
  'Create an event in my Microsoft calendar for next Tuesday at 13:40 — we are doing an interview for an Agentic Engineer role. Also pull the key points for that role from the web, generate a Google Doc with them, and give me advice so I walk in prepared.';

interface FlowStep {
  id: string;
  label: string;
  /** Short technical subtitle rendered under the label. */
  sub: string;
  icon: React.ElementType;
  /** What happens at this hop. */
  what: string;
  /** The same hop, applied to the example prompt. */
  example: string;
}

interface Stage {
  kind: 'single' | 'group';
  /** Caption above a fan-out group. */
  caption?: string;
  steps: FlowStep[];
}

const STAGES: Stage[] = [
  {
    kind: 'single',
    steps: [
      {
        id: 'user',
        label: 'User message',
        sub: 'Chat UI · REST · CLI',
        icon: MessageSquare,
        what: 'The request enters through whichever surface you are using — the React chat, the FastAPI endpoint, or the CLI. It is one message, in plain language, with several unrelated jobs buried inside it.',
        example: `"${A2A_EXAMPLE_PROMPT}"`,
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'intake',
        label: 'Orchestrator intake',
        sub: 'LangGraph supervisor',
        icon: Workflow,
        what: 'The supervisor node reads the message together with the session history, the long-term memory and the list of accounts you have connected. It never runs a tool itself — its only job is to understand the request and decide who should act.',
        example: 'It sees four distinct jobs and notes that Microsoft and Google are connected, so the calendar and document work can actually be carried out rather than described.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'plan',
        label: 'Task decomposition',
        sub: 'plan graph + dependencies',
        icon: Route,
        what: 'The request is split into discrete tasks and wired into a small dependency graph. Independent tasks are marked to run in parallel; the ones that consume another task’s output are marked to wait.',
        example: 'T1 book the interview · T2 research the role · T3 write the doc (waits on T2) · T4 prepare advice (waits on T2). T1 and T2 start immediately, side by side.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'discovery',
        label: 'Agent discovery',
        sub: 'A2A Agent Cards',
        icon: IdCard,
        what: 'Every agent publishes an Agent Card: its name, its skills, the auth it needs and the endpoint it answers on. The orchestrator matches each task against the cards instead of hardcoding a route, so a new agent becomes reachable the moment it registers.',
        example: 'T1 matches the card that advertises `calendar.schedule` for Microsoft; T2 matches `web.research`; T3 matches `docs.write` for Google Workspace.',
      },
    ],
  },
  {
    kind: 'group',
    caption: 'Specialist agents run in parallel',
    steps: [
      {
        id: 'calendar',
        label: 'Calendar agent',
        sub: 'microsoft_* · MCP',
        icon: CalendarPlus,
        what: 'Owns scheduling only. Its tool belt is the Microsoft MCP server, so its context stays small and its failure modes stay predictable.',
        example: 'Resolves "next Tuesday at 13:40" against your timezone, checks the slot is free, and creates “Interview — Agentic Engineer” through the Graph API.',
      },
      {
        id: 'research',
        label: 'Research agent',
        sub: 'web_search · rag_search',
        icon: Globe,
        what: 'Searches the web and your own knowledge base, then returns a structured artifact rather than prose — so the agents downstream can consume it without re-parsing an essay.',
        example: 'Returns the key points of the Agentic Engineer role: orchestration frameworks, tool/function calling, evals, RAG, observability, cost and latency control — each with a source link.',
      },
      {
        id: 'docs',
        label: 'Documents agent',
        sub: 'google_* · MCP',
        icon: FileText,
        what: 'Turns an artifact into a real file in your Google account. It waits for its dependency, so it never writes a document out of half-finished research.',
        example: 'Takes the research artifact and creates a Google Doc, “Agentic Engineer — interview prep”, with the key points as sections, and returns the share link.',
      },
      {
        id: 'advisor',
        label: 'Advisor agent',
        sub: 'LLM + memory + RAG',
        icon: Lightbulb,
        what: 'The reasoning-only worker. No external side effects — it reads the shared state and your long-term memory and produces judgement.',
        example: 'Cross-references the role’s key points with what it remembers about your background and suggests which projects to lead with and which gaps to prepare answers for.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'protocol',
        label: 'A2A messaging',
        sub: 'tasks · status · artifacts',
        icon: Radio,
        what: 'Agents talk over a single task lifecycle — submitted, working, completed, failed or cancelled — streaming status updates and returning typed artifacts. Every event carries the id of the run it belongs to, which is what lets the UI show progress per agent, live, instead of one long spinner.',
        example: 'The calendar agent reports `completed` in two seconds while research is still `working`; the documents agent stays queued until the research artifact lands.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'state',
        label: 'Shared state',
        sub: 'checkpointer · memory · RAG',
        icon: Database,
        what: 'One state object backs the whole run: the plan, the recent conversation, and every artifact produced so far. A task is handed the artifacts of the tasks it depends on, so work already done is read rather than repeated — and the run is stamped onto the reply, so its diagram survives a reload.',
        example: 'The research artifact is written once and read twice — by the documents agent and by the advisor — rather than being searched for a second time.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'merge',
        label: 'Synthesis',
        sub: 'supervisor merge',
        icon: Merge,
        what: 'Before merging, a transient failure is retried and a task that failed because it was the wrong approach is replanned once. Then the supervisor collects the artifacts, reconciles them, and reports plainly what could not be done — it does not paper over the gap or invent a result to fill it.',
        example: 'Event id, research artifact, document link and the advice are merged into one coherent answer, ordered the way you asked for them.',
      },
    ],
  },
  {
    kind: 'single',
    steps: [
      {
        id: 'response',
        label: 'Final response',
        sub: 'SSE stream',
        icon: Send,
        what: 'The merged answer streams back over SSE, with each agent’s contribution attributed so you can see which one did what — and audit it.',
        example: '"Booked Tuesday 13:40 · here are the 7 key points · the Doc is here · and three things to prepare before you walk in."',
      },
    ],
  },
];

/** Flat, ordered list — what autoplay walks through. */
const ORDER: FlowStep[] = STAGES.flatMap((s) => s.steps);

/* ─── Connector between stages ─── */
function Connector({ animate }: { animate: boolean }) {
  return (
    <div className="relative mx-auto my-1.5 h-7 w-px bg-gradient-to-b from-surface-700/60 to-surface-700/60">
      {animate && (
        <motion.span
          className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary-400 shadow-[0_0_8px] shadow-primary-400"
          animate={{ top: ['-6px', '100%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </div>
  );
}

/* ─── A single node ─── */
function FlowNode({
  step,
  active,
  dimmed,
  onActivate,
}: {
  step: FlowStep;
  active: boolean;
  dimmed: boolean;
  onActivate: () => void;
}) {
  const Icon = step.icon;

  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
        active
          ? 'border-primary-600/60 bg-surface-800/80 shadow-lg shadow-primary-500/10'
          : 'border-surface-700/30 bg-surface-900/40 hover:border-surface-600/60'
      } ${dimmed ? 'opacity-55' : 'opacity-100'}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-primary-500/20 text-primary-300' : 'bg-surface-800/80 text-surface-400'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-sm font-medium transition-colors ${
            active ? 'text-surface-50' : 'text-surface-200'
          }`}
        >
          {step.label}
        </span>
        <span className="block truncate font-mono text-[10px] text-surface-500">{step.sub}</span>
      </span>

      {active && (
        <motion.span
          layoutId="a2a-active-marker"
          className="absolute -left-px top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary-400"
        />
      )}
    </button>
  );
}

/* ─── Section ─── */
export function A2AFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-120px' });

  const [index, setIndex] = useState(0);
  /** Set while the visitor is driving; autoplay stands down until they leave. */
  const [pinned, setPinned] = useState<string | null>(null);

  const activeId = pinned ?? ORDER[index].id;
  const active = ORDER.find((s) => s.id === activeId) ?? ORDER[0];

  useEffect(() => {
    if (!inView || pinned) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % ORDER.length), 2800);
    return () => clearInterval(t);
  }, [inView, pinned]);

  // Leaving the diagram resumes the walkthrough from wherever the visitor
  // stopped, rather than snapping back to the top.
  const release = () => {
    if (pinned) {
      const i = ORDER.findIndex((s) => s.id === pinned);
      if (i >= 0) setIndex(i);
    }
    setPinned(null);
  };

  return (
    // Releasing on the outer wrapper — not on the diagram column — lets the
    // visitor move across to the detail panel and read it without the
    // walkthrough snatching the step back mid-sentence.
    <div ref={ref} onMouseLeave={release} className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      {/* ── Diagram ── */}
      <div className="lg:col-span-7">
        {STAGES.map((stage, si) => (
          <div key={stage.steps[0].id}>
            {si > 0 && <Connector animate={inView} />}

            {stage.kind === 'single' ? (
              <FlowNode
                step={stage.steps[0]}
                active={activeId === stage.steps[0].id}
                dimmed={activeId !== stage.steps[0].id}
                onActivate={() => setPinned(stage.steps[0].id)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-primary-700/25 bg-primary-500/[0.03] p-3">
                {stage.caption && (
                  <div className="mb-2.5 flex items-center gap-2 px-1">
                    <Bot className="h-3.5 w-3.5 text-primary-400/70" />
                    <span className="text-[11px] uppercase tracking-widest text-surface-500">
                      {stage.caption}
                    </span>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {stage.steps.map((step) => (
                    <FlowNode
                      key={step.id}
                      step={step}
                      active={activeId === step.id}
                      dimmed={activeId !== step.id}
                      onActivate={() => setPinned(step.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Detail panel ── */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          <div className="rounded-xl border border-surface-700/30 bg-surface-900/60 p-6 backdrop-blur-sm">
            {/* Prompt being traced */}
            <div className="mb-5 rounded-lg border border-surface-700/30 bg-surface-950/60 p-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-surface-500">
                Tracing one prompt
              </div>
              <p className="text-xs leading-relaxed text-surface-400">“{A2A_EXAMPLE_PROMPT}”</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/15 text-primary-300">
                    <active.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-surface-100">{active.label}</h3>
                    <p className="font-mono text-[10px] text-surface-500">{active.sub}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-surface-300">{active.what}</p>

                <div className="mt-4 rounded-lg border-l-2 border-primary-500/50 bg-surface-800/40 py-3 pl-3 pr-3">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-primary-400/80">
                    In this example
                  </div>
                  <p className="text-sm leading-relaxed text-surface-400">{active.example}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div className="mt-6 flex flex-wrap items-center gap-1.5">
              {ORDER.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  aria-label={step.label}
                  onClick={() => setPinned(step.id)}
                  className={`h-1.5 cursor-pointer rounded-full transition-all ${
                    step.id === activeId
                      ? 'w-6 bg-primary-400'
                      : 'w-1.5 bg-surface-700 hover:bg-surface-600'
                  }`}
                />
              ))}
              <span className="ml-auto text-[10px] text-surface-600">
                {pinned ? 'paused — move away to resume' : 'hover any step'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
