import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync, existsSync } from 'fs'

const envDir = path.resolve(__dirname, '..');

const manifestPath = path.resolve(__dirname, '../.release-please-manifest.json');
let appVersion = '0.0.0';
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  appVersion = manifest['.'] ?? '0.0.0';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');

  // Hosts allowed to reach the dev server through a reverse proxy / tunnel.
  // A leading dot allows the domain and all of its subdomains. Extra entries
  // can be added with VITE_ALLOWED_HOSTS (comma-separated).
  const allowedHosts = [
    '.robyn.es',
    '.trycloudflare.com',
    '.cfargotunnel.com',
    ...(env.VITE_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  ];

  // When served over an HTTPS tunnel the HMR client must use wss:// on port 443;
  // otherwise it tries ws://<tunnel-host>:5173 and never connects.
  const tunnelHost = env.VITE_TUNNEL_HOST?.trim();

  return {
    plugins: [react(), tailwindcss()],
    base: './',
    envDir,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      allowedHosts,
      ...(tunnelHost
        ? { hmr: { host: tunnelHost, protocol: 'wss', clientPort: 443 } }
        : {}),
      proxy: {
        '/api': 'http://localhost:8000',
      },
    },
    preview: {
      host: true,
      allowedHosts,
    },
  };
})
