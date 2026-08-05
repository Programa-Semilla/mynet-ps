import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite reads `.env` from the project root by default, which here is `apps/web`. The single
  // `.env` this workspace documents in `.env.example` sits at the repository root, so without
  // this the client silently builds with no `VITE_API_BASE_URL` and calls its own origin.
  // Only `VITE_`-prefixed values are exposed, so pointing at the shared file does not widen
  // what reaches the bundle (FR-041).
  envDir: resolve('../..'),
  resolve: {
    alias: {
      '@mynet/platform/web': resolve('../../packages/platform/src/web/index.ts'),
      '@mynet/platform': resolve('../../packages/platform/src/index.ts'),
      '@mynet/data/http': resolve('../../packages/data/src/http/index.ts'),
      '@mynet/data': resolve('../../packages/data/src/index.ts'),
      '@': resolve('./src'),
    },
  },
  server: {
    port: 5173,
  },
  // The end-to-end suite runs against `vite preview`, and the API's CORS allow-list is a single
  // origin read from WEB_ORIGIN. Preview must therefore answer on the same port the dev server
  // does, rather than Vite's default 4173 — otherwise every cross-origin request in the suite
  // is refused for a reason that has nothing to do with the code under test.
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Sourcemaps are what make the asset-budget failure legible: FR-072 fails the build on
    // total size, and the reviewer needs to see *what* grew, not just that it did.
    sourcemap: true,
  },
})
