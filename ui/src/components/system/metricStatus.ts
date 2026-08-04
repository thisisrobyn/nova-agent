import { formatBytes } from '@/lib/utils';

/**
 * How a reading is doing. A card keeps its own series hue while `ok` and
 * switches to the status palette once it needs attention — always alongside an
 * icon and a word, so the colour is never the only signal.
 */
export type Level = 'ok' | 'warning' | 'critical';

/**
 * One hue per resource, validated as a set against the near-black chart
 * surface (adjacent-pair CVD ΔE 19.6, all ≥ 3:1 contrast). `in`/`out` are
 * reused across the throughput cards so direction always reads the same way.
 */
export const SERIES = {
  cpu: '#199e70',
  ram: '#3987e5',
  gpu: '#d95926',
  in: '#3987e5',
  out: '#d95926',
} as const;

/** Fixed status palette — never themed, never used for a series. */
export const STATUS_COLOR: Record<Exclude<Level, 'ok'>, string> = {
  warning: '#fab219',
  critical: '#d03b3b',
};

/** Where a percentage crosses into trouble, per resource. */
export const THRESHOLDS = {
  cpu: { warning: 85, critical: 95 },
  ram: { warning: 85, critical: 93 },
  swap: { warning: 60, critical: 85 },
  vram: { warning: 85, critical: 95 },
  disk: { warning: 85, critical: 94 },
  /** Tighter: this is the volume that stops NOVA when it fills up. */
  modelsDisk: { warning: 80, critical: 90 },
  gpuTemp: { warning: 80, critical: 88 },
  cpuTemp: { warning: 85, critical: 95 },
} as const;

/** Free space below this on the models volume is critical whatever the %. */
export const MIN_MODELS_FREE_BYTES = 15 * 1024 ** 3;

export function levelFor(
  value: number | null | undefined,
  limits: { warning: number; critical: number },
): Level {
  if (value == null) return 'ok';
  if (value >= limits.critical) return 'critical';
  if (value >= limits.warning) return 'warning';
  return 'ok';
}

/** The worst of several readings — what a card's border should show. */
export function worstLevel(...levels: Level[]): Level {
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('warning')) return 'warning';
  return 'ok';
}

/** The colour a mark wears: its own hue while healthy, status hue once not. */
export function markColor(base: string, level: Level): string {
  return level === 'ok' ? base : STATUS_COLOR[level];
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatUptime(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
