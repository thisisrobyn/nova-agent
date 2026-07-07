import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Lang = 'en' | 'es';

const STORAGE_KEY = 'nova-lang';

type Dict = Record<string, string>;

const TRANSLATIONS: Record<Lang, Dict> = {
  en: {
    // Sidebar
    'sidebar.newSession': 'new_session',
    'sidebar.newFolder': 'New folder',
    'sidebar.intelligence': 'intelligence',
    'sidebar.scheduler': 'scheduler',
    'sidebar.history': '// history',
    'sidebar.chats': '// chats',
    'sidebar.noSessions': 'no sessions',
    'sidebar.empty': 'empty',
    'sidebar.settings': 'Settings',
    'sidebar.signOut': 'Sign out',
    'sidebar.profile': 'Profile settings',
    'sidebar.rename': 'Rename',
    'sidebar.delete': 'Delete',
    'sidebar.moveToFolder': 'Move to folder',
    'sidebar.removeFromFolder': 'Remove from folder',
    'sidebar.deleteChatQ': 'Delete this chat?',
    'sidebar.cancel': 'Cancel',
    'sidebar.editFolder': 'Edit folder',
    'sidebar.deleteFolder': 'Delete folder',
    'sidebar.dropToRemove': 'drop here to remove from folder',
    // Chat
    'chat.placeholder': '$ message nova...',
    'chat.attach': 'Attach files',
    'chat.subtitle': 'Neural Orchestration & Virtual Agent',
    'chat.dropFiles': 'drop files here',
    'chat.dropSub': 'attach to conversation',
    'chat.sessionUnavailable': 'Session data unavailable',
    'chat.sessionUnavailableDesc': 'The message history for this conversation could not be recovered. You can start a new message or create a new session.',
    'chat.retry': 'retry',
    'chat.unsupportedFile': 'Unsupported file: {name}',
    'chat.unsupportedFiles': '{n} unsupported files',
    // Intelligence
    'intel.title': 'Intelligence',
    'intel.memory': 'memory',
    'intel.knowledge': 'knowledge',
    'intel.memoryHint': 'NOVA remembers facts and conversations for better context.',
    'intel.knownFacts': 'Known facts',
    'intel.noFacts': 'No facts yet. Chat with NOVA to build memory.',
    'intel.clearFacts': 'Clear facts',
    'intel.summaries': 'Conversation summaries',
    'intel.noSummaries': 'No summaries yet.',
    'intel.clearSummaries': 'Clear summaries',
    'intel.clearAllQ': 'Clear all?',
    'intel.cancel': 'Cancel',
    'intel.confirm': 'Confirm',
    'intel.messages': 'messages',
    'intel.dropFile': 'Drop a file or click to upload',
    'intel.uploading': 'Uploading and processing...',
    'intel.fileHint': 'PDF, TXT, MD (max 50 MB)',
    'intel.documents': 'Documents',
    'intel.noDocuments': 'No documents yet. Upload files to build your knowledge base.',
    'intel.deleteDoc': 'Delete document',
    'intel.unsupported': 'Unsupported type. Allowed: {types}',
    'intel.tooLarge': 'File too large ({size}). Max: 50 MB',
    'intel.uploadError': 'Upload failed',
    'intel.deleteError': 'Delete failed',
    'intel.chunks': 'chunks',
    'intel.yes': 'Yes',
    'intel.no': 'No',
    // Settings
    'set.title': 'Settings',
    'set.language': 'language',
    'set.provider': 'provider',
    'set.active': 'ACTIVE',
    'set.temperature': 'temperature',
    'set.precise': 'Precise · Creative',
    'set.save': 'Save',
    'set.tempSaved': 'Temperature saved',
    'set.tempError': 'Failed to save temperature',
    'set.anthropicTempNote': 'Temperature does not apply to the newest Claude models.',
    'set.ollamaRunning': 'Ollama running',
    'set.ollamaOff': 'Ollama stopped',
    'set.refresh': 'Refresh',
    'set.turnOn': 'Turn on',
    'set.download': 'Download',
    'set.startError': 'Could not start Ollama',
    'set.activeModel': 'Active model: {model}',
    'set.activeModelLabel': 'Active model',
    'set.modelError': 'Failed to change model',
    'set.downloadError': 'Failed to download model',
    'set.downloaded': '{model} downloaded',
    'set.apiKey': '{provider} api key',
    'set.keyStored': 'Key saved',
    'set.connect': 'Connect',
    'set.invalidKey': 'Invalid API key',
    'set.noModels': 'No models available for this key',
    'set.testError': 'Failed to validate the API key',
    'set.availableModels': 'available models',
    'set.applyError': 'Failed to apply model (check the API key)',
    'set.loadError': 'Error loading settings',
  },
  es: {
    'sidebar.newSession': 'nueva_sesión',
    'sidebar.newFolder': 'Nueva carpeta',
    'sidebar.intelligence': 'inteligencia',
    'sidebar.scheduler': 'programador',
    'sidebar.history': '// historial',
    'sidebar.chats': '// chats',
    'sidebar.noSessions': 'sin sesiones',
    'sidebar.empty': 'vacía',
    'sidebar.settings': 'Ajustes',
    'sidebar.signOut': 'Cerrar sesión',
    'sidebar.profile': 'Ajustes de perfil',
    'sidebar.rename': 'Renombrar',
    'sidebar.delete': 'Borrar',
    'sidebar.moveToFolder': 'Mover a carpeta',
    'sidebar.removeFromFolder': 'Quitar de la carpeta',
    'sidebar.deleteChatQ': '¿Borrar este chat?',
    'sidebar.cancel': 'Cancelar',
    'sidebar.editFolder': 'Editar carpeta',
    'sidebar.deleteFolder': 'Borrar carpeta',
    'sidebar.dropToRemove': 'suelta aquí para quitar de la carpeta',
    'chat.placeholder': '$ mensaje a nova...',
    'chat.attach': 'Adjuntar archivos',
    'chat.subtitle': 'Neural Orchestration & Virtual Agent',
    'chat.dropFiles': 'suelta los archivos aquí',
    'chat.dropSub': 'adjuntar a la conversación',
    'chat.sessionUnavailable': 'Datos de sesión no disponibles',
    'chat.sessionUnavailableDesc': 'No se pudo recuperar el historial de esta conversación. Puedes empezar un mensaje nuevo o crear una sesión nueva.',
    'chat.retry': 'reintentar',
    'chat.unsupportedFile': 'Archivo no soportado: {name}',
    'chat.unsupportedFiles': '{n} archivos no soportados',
    'intel.title': 'Inteligencia',
    'intel.memory': 'memoria',
    'intel.knowledge': 'conocimiento',
    'intel.memoryHint': 'NOVA recuerda datos y conversaciones para dar mejor contexto.',
    'intel.knownFacts': 'Datos conocidos',
    'intel.noFacts': 'Aún no hay datos. Habla con NOVA para construir memoria.',
    'intel.clearFacts': 'Borrar datos',
    'intel.summaries': 'Resúmenes de conversación',
    'intel.noSummaries': 'Aún no hay resúmenes.',
    'intel.clearSummaries': 'Borrar resúmenes',
    'intel.clearAllQ': '¿Borrar todo?',
    'intel.cancel': 'Cancelar',
    'intel.confirm': 'Confirmar',
    'intel.messages': 'mensajes',
    'intel.dropFile': 'Arrastra un archivo o haz clic para subir',
    'intel.uploading': 'Subiendo y procesando...',
    'intel.fileHint': 'PDF, TXT, MD (máx 50 MB)',
    'intel.documents': 'Documentos',
    'intel.noDocuments': 'Aún no hay documentos. Súbelos para construir tu base de conocimiento.',
    'intel.deleteDoc': 'Borrar documento',
    'intel.unsupported': 'Tipo no soportado. Permitidos: {types}',
    'intel.tooLarge': 'Archivo demasiado grande ({size}). Máx: 50 MB',
    'intel.uploadError': 'Error al subir',
    'intel.deleteError': 'Error al borrar',
    'intel.chunks': 'chunks',
    'intel.yes': 'Sí',
    'intel.no': 'No',
    'set.title': 'Ajustes',
    'set.language': 'idioma',
    'set.provider': 'proveedor',
    'set.active': 'ACTIVO',
    'set.temperature': 'temperatura',
    'set.precise': 'Preciso · Creativo',
    'set.save': 'Guardar',
    'set.tempSaved': 'Temperatura guardada',
    'set.tempError': 'Error al guardar la temperatura',
    'set.anthropicTempNote': 'La temperatura no se aplica a los modelos Claude más recientes.',
    'set.ollamaRunning': 'Ollama en ejecución',
    'set.ollamaOff': 'Ollama apagado',
    'set.refresh': 'Refrescar',
    'set.turnOn': 'Encender',
    'set.download': 'Descargar',
    'set.startError': 'No se pudo iniciar Ollama',
    'set.activeModel': 'Modelo activo: {model}',
    'set.activeModelLabel': 'Modelo activo',
    'set.modelError': 'Error al cambiar de modelo',
    'set.downloadError': 'Error al descargar el modelo',
    'set.downloaded': '{model} descargado',
    'set.apiKey': 'api key de {provider}',
    'set.keyStored': 'Key guardada',
    'set.connect': 'Conectar',
    'set.invalidKey': 'API key inválida',
    'set.noModels': 'Sin modelos disponibles para esta key',
    'set.testError': 'Error validando la API key',
    'set.availableModels': 'modelos disponibles',
    'set.applyError': 'Error al aplicar el modelo (revisa la API key)',
    'set.loadError': 'Error cargando ajustes',
  },
};

function detectDefault(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && navigator.language.startsWith('en') ? 'en' : 'es';
}

interface I18nContext {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nContext | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectDefault);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let str = TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
    }
    return str;
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
