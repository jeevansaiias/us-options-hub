import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// US Options Hub frontend dev server.
// Calls the local proxy server on :8443 for all /api/* routes.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Proxy /api/* to the local Schwab proxy. The proxy is HTTPS with a
    // self-signed mkcert; enable secure:false so Vite doesn't reject it.
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:8443',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
