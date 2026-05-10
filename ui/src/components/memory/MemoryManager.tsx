import { useState, useEffect, useCallback } from 'react';
import { Brain, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getMemoryFacts, clearMemoryFacts, getMemoryEpisodes, clearMemoryEpisodes } from '@/lib/api';
import type { MemoryFact, EpisodicMemory } from '@/lib/types';

interface MemoryManagerProps {
  open: boolean;
  onClose: () => void;
}

export function MemoryManager({ open, onClose }: MemoryManagerProps) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [episodes, setEpisodes] = useState<EpisodicMemory[]>([]);
  const [factsCount, setFactsCount] = useState(0);
  const [episodesCount, setEpisodesCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFacts, setShowFacts] = useState(true);
  const [showEpisodes, setShowEpisodes] = useState(true);
  const [confirmClearFacts, setConfirmClearFacts] = useState(false);
  const [confirmClearEpisodes, setConfirmClearEpisodes] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [factsRes, episodesRes] = await Promise.all([
        getMemoryFacts(),
        getMemoryEpisodes(20, 0),
      ]);
      setFacts(factsRes.facts);
      setFactsCount(factsRes.count);
      setEpisodes(episodesRes.episodes);
      setEpisodesCount(episodesRes.count);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
      setConfirmClearFacts(false);
      setConfirmClearEpisodes(false);
    }
  }, [open, loadData]);

  const handleClearFacts = async () => {
    await clearMemoryFacts();
    setFacts([]);
    setFactsCount(0);
    setConfirmClearFacts(false);
  };

  const handleClearEpisodes = async () => {
    await clearMemoryEpisodes();
    setEpisodes([]);
    setEpisodesCount(0);
    setConfirmClearEpisodes(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Memory">
      <div className="max-h-[60vh] space-y-4 overflow-y-auto scrollbar-thin">
        {/* Refresh */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-surface-400">
            NOVA remembers facts and past conversations to provide better context.
          </p>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Facts section */}
        <div className="rounded-lg border border-surface-700/50 bg-surface-800/30">
          <button
            onClick={() => setShowFacts(!showFacts)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          >
            {showFacts ? <ChevronDown className="h-3 w-3 text-surface-500" /> : <ChevronRight className="h-3 w-3 text-surface-500" />}
            <Brain className="h-3.5 w-3.5 text-primary-500" />
            <span className="flex-1 text-xs font-medium text-surface-200">
              Known Facts
            </span>
            <span className="text-[10px] text-surface-500">{factsCount}</span>
          </button>

          {showFacts && (
            <div className="border-t border-surface-700/30 px-3 py-2">
              {facts.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-surface-500">
                  No facts stored yet. Chat with NOVA to build memory.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {facts.map((f) => (
                    <div
                      key={f.key}
                      className="flex items-baseline gap-2 rounded px-2 py-1 text-xs hover:bg-surface-700/30"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-primary-400">
                        {f.key}
                      </span>
                      <span className="text-surface-400">=</span>
                      <span className="flex-1 text-surface-200">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {facts.length > 0 && (
                <div className="mt-2 flex justify-end border-t border-surface-700/30 pt-2">
                  {confirmClearFacts ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-surface-400">Clear all facts?</span>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmClearFacts(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={handleClearFacts}
                      >
                        Confirm
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-red-400 hover:text-red-300"
                      onClick={() => setConfirmClearFacts(true)}
                    >
                      <Trash2 className="h-3 w-3" /> Clear Facts
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Episodes section */}
        <div className="rounded-lg border border-surface-700/50 bg-surface-800/30">
          <button
            onClick={() => setShowEpisodes(!showEpisodes)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          >
            {showEpisodes ? <ChevronDown className="h-3 w-3 text-surface-500" /> : <ChevronRight className="h-3 w-3 text-surface-500" />}
            <Brain className="h-3.5 w-3.5 text-amber-500" />
            <span className="flex-1 text-xs font-medium text-surface-200">
              Conversation Summaries
            </span>
            <span className="text-[10px] text-surface-500">{episodesCount}</span>
          </button>

          {showEpisodes && (
            <div className="border-t border-surface-700/30 px-3 py-2">
              {episodes.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-surface-500">
                  No conversation summaries yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {episodes.map((e) => (
                    <div
                      key={e.session_id}
                      className="rounded border border-surface-700/30 px-2.5 py-2 text-xs"
                    >
                      <p className="text-surface-200">{e.summary}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {e.key_topics.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-surface-700/50 px-1.5 py-0.5 text-[10px] text-surface-400"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-surface-500">
                        {e.message_count} messages
                        {e.created_at ? ` \u00b7 ${new Date(e.created_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {episodes.length > 0 && (
                <div className="mt-2 flex justify-end border-t border-surface-700/30 pt-2">
                  {confirmClearEpisodes ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-surface-400">Clear all episodes?</span>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmClearEpisodes(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={handleClearEpisodes}
                      >
                        Confirm
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-red-400 hover:text-red-300"
                      onClick={() => setConfirmClearEpisodes(true)}
                    >
                      <Trash2 className="h-3 w-3" /> Clear Episodes
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
