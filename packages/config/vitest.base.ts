/**
 * Shared Vitest configuration (T008).
 *
 * FR-005 names three test layers that this project treats as distinct gates rather than one
 * `test` script: unit, component, and integration. They are separated because they have
 * different prerequisites — integration needs a real database (FR-069), and a pipeline that
 * cannot tell "integration was skipped" from "integration passed" violates FR-064.
 */
import type { UserWorkspaceConfig } from 'vitest/config'

/** Defaults every project inherits. */
export const baseTest = {
  clearMocks: true,
  restoreMocks: true,
  passWithNoTests: false,
  reporters: ['default'] as const,
}

/** Unit tests: pure logic, no DOM, no database, no network. */
export const unitProject: UserWorkspaceConfig = {
  test: {
    ...baseTest,
    name: 'unit',
    environment: 'node',
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/api/tests/unit/**/*.test.ts',
      'apps/web/tests/unit/**/*.test.ts',
      // The local-run orchestration is plain `.mjs`, matching `scripts/asset-budget.mjs`. Its
      // pure logic — instance identity, drift classification — is exactly the part worth
      // testing, so the runner has to be able to see it.
      'scripts/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
}

/** Component tests: React Testing Library against jsdom (FR-005 component). */
export const componentProject: UserWorkspaceConfig = {
  test: {
    ...baseTest,
    name: 'component',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['apps/web/tests/setup.ts'],
    include: ['apps/web/tests/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
}

/**
 * Integration tests: the API against a real PostgreSQL database (FR-005, FR-069).
 *
 * `passWithNoTests: false` and the absence of any skip-on-missing-database escape hatch are
 * deliberate. FR-071 forbids obtaining a green result by making a required check
 * non-blocking, and "no DATABASE_URL, so we skipped isolation" is exactly that.
 */
export const integrationProject: UserWorkspaceConfig = {
  test: {
    ...baseTest,
    name: 'integration',
    environment: 'node',
    include: ['apps/api/tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Integration tests share one database; parallel files would race on seeded rows.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}
