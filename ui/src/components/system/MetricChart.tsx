import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface MetricPoint {
  /** Epoch milliseconds. */
  t: number;
  v: number;
}

export interface MetricSeries {
  name: string;
  color: string;
  points: MetricPoint[];
}

interface MetricChartProps {
  series: MetricSeries[];
  /** Top of the y axis. Percentages stay pinned to 100 so cards stay comparable. */
  max?: number | 'auto';
  height?: number;
  /** A jump larger than this splits the line — the panel was closed, not idle. */
  gapMs?: number;
  formatValue?: (v: number) => string;
  label: string;
}

const PAD_TOP = 8;
const PAD_BOTTOM = 1;
/** Fractions of the axis that get a gridline. Recessive on purpose. */
const GRID_LINES = [0.25, 0.5, 0.75];

function defaultFormat(v: number): string {
  return `${v.toFixed(0)}%`;
}

function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Round up to the next 1/2/5×10ⁿ so an auto axis lands on a readable ceiling. */
function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * A time chart: one line per series, a soft area fill when there is only one,
 * and a hover crosshair that reads every series at the cursor.
 *
 * Drawn in real pixel coordinates rather than a scaled `viewBox` — stretching
 * a unit box to the container would thin the stroke horizontally and thicken
 * it vertically, which is what makes hand-rolled sparklines look wrong.
 */
export function MetricChart({
  series,
  max = 100,
  height = 72,
  gapMs = 8000,
  formatValue = defaultFormat,
  label,
}: MetricChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // The dock reflows with the viewport, and an SVG in pixel coordinates has
  // to be told its new width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // SVG ids are document-global — a shared one would make every card wear the
  // first chart's gradient.
  const gradientId = `metric-fill-${useId().replace(/:/g, '')}`;

  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const singleSeries = series.length === 1;

  const { tMin, tSpan, axisMax, hasData } = useMemo(() => {
    let low = Infinity;
    let high = -Infinity;
    let peak = 0;
    let count = 0;
    for (const s of series) {
      for (const p of s.points) {
        count++;
        if (p.t < low) low = p.t;
        if (p.t > high) high = p.t;
        if (p.v > peak) peak = p.v;
      }
    }
    return {
      tMin: count ? low : 0,
      tSpan: count ? Math.max(high - low, 1) : 1,
      axisMax: max === 'auto' ? niceCeiling(peak) : max,
      hasData: count > 0,
    };
  }, [series, max]);

  const x = useCallback((t: number) => ((t - tMin) / tSpan) * width, [tMin, tSpan, width]);
  const y = useCallback(
    (v: number) => PAD_TOP + plotHeight * (1 - Math.min(Math.max(v, 0), axisMax) / axisMax),
    [plotHeight, axisMax],
  );

  /** Contiguous runs of samples — a closed dock leaves a hole, not a slope. */
  const segmentsFor = useCallback(
    (points: MetricPoint[]) => {
      const runs: MetricPoint[][] = [];
      let current: MetricPoint[] = [];
      for (const point of points) {
        const previous = current[current.length - 1];
        if (previous && point.t - previous.t > gapMs) {
          runs.push(current);
          current = [];
        }
        current.push(point);
      }
      if (current.length) runs.push(current);
      return runs;
    },
    [gapMs],
  );

  const drawn = useMemo(() => {
    if (width === 0) return [];
    const baseline = height - PAD_BOTTOM;
    return series.map((s) => ({
      color: s.color,
      paths: segmentsFor(s.points).map((segment) => {
        const line = segment
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`)
          .join(' ');
        const area =
          singleSeries && segment.length > 1
            ? `${line} L${x(segment[segment.length - 1].t).toFixed(2)},${baseline} L${x(segment[0].t).toFixed(2)},${baseline} Z`
            : '';
        return { line, area };
      }),
    }));
  }, [series, segmentsFor, singleSeries, width, height, x, y]);

  /** Value of each series at the hovered instant. */
  const readout = useMemo(() => {
    if (hoverX == null || !hasData || width === 0) return null;
    const t = tMin + (hoverX / width) * tSpan;
    const rows = series
      .map((s) => {
        let nearest: MetricPoint | null = null;
        let best = Infinity;
        for (const p of s.points) {
          const distance = Math.abs(p.t - t);
          if (distance < best) {
            best = distance;
            nearest = p;
          }
        }
        return nearest ? { name: s.name, color: s.color, point: nearest } : null;
      })
      .filter((row): row is { name: string; color: string; point: MetricPoint } => row !== null);
    if (rows.length === 0) return null;
    return { rows, t: rows[0].point.t };
  }, [hoverX, hasData, width, tMin, tSpan, series]);

  const crosshairX = readout ? x(readout.t) : 0;
  // Flip the tooltip past the midpoint so it never hangs off the card.
  const flipped = crosshairX > width / 2;

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full touch-none"
        style={{ height }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHoverX(event.clientX - rect.left);
        }}
        onPointerLeave={() => setHoverX(null)}
        role="img"
        aria-label={label}
      >
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color ?? '#199e70'} stopOpacity={0.35} />
              <stop offset="100%" stopColor={series[0]?.color ?? '#199e70'} stopOpacity={0} />
            </linearGradient>
          </defs>

          {GRID_LINES.map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={width}
              y1={PAD_TOP + plotHeight * fraction}
              y2={PAD_TOP + plotHeight * fraction}
              stroke="currentColor"
              strokeWidth={1}
              className="text-surface-600/40"
            />
          ))}
          <line
            x1={0}
            x2={width}
            y1={height - PAD_BOTTOM}
            y2={height - PAD_BOTTOM}
            stroke="currentColor"
            strokeWidth={1}
            className="text-surface-600"
          />

          {drawn.map((s, i) => (
            <g key={i}>
              {s.paths.map((path, j) => (
                <g key={j}>
                  {path.area && <path d={path.area} fill={`url(#${gradientId})`} />}
                  <path
                    d={path.line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
          ))}

          {readout && (
            <g>
              <line
                x1={crosshairX}
                x2={crosshairX}
                y1={PAD_TOP}
                y2={height - PAD_BOTTOM}
                stroke="currentColor"
                strokeWidth={1}
                className="text-surface-400"
              />
              {readout.rows.map((row) => (
                <circle
                  key={row.name}
                  cx={x(row.point.t)}
                  cy={y(row.point.v)}
                  r={4}
                  fill={row.color}
                  stroke="#050505"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {max === 'auto' && hasData && (
          <span className="pointer-events-none absolute right-0 top-0 text-[9px] text-surface-400">
            {formatValue(axisMax)}
          </span>
        )}

        {readout && (
          <div
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border border-surface-600 bg-surface-800/95 px-2 py-1 text-[10px] leading-relaxed shadow-lg"
            style={{
              left: flipped ? undefined : Math.min(crosshairX + 10, Math.max(width - 4, 0)),
              right: flipped ? Math.max(width - crosshairX + 10, 0) : undefined,
            }}
          >
            <div className="text-surface-300">{formatClock(readout.t)}</div>
            {readout.rows.map((row) => (
              <div key={row.name} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                {!singleSeries && <span className="text-surface-300">{row.name}</span>}
                <span className="font-semibold tabular-nums text-surface-100">
                  {formatValue(row.point.v)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!singleSeries && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[10px] text-surface-300">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
