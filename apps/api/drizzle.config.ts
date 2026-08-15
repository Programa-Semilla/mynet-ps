import { defineConfig } from 'drizzle-kit'

/**
 * T018 — migration generation only.
 *
 * `drizzle-kit generate` writes versioned SQL into `out`; `pnpm db:migrate` applies it
 * (research.md D6). That is FR-037: versioned, committed, applied in a defined order, and
 * readable in a diff.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `drizzle-kit push` MUST NOT be used. Not in CI, not in preview, not on your own machine.
 * It changes a database without producing a reviewable artifact, which is the "ad-hoc changes
 * to a live database" the constitution prohibits. T026 asserts no script invokes it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/',
  out: './migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  // Generated SQL is reviewed by a human, so it is formatted for reading rather than packed.
  breakpoints: true,
  strict: true,
  verbose: true,
})
