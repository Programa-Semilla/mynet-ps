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
      // T004 (013) — the administrative client is a second application, and Principle VII binds
      // it in full. Its guards are the reason this line matters more than it looks:
      // `no-service-worker.test.ts` and `no-platform-dependency.test.ts` assert FR-923's
      // absences, and an absence guard that the runner cannot see is not a guard.
      'apps/admin/tests/unit/**/*.test.ts',
      // The local-run orchestration is plain `.mjs`, matching `scripts/asset-budget.mjs`. Its
      // pure logic — instance identity, drift classification — is exactly the part worth
      // testing, so the runner has to be able to see it.
      'scripts/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],

    /**
     * T001 (005) — **the route audit builds the application but never connects** (research D7).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * `apps/api/tests/unit/event-scope-audit.test.ts` calls `buildApp()`, which calls
     * `loadConfig()`, which refuses to start without the values below. The audit then walks
     * the route table and **opens no connection at all** — the requirement is transitive, not
     * real. On a developer's machine a local `.env` happened to satisfy it; in CI there is no
     * such file, so `test-unit` failed on the first missing variable and FR-230's enforcement
     * never ran once.
     *
     * That mattered more than an ordinary red test: the audit is what fails the build when a
     * route accepting a conference identifier is added without `requireEventAccess`. A gate
     * that cannot execute is not a gate, and under constitution v2.2.0 a check that did not
     * run has not passed.
     *
     * **All three of `loadConfig`'s required values are set, not just the database URL.**
     * Research D7 names `DATABASE_URL` because that is the one CI reported — it is simply the
     * first `required()` call to be evaluated. Supplying it alone would move the failure one
     * line down to `AUTH_PASSWORD_PEPPER` and leave the audit exactly as unrunnable.
     *
     * Values are syntactically valid and deliberately worthless: they satisfy the validator
     * and authenticate nobody. Because `process.loadEnvFile` never overwrites an already-set
     * variable, these also win over a developer's `.env`, which makes the unit layer hermetic
     * — it now behaves the same on a fresh clone as it does in CI, which is how it reached CI
     * broken in the first place.
     *
     * Rejected alternatives, from research D7: setting these only in the CI workflow (the test
     * would still fail on a fresh clone), moving the audit to the integration layer (which is
     * skipped whenever `db-branch` fails, so the audit would run *less* often), and making
     * `loadConfig` lazy about the database URL (weakening a production guarantee to suit a
     * test).
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    env: {
      DATABASE_URL: 'postgresql://unit-tests:unit-tests@127.0.0.1:5432/never-connected',
      AUTH_PASSWORD_PEPPER: 'unit-tests-only-not-a-secret',
      AUTH_ATTEMPT_HASH_KEY: 'unit-tests-only-not-a-secret',
    },
  },
}

/** Component tests: React Testing Library against jsdom (FR-005 component). */
export const componentProject: UserWorkspaceConfig = {
  test: {
    ...baseTest,
    name: 'component',
    environment: 'jsdom',
    globals: true,
    /**
     * One setup file for both clients, and the path is the only misleading thing about it.
     *
     * `apps/web/tests/setup.ts` configures the **jsdom environment** — the `<dialog>` shim and
     * the async-utility timeout — not the attendee product. 011's administrative dialogs
     * (`ResolveDialog`, `PromoteDialog`, `RemoveQuestionDialog`) need exactly the same shim, and
     * duplicating it would give the two clients two subtly different `showModal` stand-ins.
     * It stays where 005 put it rather than moving, because moving it would rewrite a file for
     * no behavioural reason.
     */
    setupFiles: ['apps/web/tests/setup.ts'],
    include: ['apps/web/tests/**/*.test.tsx', 'apps/admin/tests/**/*.test.tsx'],
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
