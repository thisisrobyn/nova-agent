import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync, existsSync } from 'fs'

const manifestPath = path.resolve(__dirname, '../.release-please-manifest.json');
let appVersion = '0.0.0';
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  appVersion = manifest['.'] ?? '0.0.0';
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  envDir: path.resolve(__dirname, '..'),
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
