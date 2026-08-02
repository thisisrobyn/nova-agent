import { useEffect, useState } from 'react';
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
}

let cache: ConnectionsState = { connections: [], isAdmin: false };
let loaded = false;
const listeners = new Set<(s: ConnectionsState) => void>();

/** Re-fetch from the API and notify every subscriber. */
export async function refreshConnections(): Promise<ConnectionsState> {
  try {
    const data = await getConnections();
    cache = { connections: data.connections, isAdmin: data.is_admin };
  } catch {
    cache = { connections: [], isAdmin: false };
  }
  loaded = true;
  listeners.forEach((notify) => notify(cache));
  return cache;
}

export function useConnections() {
  const [state, setState] = useState<ConnectionsState>(cache);

  useEffect(() => {
    listeners.add(setState);
    // Only the first subscriber triggers the initial fetch.
    if (!loaded) refreshConnections();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return { connections: state.connections, isAdmin: state.isAdmin, refresh: refreshConnections };
}
