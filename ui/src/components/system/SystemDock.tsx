import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagon, AlertTriangle, CheckCircle2, Cpu, Gauge,
  HardDrive, MemoryStick, Network, Sparkles, Thermometer, X, Zap,
} from 'lucide-react';
import { MetricChart, type MetricPoint, type MetricSeries } from './MetricChart';
import {
  MIN_MODELS_FREE_BYTES, SERIES, STATUS_COLOR, THRESHOLDS,
  formatRate, formatUptime, levelFor, markColor, worstLevel, type Level,
} from './metricStatus';
import { useSystemMetrics, HISTORY_WINDOW_MS } from '@/hooks/useSystemMetrics';
import { useI18n } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import type { DiskMetrics, SystemMetrics } from '@/lib/types';

const WINDOW_MINUTES = Math.round(HISTORY_WINDOW_MS / 60000);

/* ── Resizing ─────────────────────────────────────────────── */

const DEFAULT_HEIGHT = 360;
const MIN_HEIGHT = 180;
/** Never eat the whole window — the conversation has to stay usable. */
const MAX_HEIGHT_RATIO = 0.85;
const HEIGHT_STORAGE_KEY = 'nova-system-dock-height';

function maxDockHeight(): number {
  return Math.round(window.innerHeight * MAX_HEIGHT_RATIO);
}

function clampHeight(value: number): number {
  return Math.min(Math.max(value, MIN_HEIGHT), maxDockHeight());
}

function loadHeight(): number {
  try {
    const stored = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampHeight(stored) : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

function seriesFrom(
  samples: SystemMetrics[],
  pick: (s: SystemMetrics) => number | null | undefined,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const sample of samples) {
    const value = pick(sample);
    if (value == null) continue;
    points.push({ t: sample.timestamp * 1000, v: value });
  }
  return points;
}

/** A volume's health — the models disk gets the stricter reading. */
function diskLevel(disk: DiskMetrics): Level {
  const base = levelFor(disk.percent, disk.holds_models ? THRESHOLDS.modelsDisk : THRESHOLDS.disk);
  if (disk.holds_models && disk.free_bytes < MIN_MODELS_FREE_BYTES) return 'critical';
  return base;
}

/* ── Building blocks ──────────────────────────────────────── */

function StatusBadge({ level, className = '' }: { level: Level; className?: string }) {
  const { t } = useI18n();
  if (level === 'ok') return null;
  const Icon = level === 'critical' ? AlertOctagon : AlertTriangle;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${className}`}
      style={{ color: STATUS_COLOR[level], backgroundColor: `${STATUS_COLOR[level]}1f` }}
    >
      <Icon className="h-3 w-3" />
      {t(level === 'critical' ? 'sys.levelCritical' : 'sys.levelWarning')}
    </span>
  );
}

interface CardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  level?: Level;
  color: string;
  children: ReactNode;
}

function Card({ icon, title, subtitle, value, level = 'ok', color, children }: CardProps) {
  return (
    <section
      className="flex flex-col rounded-xl border bg-surface-900/60 p-3 transition-colors"
      style={{
        borderColor: level === 'ok' ? 'rgba(26,26,26,0.9)' : `${STATUS_COLOR[level]}66`,
      }}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span style={{ color }} className="shrink-0">{icon}</span>
            <h3 className="truncate text-[11px] font-semibold tracking-wide text-surface-100">
              {title}
            </h3>
            <StatusBadge level={level} />
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate text-[10px] text-surface-300">{subtitle}</p>
          )}
        </div>
        {value && (
          /* The only number labelled on the chart — the live one. */
          <span
            className="shrink-0 text-lg font-bold leading-none tabular-nums"
            style={{ color: level === 'ok' ? undefined : STATUS_COLOR[level] }}
          >
            {value}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function Meter({
  percent,
  color,
  caption,
  trailing,
}: {
  percent: number;
  color: string;
  caption: string;
  trailing?: string;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-surface-300">
        <span className="truncate">{caption}</span>
        <span className="shrink-0 tabular-nums text-surface-100">
          {trailing ?? `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function Chip({ icon, children, level = 'ok' }: { icon?: ReactNode; children: ReactNode; level?: Level }) {
  return (
    <span
      className="flex items-center gap-1 rounded-md bg-surface-800/80 px-1.5 py-0.5 text-[10px] text-surface-200"
      style={level === 'ok' ? undefined : { color: STATUS_COLOR[level], backgroundColor: `${STATUS_COLOR[level]}1f` }}
    >
      {icon}
      {children}
    </span>
  );
}

function CoreBars({ cores, color }: { cores: number[]; color: string }) {
  return (
    <div className="mt-2 flex h-6 items-end gap-[2px]" aria-hidden>
      {cores.map((load, i) => (
        <div key={i} className="flex h-full flex-1 items-end rounded-[2px] bg-surface-700/70">
          <div
            className="w-full rounded-[2px] transition-[height] duration-500"
            style={{ height: `${Math.max(Math.min(load, 100), 3)}%`, backgroundColor: color }}
          />
        </div>
      ))}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-700/60 bg-surface-900/60 px-4 py-6 text-center text-[11px] text-surface-300">
      {children}
    </div>
  );
}

/* ── Dock ─────────────────────────────────────────────────── */

interface SystemDockProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-width resource panel docked to the bottom of the chat column.
 *
 * Polling only runs while it is open — an idle chat should not be hitting the
 * API twice a second — but the samples it collected survive closing it, so
 * reopening continues the same lines.
 */
export function SystemDock({ open, onClose }: SystemDockProps) {
  const { t } = useI18n();
  const [height, setHeight] = useState(loadHeight);
  const [resizing, setResizing] = useState(false);
  const dragOrigin = useRef<{ pointerY: number; height: number } | null>(null);
  const { samples, latest, loading, unreachable } = useSystemMetrics(open);

  // A window that shrank below the remembered height would leave the chat with
  // no room at all.
  useEffect(() => {
    const onResize = () => setHeight((current) => clampHeight(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { pointerY: event.clientY, height };
    setResizing(true);
  }, [height]);

  const onResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    // The dock grows upwards, so dragging up (a smaller clientY) makes it taller.
    setHeight(clampHeight(origin.height - (event.clientY - origin.pointerY)));
  }, []);

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    setResizing(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setHeight((current) => {
      try {
        localStorage.setItem(HEIGHT_STORAGE_KEY, String(current));
      } catch { /* private mode — the size just won't be remembered */ }
      return current;
    });
  }, []);

  const cpuPoints = useMemo(() => seriesFrom(samples, (s) => s.cpu?.percent), [samples]);
  const ramPoints = useMemo(() => seriesFrom(samples, (s) => s.memory?.percent), [samples]);
  const ioSeries = useMemo<MetricSeries[]>(
    () => [
      { name: t('sys.read'), color: SERIES.in, points: seriesFrom(samples, (s) => s.disk_io?.read_bytes_per_sec) },
      { name: t('sys.write'), color: SERIES.out, points: seriesFrom(samples, (s) => s.disk_io?.write_bytes_per_sec) },
    ],
    [samples, t],
  );
  const netSeries = useMemo<MetricSeries[]>(
    () => [
      { name: t('sys.received'), color: SERIES.in, points: seriesFrom(samples, (s) => s.network?.received_bytes_per_sec) },
      { name: t('sys.sent'), color: SERIES.out, points: seriesFrom(samples, (s) => s.network?.sent_bytes_per_sec) },
    ],
    [samples, t],
  );

  /** Every level derived once, so the header summary and the cards agree. */
  const status = useMemo(() => {
    if (!latest?.available) return null;
    const cpu = levelFor(latest.cpu?.percent, THRESHOLDS.cpu);
    const cpuTemp = levelFor(latest.cpu?.temperature_celsius, THRESHOLDS.cpuTemp);
    const ram = levelFor(latest.memory?.percent, THRESHOLDS.ram);
    const swap = levelFor(latest.swap?.percent, THRESHOLDS.swap);
    const gpus = latest.gpus.map((gpu) => ({
      vram: levelFor(gpu.memory_percent, THRESHOLDS.vram),
      temp: levelFor(gpu.temperature_celsius, THRESHOLDS.gpuTemp),
    }));
    const disks = latest.disks.map(diskLevel);

    const all: Level[] = [
      cpu, cpuTemp, ram, swap,
      ...gpus.flatMap((g) => [g.vram, g.temp]),
      ...disks,
    ];
    return {
      cpu, cpuTemp, ram, swap, gpus, disks,
      warnings: all.filter((l) => l === 'warning').length,
      criticals: all.filter((l) => l === 'critical').length,
    };
  }, [latest]);

  const hostLine = latest
    ? [
        latest.hostname,
        latest.platform,
        formatUptime(latest.uptime_seconds)
          ? t('sys.uptime', { value: formatUptime(latest.uptime_seconds) as string })
          : null,
        t('sys.window', { minutes: String(WINDOW_MINUTES) }),
      ]
        .filter(Boolean)
        .join(' · ')
    : t('sys.window', { minutes: String(WINDOW_MINUTES) });

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="shrink-0 overflow-hidden border-t border-surface-700/60 bg-surface-950"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          // No easing while dragging: the height must track the pointer exactly,
          // or the edge lags behind the cursor.
          transition={resizing ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
          style={{ maxHeight: `${MAX_HEIGHT_RATIO * 100}vh` }}
          aria-label={t('sys.title')}
        >
          <div className="flex h-full flex-col">
            {/* Drag the top edge to any height; the conversation reflows above. */}
            <div
              onPointerDown={startResize}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('sys.resize')}
              title={t('sys.resize')}
              className={`group flex h-2.5 shrink-0 cursor-ns-resize items-center justify-center ${
                resizing ? 'bg-surface-800' : 'hover:bg-surface-800/70'
              }`}
            >
              <span
                className={`h-0.5 w-10 rounded-full transition-colors ${
                  resizing ? 'bg-primary-500' : 'bg-surface-600 group-hover:bg-primary-700'
                }`}
              />
            </div>

            <header className="flex items-center justify-between gap-3 border-b border-surface-800 px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Gauge className="h-4 w-4 shrink-0 text-primary-500" />
                <h2 className="shrink-0 text-xs font-bold tracking-wide text-primary-400">
                  {t('sys.title')}
                </h2>
                <span className="truncate text-[10px] text-surface-400">{hostLine}</span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {status && (
                  status.criticals > 0 ? (
                    <Chip icon={<AlertOctagon className="h-3 w-3" />} level="critical">
                      {t('sys.criticals', { n: String(status.criticals) })}
                    </Chip>
                  ) : status.warnings > 0 ? (
                    <Chip icon={<AlertTriangle className="h-3 w-3" />} level="warning">
                      {t('sys.warnings', { n: String(status.warnings) })}
                    </Chip>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: '#0ca30c' }}>
                      <CheckCircle2 className="h-3 w-3" />
                      {t('sys.allOk')}
                    </span>
                  )
                )}
                <button
                  onClick={onClose}
                  className="cursor-pointer rounded-md p-1 text-surface-300 transition-colors hover:bg-surface-800 hover:text-surface-100"
                  aria-label={t('sys.close')}
                  title={t('sys.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
              {unreachable && !latest ? (
                <Notice>{t('sys.unreachable')}</Notice>
              ) : loading || !latest ? (
                <Notice>{t('sys.waiting')}</Notice>
              ) : !latest.available ? (
                <Notice>{latest.error || t('sys.unavailable')}</Notice>
              ) : (
                <>
                  {unreachable && (
                    <p className="mb-2 text-[10px]" style={{ color: STATUS_COLOR.warning }}>
                      {t('sys.unreachable')}
                    </p>
                  )}

                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    {latest.cpu && status && (
                      <Card
                        icon={<Cpu className="h-3.5 w-3.5" />}
                        title={t('sys.cpu')}
                        subtitle={t('sys.cores', {
                          physical: String(latest.cpu.cores_physical ?? '?'),
                          logical: String(latest.cpu.cores_logical ?? '?'),
                        })}
                        value={`${latest.cpu.percent.toFixed(0)}%`}
                        level={worstLevel(status.cpu, status.cpuTemp)}
                        color={markColor(SERIES.cpu, status.cpu)}
                      >
                        <MetricChart
                          label={t('sys.cpuChart')}
                          series={[{
                            name: t('sys.cpu'),
                            color: markColor(SERIES.cpu, status.cpu),
                            points: cpuPoints,
                          }]}
                        />
                        <CoreBars
                          cores={latest.cpu.per_core}
                          color={markColor(SERIES.cpu, status.cpu)}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {latest.cpu.frequency_mhz != null && (
                            <Chip>{(latest.cpu.frequency_mhz / 1000).toFixed(2)} GHz</Chip>
                          )}
                          {latest.cpu.temperature_celsius != null && (
                            <Chip icon={<Thermometer className="h-3 w-3" />} level={status.cpuTemp}>
                              {latest.cpu.temperature_celsius.toFixed(0)}°C
                            </Chip>
                          )}
                        </div>
                      </Card>
                    )}

                    {latest.memory && status && (
                      <Card
                        icon={<MemoryStick className="h-3.5 w-3.5" />}
                        title={t('sys.ram')}
                        subtitle={`${formatBytes(latest.memory.used_bytes)} / ${formatBytes(latest.memory.total_bytes)}`}
                        value={`${latest.memory.percent.toFixed(0)}%`}
                        level={worstLevel(status.ram, status.swap)}
                        color={markColor(SERIES.ram, status.ram)}
                      >
                        <MetricChart
                          label={t('sys.ramChart')}
                          series={[{
                            name: t('sys.ram'),
                            color: markColor(SERIES.ram, status.ram),
                            points: ramPoints,
                          }]}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Chip>{t('sys.freeRam', { value: formatBytes(latest.memory.available_bytes) })}</Chip>
                        </div>
                        {latest.swap && (
                          <Meter
                            percent={latest.swap.percent}
                            color={markColor(SERIES.ram, status.swap)}
                            caption={`${t('sys.swap')} · ${formatBytes(latest.swap.used_bytes)} / ${formatBytes(latest.swap.total_bytes)}`}
                          />
                        )}
                      </Card>
                    )}

                    {latest.gpus.map((gpu, i) => {
                      const gpuStatus = status?.gpus[i] ?? { vram: 'ok' as Level, temp: 'ok' as Level };
                      return (
                        <Card
                          key={gpu.index}
                          icon={<Zap className="h-3.5 w-3.5" />}
                          title={t('sys.gpu')}
                          subtitle={gpu.name}
                          value={gpu.utilization_percent != null ? `${gpu.utilization_percent.toFixed(0)}%` : '—'}
                          level={worstLevel(gpuStatus.vram, gpuStatus.temp)}
                          color={SERIES.gpu}
                        >
                          <MetricChart
                            label={t('sys.gpuChart')}
                            series={[{
                              name: t('sys.gpu'),
                              color: SERIES.gpu,
                              points: seriesFrom(
                                samples,
                                (s) => s.gpus.find((g) => g.index === gpu.index)?.utilization_percent,
                              ),
                            }]}
                          />
                          {gpu.memory_percent != null && (
                            <Meter
                              percent={gpu.memory_percent}
                              color={markColor(SERIES.gpu, gpuStatus.vram)}
                              caption={`${t('sys.vram')} · ${formatBytes(gpu.memory_used_bytes ?? 0)} / ${formatBytes(gpu.memory_total_bytes ?? 0)}`}
                            />
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {gpu.temperature_celsius != null && (
                              <Chip icon={<Thermometer className="h-3 w-3" />} level={gpuStatus.temp}>
                                {gpu.temperature_celsius.toFixed(0)}°C
                              </Chip>
                            )}
                            {gpu.power_watts != null && <Chip>{gpu.power_watts.toFixed(0)} W</Chip>}
                            {gpu.memory_percent != null && (
                              <Chip level={gpuStatus.vram}>
                                {t('sys.vramShort', { value: `${gpu.memory_percent.toFixed(0)}%` })}
                              </Chip>
                            )}
                          </div>
                        </Card>
                      );
                    })}

                    {latest.disks.length > 0 && status && (
                      <Card
                        icon={<HardDrive className="h-3.5 w-3.5" />}
                        title={t('sys.storage')}
                        subtitle={latest.models_path ?? undefined}
                        level={worstLevel(...status.disks)}
                        color={SERIES.ram}
                      >
                        <div className="space-y-2.5">
                          {latest.disks.map((disk, index) => {
                            const level = status.disks[index] ?? 'ok';
                            return (
                              <div key={disk.mountpoint}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="shrink-0 text-[11px] font-semibold text-surface-100">
                                      {disk.mountpoint}
                                    </span>
                                    {disk.holds_models && (
                                      <Chip icon={<Sparkles className="h-2.5 w-2.5" />}>
                                        {t('sys.models')}
                                      </Chip>
                                    )}
                                    <StatusBadge level={level} />
                                  </div>
                                  <span
                                    className="shrink-0 text-[11px] font-bold tabular-nums"
                                    style={{ color: level === 'ok' ? undefined : STATUS_COLOR[level] }}
                                  >
                                    {disk.percent.toFixed(0)}%
                                  </span>
                                </div>
                                <Meter
                                  percent={disk.percent}
                                  color={markColor(SERIES.ram, level)}
                                  caption={`${formatBytes(disk.used_bytes)} / ${formatBytes(disk.total_bytes)}`}
                                  trailing={t('sys.free', { value: formatBytes(disk.free_bytes) })}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {latest.disk_io && (
                      <Card
                        icon={<HardDrive className="h-3.5 w-3.5" />}
                        title={t('sys.diskIo')}
                        subtitle={`${t('sys.read')} ${formatRate(latest.disk_io.read_bytes_per_sec)} · ${t('sys.write')} ${formatRate(latest.disk_io.write_bytes_per_sec)}`}
                        color={SERIES.in}
                      >
                        <MetricChart
                          label={t('sys.diskIoChart')}
                          series={ioSeries}
                          max="auto"
                          formatValue={formatRate}
                        />
                      </Card>
                    )}

                    {latest.network && (
                      <Card
                        icon={<Network className="h-3.5 w-3.5" />}
                        title={t('sys.network')}
                        subtitle={`↓ ${formatRate(latest.network.received_bytes_per_sec)} · ↑ ${formatRate(latest.network.sent_bytes_per_sec)}`}
                        color={SERIES.in}
                      >
                        <MetricChart
                          label={t('sys.networkChart')}
                          series={netSeries}
                          max="auto"
                          formatValue={formatRate}
                        />
                      </Card>
                    )}

                    {latest.process && (
                      <Card
                        icon={<Gauge className="h-3.5 w-3.5" />}
                        title={t('sys.process')}
                        subtitle={`PID ${latest.process.pid}`}
                        value={formatBytes(latest.process.memory_bytes)}
                        color={SERIES.cpu}
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <Chip icon={<Cpu className="h-3 w-3" />}>
                            {latest.process.cpu_percent.toFixed(1)}%
                          </Chip>
                          <Chip>{latest.process.threads} {t('sys.threads')}</Chip>
                          {latest.gpu_backend && <Chip>{latest.gpu_backend}</Chip>}
                        </div>
                        {latest.models_path && (
                          <p className="mt-2 break-all text-[10px] text-surface-400">
                            {t('sys.modelsAt', { path: latest.models_path })}
                          </p>
                        )}
                      </Card>
                    )}
                  </div>

                  {latest.gpus.length === 0 && (
                    <p className="mt-3 text-center text-[10px] text-surface-400">
                      {t('sys.noGpu')} — {t('sys.gpuHint')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
