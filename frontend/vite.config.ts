import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite dev server on 5180 (constitution X). `/api` is proxied to the backend on 3100
 * so the SPA and API share an origin in dev (cookies + CSRF behave like prod).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: false,
      },
    },
  },
  preview: { port: 5180, strictPort: true },
});
