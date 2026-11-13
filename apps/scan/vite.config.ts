import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// Phone cameras require HTTPS, so dev serves a self-signed cert on the LAN.
// SCAN_HTTP=1 serves plain HTTP (localhost camera still works on desktop).
export default defineConfig({
  plugins: process.env.SCAN_HTTP === '1' ? [] : [basicSsl()],
  resolve: {
    alias: {
      '@tryon/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
});
