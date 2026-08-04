import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, Workflow } from 'lucide-react';

/**
 * Mermaid diagram, themed to NOVA's green-on-black palette.
 *
 * The library is pulled in with a dynamic `import()` on first render rather
 * than at module scope: mermaid is by far the heaviest dependency in the app
 * (~500 KB gzipped, most of it parsers for diagram types the docs never use),
 * and only the documentation page draws diagrams. Loading it eagerly would put
 * that weight in front of every user who just wants to chat.
 */

/** Green-on-black overrides for mermaid's `base` theme.
 *
 * Kept in sync by hand with the `@theme` tokens in `index.css` — mermaid reads
 * these at render time as literal colours and cannot resolve CSS custom
 * properties, so `var(--color-primary-500)` would silently render black.
 */
const THEME_VARIABLES = {
  darkMode: true,
  background: 'transparent',
  fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  fontSize: '13px',

  /* Nodes */
  primaryColor: '#052e16', // primary-950
  primaryTextColor: '#86efac', // primary-300
  primaryBorderColor: '#22c55e', // primary-500
  secondaryColor: '#0d0d0d', // surface-800
  secondaryTextColor: '#a1a1aa', // surface-200
  secondaryBorderColor: '#1a1a1a', // surface-700
  tertiaryColor: '#050505', // surface-900
  tertiaryTextColor: '#a1a1aa',
  tertiaryBorderColor: '#1a1a1a',
  mainBkg: '#052e16',
  nodeBorder: '#16a34a', // primary-600
  nodeTextColor: '#86efac',
  titleColor: '#86efac',
  textColor: '#a1a1aa',

  /* Edges */
  lineColor: '#22c55e',
  edgeLabelBackground: '#000000',
  arrowheadColor: '#22c55e',

  /* Subgraphs */
  clusterBkg: 'rgba(5, 46, 22, 0.25)',
  clusterBorder: '#15803d', // primary-700

  /* Sequence diagrams */
  actorBkg: '#052e16',
  actorBorder: '#22c55e',
  actorTextColor: '#86efac',
  actorLineColor: '#15803d',
  signalColor: '#4ade80', // primary-400
  signalTextColor: '#a1a1aa',
  labelBoxBkgColor: '#052e16',
  labelBoxBorderColor: '#22c55e',
  labelTextColor: '#86efac',
  loopTextColor: '#a1a1aa',
  noteBkgColor: '#0d0d0d',
  noteBorderColor: '#15803d',
  noteTextColor: '#a1a1aa',
  activationBkgColor: '#14532d', // primary-900
  activationBorderColor: '#22c55e',
  sequenceNumberColor: '#000000',
} as const;

let mermaidReady: Promise<typeof import('mermaid').default> | null = null;

/** Load and configure mermaid once, shared by every diagram on the page. */
function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        // `strict` keeps mermaid from injecting raw HTML from a label. The
        // diagrams here are authored in this repo, but the setting costs
        // nothing and this component is generic.
        securityLevel: 'strict',
        themeVariables: THEME_VARIABLES,
        // `useMaxWidth: false` everywhere: it makes mermaid emit an SVG with an
        // explicit pixel width instead of `width: 100%`. This component sizes
        // the diagram itself, by measuring its natural dimensions and scaling
        // to fit — an SVG that stretches to its parent would make that
        // measurement circular and the fit would never settle.
        flowchart: { curve: 'basis', htmlLabels: true, padding: 12, useMaxWidth: false },
        sequence: { mirrorActors: false, useMaxWidth: false },
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

/* ── Viewport interaction ─────────────────────────────────── */
// Deliberately the same numbers, gestures and control layout as the chat's
// live agent-flow diagram (`components/chat/AgentFlowLive.tsx`): a diagram
// should behave the same way wherever the reader meets one.

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.15;
/** Breathing room left around a fitted diagram, as a fraction of the viewport. */
const FIT_MARGIN = 0.94;

/**
 * The scale at which `content` fills `viewport` without overflowing either
 * axis. Diagrams open at this scale — a flow graph rendered at 1× in a wide
 * card reads as a distant postage stamp, and one wider than the card gets
 * clipped. Fitting handles both, and the zoom controls take over from there.
 */
function fitScale(
  viewport: { w: number; h: number },
  content: { w: number; h: number },
): number {
  if (!viewport.w || !viewport.h || !content.w || !content.h) return 1;
  const scale = Math.min(viewport.w / content.w, viewport.h / content.h) * FIT_MARGIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +scale.toFixed(3)));
}

interface MermaidProps {
  /** The diagram definition, exactly as it would appear in a mermaid fence. */
  chart: string;
  /** Optional caption, shown in the header and under the diagram. */
  caption?: string;
}

/**
 * A mermaid diagram the reader can actually inspect: zoom with the controls,
 * the wheel (holding ⌘/Ctrl) or a pinch, pan by dragging, and open it
 * fullscreen when a wide graph will not fit the documentation column.
 */
export function Mermaid({ chart, caption }: MermaidProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
  /** The scale that fills the current viewport — recomputed per mode. */
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  /** Set once the reader touches the zoom, so a resize stops re-fitting under them. */
  const zoomedByHand = useRef(false);

  const reactId = useId();
  // `useId` produces colons, which are not valid in the CSS selector mermaid
  // builds from this id while rendering.
  const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;

    loadMermaid()
      .then((mermaid) => mermaid.render(domId, chart.trim()))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        // A diagram that will not parse must not take the page down with it —
        // the source is still readable, so fall back to showing it verbatim.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chart, domId]);

  // Measure the rendered SVG at its natural size and fit it to the viewport.
  // Zoom is a CSS transform, which leaves the layout box at 1×, so the scaled
  // footprint has to be reserved explicitly — otherwise a zoomed diagram
  // drifts out of the area that scrolls it.
  //
  // Re-runs when the diagram changes and whenever the reader expands or
  // collapses: the fullscreen modal is a different-sized box, and "expand"
  // only means anything if the diagram grows to use it.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport || svg === null) return;

    const measure = (refit: boolean) => {
      const natural = { w: content.offsetWidth, h: content.offsetHeight };
      setContentSize(natural);
      const next = fitScale({ w: viewport.clientWidth, h: viewport.clientHeight }, natural);
      setFit(next);
      if (refit) setZoom(next);
    };

    zoomedByHand.current = false;
    measure(true);

    // A window resize changes the box the diagram was fitted to. Re-fitting is
    // only right while the reader has not chosen a zoom of their own.
    const observer = new ResizeObserver(() => measure(!zoomedByHand.current));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [svg, expanded]);

  // Escape closes the fullscreen view, the same as clicking the backdrop.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (failed) {
    return (
      <pre className="my-4 overflow-x-auto rounded-lg border border-surface-700/30 bg-surface-900/80 p-4 text-sm text-surface-300 code-scroll">
        <code>{chart.trim()}</code>
      </pre>
    );
  }

  const zoomBy = (delta: number) => {
    zoomedByHand.current = true;
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  };
  const resetZoom = () => {
    zoomedByHand.current = false;
    setZoom(fit);
  };
  const toggleExpanded = () => setExpanded((wasExpanded) => !wasExpanded);

  const onWheel = (e: ReactWheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls the page
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
    };
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    const vp = viewportRef.current;
    if (!drag.current || !vp) return;
    vp.scrollLeft = drag.current.scrollLeft - (e.clientX - drag.current.x);
    vp.scrollTop = drag.current.scrollTop - (e.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const controlButton =
    'cursor-pointer rounded-md p-1 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200';

  const header = (
    <div className="flex items-center gap-2 border-b border-surface-800/60 px-3 py-2">
      <Workflow className="h-3.5 w-3.5 shrink-0 text-primary-400" />
      <span className="truncate text-[11px] font-semibold uppercase tracking-widest text-surface-400">
        {caption ?? 'Diagram'}
      </span>
      <span className="flex-1" />
      <div className="flex items-center gap-0.5 rounded-lg border border-surface-700/50 bg-surface-900/60 p-0.5">
        <button type="button" onClick={() => zoomBy(-ZOOM_STEP)} title="Zoom out" className={controlButton}>
          <Minus className="h-3 w-3" />
        </button>
        <button type="button" onClick={resetZoom} title="Fit to view" className={`${controlButton} px-1.5`}>
          <RotateCcw className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in" className={controlButton}>
          <Plus className="h-3 w-3" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-surface-700/60" />
        <button
          type="button"
          onClick={toggleExpanded}
          title={expanded ? 'Collapse' : 'Expand'}
          className={controlButton}
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
      /* `safe center` centres the diagram when it fits and falls back to
         start-alignment when it does not — plain centring would push the
         overflowing part out of reach. */
      /* A fixed inline height, not `max-h`: the fit scale is computed from the
         viewport's own size, and a box that sizes itself to its (scaled)
         content would make that measurement chase its own tail. */
      className={`flex cursor-grab overflow-auto active:cursor-grabbing scrollbar-none [align-items:safe_center] [justify-content:safe_center] ${
        expanded ? 'h-full' : 'h-[380px]'
      }`}
    >
      {/* Reserves the *scaled* footprint in layout; the diagram itself is
          scaled by a transform, which leaves its own layout box at 1×. */}
      <div
        className="relative shrink-0"
        style={{
          width: contentSize.w ? contentSize.w * zoom : undefined,
          height: contentSize.h ? contentSize.h * zoom : undefined,
        }}
      >
        {svg === null ? (
          <div className="flex h-24 w-64 items-center justify-center text-xs text-surface-500">
            Rendering diagram…
          </div>
        ) : (
          <motion.div
            ref={contentRef}
            className="absolute left-0 top-0 origin-top-left p-5 [&_svg]:h-auto [&_svg]:max-w-none"
            animate={{ scale: zoom }}
            transition={{ duration: 0.15 }}
            // The markup comes from mermaid's own renderer, running in `strict`
            // mode over a diagram defined in this repo — no user input reaches
            // this path.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </div>
  );

  const body = (
    <div
      className={`flex min-h-0 select-none flex-col overflow-hidden rounded-xl border border-primary-900/40 bg-surface-900/60 ${
        expanded ? 'h-full w-full shadow-2xl' : ''
      }`}
    >
      {header}
      {canvas}
    </div>
  );

  return (
    <figure className="my-5">
      {expanded
        ? createPortal(
            <AnimatePresence>
              <motion.div
                className="fixed inset-0 z-50 p-3 sm:p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={() => setExpanded(false)}
                />
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

      {caption && (
        <figcaption className="mt-2 text-center text-xs text-surface-500">{caption}</figcaption>
      )}
    </figure>
  );
}

