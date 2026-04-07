/**
 * Utility to read various file types and extract text content.
 * Supports plain text files and PDFs.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const TEXT_EXTENSIONS = new Set([
  // Documents
  'txt', 'md', 'rst', 'rtf', 'csv', 'tsv',
  // Data
  'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  // Code
  'py', 'js', 'ts', 'tsx', 'jsx', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua',
  'r', 'jl', 'pl', 'pm', 'ex', 'exs', 'erl', 'hs', 'clj',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg', 'vue', 'svelte',
  // Shell / config
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'env', 'gitignore', 'dockerignore', 'dockerfile', 'makefile',
  'editorconfig', 'prettierrc', 'eslintrc',
  // Database
  'sql', 'prisma', 'graphql', 'gql',
  // Logs
  'log',
]);

const PDF_EXTENSIONS = new Set(['pdf']);

export interface FileReadResult {
  name: string;
  content: string;
  size: number;
}

export type FileReadError = { name: string; reason: string };

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isSupported(name: string): boolean {
  const ext = getExtension(name);
  return TEXT_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext);
}

async function readPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    if (text.trim()) pages.push(text);
  }

  return pages.join('\n\n');
}

export async function readFile(file: File): Promise<FileReadResult> {
  const ext = getExtension(file.name);

  if (PDF_EXTENSIONS.has(ext)) {
    const content = await readPdf(file);
    return { name: file.name, content, size: file.size };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const content = await file.text();
    return { name: file.name, content, size: file.size };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
