import { useSyncExternalStore } from 'react';
import { getRunningSessions, subscribeAll } from '@/lib/chatRuns';

/**
 * Ids of the chats that are generating right now.
 *
 * Generations survive navigating away, so the sidebar has to say which chats
 * are still working — otherwise a chat left mid-answer looks abandoned.
 */
export function useRunningSessions(): string[] {
  return useSyncExternalStore(subscribeAll, getRunningSessions);
}
