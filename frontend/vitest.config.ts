import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Frontend test config — jsdom + React Testing Library (constitution VII). */
export default defineConfig({
  plugins: [react()],
  /**
   * The image editor (and its Konva/canvas dependencies) is reachable only through a dynamic
   * import that no test ever triggers — jsdom has no canvas to render it into. Excluding it
   * from dependency pre-bundling keeps the test run from spending minutes optimizing a package
   * it will never load.
   */
  optimizeDeps: {
    exclude: ['react-filerobot-image-editor', 'react-konva', 'konva'],
  },
  resolve: {
    alias: {
      // `heic-decode` pulls in libheif-js: megabytes of asm.js that Vite must transform before
      // it can finish the module graph, stalling every run. Nothing under test decodes HEIC,
      // so tests resolve a stub; production still gets the real decoder in its lazy chunk.
      'heic-decode': fileURLToPath(new URL('./tests/stubs/heic-decode.ts', import.meta.url)),
      // Same reason: Konva + a canvas renderer cannot run in jsdom, and transforming them
      // stalls the module graph. Our side of the boundary — lazy loading, and the save
      // round-trip — is what the tests exercise.
      'react-filerobot-image-editor': fileURLToPath(
        new URL('./tests/stubs/filerobot.tsx', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
