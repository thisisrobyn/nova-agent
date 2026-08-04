import { useEffect, useRef, useState } from 'react';
import { getSystemMetrics } from '@/lib/api';
import type { SystemMetrics } from '@/lib/types';

/** How far back the charts can look. */
export const HISTORY_WINDOW_MS = 6 * 60 * 1000;

/** Poll cadence. Fast enough to feel live, slow enough to stay free. */
const POLL_INTERVAL_MS = 2000;

/**
 * Samples live outside React so closing the monitor does not throw the chart
 * history away — reopening it picks the line back up where it was.
 */
let history: SystemMetrics[] = [];

function record(sample: SystemMetrics): SystemMetrics[] {
  const cutoff = sample.timestamp - HISTORY_WINDOW_MS / 1000;
  history = [...history, sample].filter((s) => s.timestamp >= cutoff);
  return history;
}

interface UseSystemMetricsResult {
  samples: SystemMetrics[];
  latest: SystemMetrics | null;
  /** Only true before the very first sample of the session arrives. */
  loading: boolean;
  /** The API host could not be reached. Counters it could not read live on `latest.error`. */
  unreachable: boolean;
}

/**
 * Poll the API host's CPU / RAM / GPU counters while `enabled`.
 *
 * Polling is chained rather than set on an interval: a slow host would
 * otherwise stack overlapping requests it is already too busy to answer.
 */
export function useSystemMetrics(enabled: boolean): UseSystemMetricsResult {
  const [samples, setSamples] = useState<SystemMetrics[]>(history);
  const [unreachable, setUnreachable] = useState(false);
  const [loading, setLoading] = useState(history.length === 0);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const sample = await getSystemMetrics(controller.signal);
        if (cancelled) return;
        setSamples(record(sample));
        setUnreachable(false);
      } catch {
        if (cancelled) return;
        setUnreachable(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timerRef.current);
    };
  }, [enabled]);

  return {
    samples,
    latest: samples.length > 0 ? samples[samples.length - 1] : null,
    loading,
    unreachable,
  };
}
