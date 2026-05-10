import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, Trash2, RefreshCw, BookOpen } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { uploadDocument, getDocuments, deleteDocument } from '@/lib/api';
import type { DocumentInfo } from '@/lib/types';

interface KnowledgeBaseProps {
  open: boolean;
  onClose: () => void;
}

const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md'];
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
    ready: CheckCircle,
    processing: Loader2,
    pending: Loader2,
    error: AlertCircle,
  };
  const Icon = icons[status] || AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status] || styles.error}`}>
      <Icon className={`h-2.5 w-2.5 ${status === 'processing' || status === 'pending' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

export function KnowledgeBase({ open, onClose }: KnowledgeBaseProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocuments();
      setDocuments(res.documents);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDocuments();
      setError(null);
      setConfirmDelete(null);
    }
  }, [open, loadDocuments]);

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(`File too large (${formatBytes(file.size)}). Max: 50 MB`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setConfirmDelete(null);
    } catch {
      setError('Failed to delete document');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files[0]);
  };

  return (
    <Modal open={open} onClose={onClose} title="Knowledge Base">
      <div className="max-h-[60vh] space-y-4 overflow-y-auto scrollbar-thin">
        {/* Upload area */}
        <div
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? 'border-primary-500 bg-primary-950/20'
              : 'border-surface-700/50 hover:border-surface-600'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
          ) : (
            <Upload className="mx-auto h-8 w-8 text-surface-500" />
          )}
          <p className="mt-2 text-xs text-surface-300">
            {uploading ? 'Uploading and processing...' : 'Drop a file here or click to upload'}
          </p>
          <p className="mt-1 text-[10px] text-surface-500">
            PDF, TXT, MD (max 50 MB)
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Document list */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-surface-300">
            <BookOpen className="h-3.5 w-3.5 text-primary-500" />
            Documents ({documents.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={loadDocuments} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {documents.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-surface-500">
            No documents uploaded yet. Upload files to build your knowledge base.
          </p>
        ) : (
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2.5 rounded-lg border border-surface-700/30 px-3 py-2.5 hover:bg-surface-800/30"
              >
                <FileText className="h-4 w-4 shrink-0 text-surface-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-surface-200">{doc.name}</p>
                  <p className="text-[10px] text-surface-500">
                    {formatBytes(doc.size_bytes)}
                    {doc.chunk_count > 0 && ` \u00b7 ${doc.chunk_count} chunks`}
                    {doc.created_at && ` \u00b7 ${new Date(doc.created_at).toLocaleDateString()}`}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
                {confirmDelete === doc.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5 text-red-400 hover:text-red-300"
                      onClick={() => handleDelete(doc.id)}
                    >
                      Yes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      onClick={() => setConfirmDelete(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-red-400"
                    title="Delete document"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
