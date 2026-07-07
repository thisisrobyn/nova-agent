import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, BookOpen, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Upload, FileText, AlertCircle, CheckCircle, Loader2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import {
  getMemoryFacts, clearMemoryFacts, getMemoryEpisodes, clearMemoryEpisodes,
  uploadDocument, getDocuments, deleteDocument,
} from '@/lib/api';
import type { MemoryFact, EpisodicMemory, DocumentInfo } from '@/lib/types';

interface IntelligencePanelProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'memory' | 'knowledge';

export function IntelligencePanel({ open, onClose }: IntelligencePanelProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('memory');

  return (
    <Modal open={open} onClose={onClose} title={t('intel.title')}>
      <div className="mb-4 flex gap-1 border-b border-surface-700/50">
        {(['memory', 'knowledge'] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
              tab === tb
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-surface-500 hover:text-surface-300'
            }`}
          >
            {tb === 'memory' ? <Brain className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
            {t(tb === 'memory' ? 'intel.memory' : 'intel.knowledge')}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {tab === 'memory' ? <MemoryTab open={open} /> : <KnowledgeTab open={open} />}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

/* ── Memory tab ────────────────────────────────────────────── */

function MemoryTab({ open }: { open: boolean }) {
  const { t } = useI18n();
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [episodes, setEpisodes] = useState<EpisodicMemory[]>([]);
  const [factsCount, setFactsCount] = useState(0);
  const [episodesCount, setEpisodesCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFacts, setShowFacts] = useState(true);
  const [showEpisodes, setShowEpisodes] = useState(true);
  const [confirmFacts, setConfirmFacts] = useState(false);
  const [confirmEpisodes, setConfirmEpisodes] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, e] = await Promise.all([getMemoryFacts(), getMemoryEpisodes(20, 0)]);
      setFacts(f.facts);
      setFactsCount(f.count);
      setEpisodes(e.episodes);
      setEpisodesCount(e.count);
    } catch { /* silently fail */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { loadData(); setConfirmFacts(false); setConfirmEpisodes(false); }
  }, [open, loadData]);

  return (
    <div className="max-h-[55vh] space-y-4 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <p className="text-xs text-surface-400">{t('intel.memoryHint')}</p>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Facts */}
      <div className="rounded-lg border border-surface-700/50 bg-surface-800/30">
        <button onClick={() => setShowFacts(!showFacts)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          {showFacts ? <ChevronDown className="h-3 w-3 text-surface-500" /> : <ChevronRight className="h-3 w-3 text-surface-500" />}
          <Brain className="h-3.5 w-3.5 text-primary-500" />
          <span className="flex-1 text-xs font-medium text-surface-200">{t('intel.knownFacts')}</span>
          <span className="text-[10px] text-surface-500">{factsCount}</span>
        </button>
        {showFacts && (
          <div className="border-t border-surface-700/30 px-3 py-2">
            {facts.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-surface-500">{t('intel.noFacts')}</p>
            ) : (
              <div className="space-y-1.5">
                {facts.map((f) => (
                  <div key={f.key} className="flex items-baseline gap-2 rounded px-2 py-1 text-xs hover:bg-surface-700/30">
                    <span className="shrink-0 font-mono text-[11px] text-primary-400">{f.key}</span>
                    <span className="text-surface-400">=</span>
                    <span className="flex-1 text-surface-200">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
            {facts.length > 0 && (
              <div className="mt-2 flex justify-end border-t border-surface-700/30 pt-2">
                {confirmFacts ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-surface-400">{t('intel.clearAllQ')}</span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmFacts(false)}>{t('intel.cancel')}</Button>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"
                      onClick={async () => { await clearMemoryFacts(); setFacts([]); setFactsCount(0); setConfirmFacts(false); }}>
                      {t('intel.confirm')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-1 text-red-400 hover:text-red-300" onClick={() => setConfirmFacts(true)}>
                    <Trash2 className="h-3 w-3" /> {t('intel.clearFacts')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Episodes */}
      <div className="rounded-lg border border-surface-700/50 bg-surface-800/30">
        <button onClick={() => setShowEpisodes(!showEpisodes)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          {showEpisodes ? <ChevronDown className="h-3 w-3 text-surface-500" /> : <ChevronRight className="h-3 w-3 text-surface-500" />}
          <Brain className="h-3.5 w-3.5 text-amber-500" />
          <span className="flex-1 text-xs font-medium text-surface-200">{t('intel.summaries')}</span>
          <span className="text-[10px] text-surface-500">{episodesCount}</span>
        </button>
        {showEpisodes && (
          <div className="border-t border-surface-700/30 px-3 py-2">
            {episodes.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-surface-500">{t('intel.noSummaries')}</p>
            ) : (
              <div className="space-y-2">
                {episodes.map((e) => (
                  <div key={e.session_id} className="rounded border border-surface-700/30 px-2.5 py-2 text-xs">
                    <p className="text-surface-200">{e.summary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {e.key_topics.map((topic) => (
                        <span key={topic} className="rounded bg-surface-700/50 px-1.5 py-0.5 text-[10px] text-surface-400">{topic}</span>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-surface-500">
                      {e.message_count} {t('intel.messages')}
                      {e.created_at ? ` · ${new Date(e.created_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {episodes.length > 0 && (
              <div className="mt-2 flex justify-end border-t border-surface-700/30 pt-2">
                {confirmEpisodes ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-surface-400">{t('intel.clearAllQ')}</span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmEpisodes(false)}>{t('intel.cancel')}</Button>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"
                      onClick={async () => { await clearMemoryEpisodes(); setEpisodes([]); setEpisodesCount(0); setConfirmEpisodes(false); }}>
                      {t('intel.confirm')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-1 text-red-400 hover:text-red-300" onClick={() => setConfirmEpisodes(true)}>
                    <Trash2 className="h-3 w-3" /> {t('intel.clearSummaries')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Knowledge tab ─────────────────────────────────────────── */

const ALLOWED = ['pdf', 'txt', 'md'];
const MAX_SIZE = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-950/50 text-green-400 border-green-800/50',
    processing: 'bg-amber-950/50 text-amber-400 border-amber-800/50',
    pending: 'bg-blue-950/50 text-blue-400 border-blue-800/50',
    error: 'bg-red-950/50 text-red-400 border-red-800/50',
  };
  const icons: Record<string, typeof CheckCircle> = {
    ready: CheckCircle, processing: Loader2, pending: Loader2, error: AlertCircle,
  };
  const Icon = icons[status] || AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status] || styles.error}`}>
      <Icon className={`h-2.5 w-2.5 ${status === 'processing' || status === 'pending' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

function KnowledgeTab({ open }: { open: boolean }) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try { setDocuments((await getDocuments()).documents); }
    catch { /* silently fail */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { loadDocuments(); setError(null); setConfirmDelete(null); }
  }, [open, loadDocuments]);

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.includes(ext)) { setError(t('intel.unsupported', { types: ALLOWED.join(', ') })); return; }
    if (file.size > MAX_SIZE) { setError(t('intel.tooLarge', { size: formatBytes(file.size) })); return; }
    setUploading(true); setError(null);
    try { await uploadDocument(file); await loadDocuments(); }
    catch (e) { setError(e instanceof Error ? e.message : t('intel.uploadError')); }
    finally { setUploading(false); }
  };

  return (
    <div className="max-h-[55vh] space-y-4 overflow-y-auto scrollbar-thin">
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-primary-500 bg-primary-950/20' : 'border-surface-700/50 hover:border-surface-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files)[0]; if (f) handleUpload(f); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
        {uploading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" /> : <Upload className="mx-auto h-8 w-8 text-surface-500" />}
        <p className="mt-2 text-xs text-surface-300">{uploading ? t('intel.uploading') : t('intel.dropFile')}</p>
        <p className="mt-1 text-[10px] text-surface-500">{t('intel.fileHint')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-surface-300">
          <BookOpen className="h-3.5 w-3.5 text-primary-500" /> {t('intel.documents')} ({documents.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={loadDocuments} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-surface-500">{t('intel.noDocuments')}</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2.5 rounded-lg border border-surface-700/30 px-3 py-2.5 hover:bg-surface-800/30">
              <FileText className="h-4 w-4 shrink-0 text-surface-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-surface-200">{doc.name}</p>
                <p className="text-[10px] text-surface-500">
                  {formatBytes(doc.size_bytes)}
                  {doc.chunk_count > 0 && ` · ${doc.chunk_count} ${t('intel.chunks')}`}
                  {doc.created_at && ` · ${new Date(doc.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <StatusBadge status={doc.status} />
              {confirmDelete === doc.id ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="px-1.5 text-red-400 hover:text-red-300"
                    onClick={async () => { try { await deleteDocument(doc.id); setDocuments((p) => p.filter((d) => d.id !== doc.id)); setConfirmDelete(null); } catch { setError(t('intel.deleteError')); } }}>
                    {t('intel.yes')}
                  </Button>
                  <Button variant="ghost" size="sm" className="px-1.5" onClick={() => setConfirmDelete(null)}>{t('intel.no')}</Button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(doc.id)} className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-red-400" title={t('intel.deleteDoc')}>
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
