import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The administrative client's build (T003, FR-923, research R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO `VitePWA` PLUGIN HERE, AND ITS ABSENCE IS THE REQUIREMENT.**
 *
 * FR-923 says the administrative product is not installable and has no offline behaviour. The
 * cheapest way to satisfy that would have been a second entry point inside `apps/web` with the
 * PWA plugin configured to exclude it — and research R1 rejected that, because an exclusion is a
 * *configuration* that a later change can quietly widen, while a separate application has nothing
 * to exclude.
 *
 * That is what "structural rather than configured" means in the plan: there is no manifest to
 * omit an entry from, no service worker to scope away from `/admin`, and no precache glob that
 * could pick these assets up by accident. `apps/admin/tests/unit/no-service-worker.test.ts`
 * asserts the source half; this file is the build half.
 *
 * The attendee worker is registered at **root scope** and would intercept administrative
 * navigations if the two shared an origin — which is the other half of why decision 37 put
 * administration on `admin.<host>` rather than on a path (research R2).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const adminPort = Number(process.env['MYNET_ADMIN_PORT'] ?? 5174)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The single `.env` this workspace documents sits at the repository root, exactly as
  // `apps/web/vite.config.ts` records. Only `VITE_`-prefixed values are exposed (FR-041).
  envDir: resolve('../..'),
  resolve: {
    alias: {
      // No `@mynet/platform` alias, deliberately — see `tsconfig.json`.
      '@mynet/data/http': resolve('../../packages/data/src/http/index.ts'),
      '@mynet/data': resolve('../../packages/data/src/index.ts'),
      '@': resolve('./src'),
    },
  },
  server: { port: adminPort },
  preview: { port: adminPort, strictPort: true },
  build: {
    // Same reasoning as the attendee client: a size regression has to be legible as *what* grew.
    sourcemap: true,
    manifest: true,
  },
})
