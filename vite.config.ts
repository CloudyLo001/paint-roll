import { defineConfig } from 'vite';

/**
 * Relative base so the same build works from a file path, a sub-path on GitHub
 * Pages, and the dev server without baking a repository name in.
 */
const devPort = Number(process.env.PORT ?? 5191);
const previewPort = Number(process.env.PORT ?? 4191);
const portWasAssigned = Boolean(process.env.PORT);

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: devPort,
    strictPort: portWasAssigned,
  },
  preview: {
    host: '127.0.0.1',
    port: previewPort,
    strictPort: portWasAssigned,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
