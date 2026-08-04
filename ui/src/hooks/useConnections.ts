import { useEffect, useSyncExternalStore } from 'react';
import { getConnections } from '@/lib/api';
import type { ConnectionStatus } from '@/lib/types';

/**
 * Shared connection state.
 *
 * Both the sidebar (which tints the service marks by connection state) and
 * the connections panel read from here, so connecting a service updates the
 * sidebar immediately without either component knowing about the other.
 */

interface ConnectionsState {
  connections: ConnectionStatus[];
  /** Whether the current user may open the application setup wizard. */
  isAdmin: boolean;
  /** False when the last fetch failed — the data below is stale or empty. */
  ok: boolean;
}

/** Backoff for a backend that is still coming up, in ms. */
const RETRY_DELAYS = [800, 2000, 5000, 10000];

let cache: ConnectionsState = { connections: [], isAdmin: false, ok: false };
/** Identity the cache belongs to; `undefined` means "never loaded". */
let cachedIdentity: string | null | undefined;
let inflight: Promise<ConnectionsState> | null = null;
let retryTimer: number | null = null;
let retryAttempt = 0;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): ConnectionsState {
  return cache;
}

function cancelRetry() {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
}

/**
 * Re-fetch from the API and notify every subscriber.
 *
 * `identity` is the signed-in user the result belongs to; pass it so a fetch
 * made before the session was restored is not mistaken for that user's state.
 * Omit it to refresh whatever identity the cache already holds.
 */
export async function refreshConnections(
  identity?: string | null,
): Promise<ConnectionsState> {
  if (inflight) return inflight;
  const target = identity === undefined ? cachedIdentity ?? null : identity;

  inflight = (async () => {
    try {
      const data = await getConnections();
      cache = { connections: data.connections, isAdmin: data.is_admin, ok: true };
      cachedIdentity = target;
      cancelRetry();
    } catch {
      // A cold backend must not blank out marks we already had, and it must
      // not count as "loaded" either — otherwise the sidebar stays grey until
      // something else happens to ask again.
      cache = { ...cache, ok: false };
      scheduleRetry(target);
    } finally {
      inflight = null;
    }
    listeners.forEach((notify) => notify());
    return cache;
  })();

  return inflight;
}

/** Keep trying while someone is watching: the API may just be booting. */
function scheduleRetry(identity: string | null) {
  if (retryTimer !== null || listeners.size === 0) return;
  const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
  retryAttempt++;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (listeners.size > 0) refreshConnections(identity);
  }, delay);
}

/**
 * Subscribe to the shared connection state.
 *
 * @param identity Signed-in user id (or null for the local identity). When it
 *   changes — typically when the Cognito session finishes restoring after a
 *   reload — the connections are fetched again for that user.
 */
export function useConnections(identity?: string | null) {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    const stale =
      identity === undefined
        ? cachedIdentity === undefined || !cache.ok
        : cachedIdentity !== identity || !cache.ok;
    if (stale) refreshConnections(identity);
  }, [identity]);

  return {
    connections: state.connections,
    isAdmin: state.isAdmin,
    ok: state.ok,
    refresh: refreshConnections,
  };
}
