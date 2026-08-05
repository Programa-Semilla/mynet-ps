import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  build: {
    // Sourcemaps are what make the asset-budget failure legible: FR-072 fails the build on
    // total size, and the reviewer needs to see *what* grew, not just that it did.
    sourcemap: true,
  },
})
