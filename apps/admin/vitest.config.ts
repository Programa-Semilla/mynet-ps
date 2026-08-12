import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

import { componentProject, unitProject } from '../../packages/config/vitest.base.js'

/**
 * T004 (011) — a convenience entry point, **not a second source of truth**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The shared projects in `packages/config/vitest.base.ts` already name this app's directories,
 * so `pnpm test:unit` and `pnpm test:component` at the repository root run the administrative
 * tests as part of the same gate that runs everything else. That is deliberate: a per-app
 * runner that the root gates do not reach is how a suite ends up green while a whole
 * application's tests never execute — the exact failure 010's review found in a `skipIf`.
 *
 * This file exists so `vitest --config apps/admin/vitest.config.ts` works from inside the
 * package while iterating. It imports the very same project objects rather than restating
 * their globs, and it sets `root` to the repository root because those globs are written
 * relative to it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    projects: [unitProject, componentProject],
  },
})
