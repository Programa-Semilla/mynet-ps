# One-Command Local Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm start` takes any clone or worktree of this repository from nothing to a running MyNet at a printed URL, repairing database drift caused by branch switches on the way.

**Architecture:** Small, single-responsibility `.mjs` modules under `scripts/local/`, sequenced by one orchestrator (`scripts/local-up.mjs`). All derived configuration travels through a generated, gitignored `.env.local` that every entrypoint loads _before_ `.env` — because `process.loadEnvFile` refuses to overwrite an already-set variable, loading first is what makes a value win. A dev-server-only Vite plugin and React component display the current branch and instance.

**Tech Stack:** Node 22 (`node:crypto`, `node:child_process`, `process.loadEnvFile`), pnpm 9 workspaces, Docker (`postgres:17`), drizzle-orm/postgres-js, Vite 8, React, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-one-command-local-run-design.md`

## Global Constraints

- **No new dependencies.** FR-003 requires every dependency to be justified; `pnpm-lock.yaml` is a reviewed artifact. Everything here uses Node built-ins and what is already installed.
- **`drizzle-kit push` is prohibited** in every environment, including a developer machine. Migrations are the only path a schema change travels.
- **Colour literals are a lint error** (`mynet/no-colour-literals`, SC-009) everywhere under `apps/web/**` except `src/theme/tokens.css`. Use existing Tailwind token classes: `bg-surface-inverse`, `text-text-inverse`, `text-navy-200`, `border-border-subtle`.
- **`no-console` is `['error', { allow: ['warn','error'] }]` for `.ts`/`.tsx` only.** `.mjs` files are unrestricted — this is why `scripts/asset-budget.mjs` uses `console.log`. New `scripts/**/*.mjs` may use `console.log` freely; new `.ts` files may not.
- **The real process environment always wins** over both `.env.local` and `.env`. This is what keeps CI pointed at its own ephemeral database branch (FR-067). Never change that ordering.
- **Nothing may reach a non-local database.** FR-007: local development must not require access to any store holding real attendee data.
- **Branch protection:** work stays on `spec/production-foundation`. Never commit to `main` or `develop`.
- **Commit message trailers**, on every commit in this plan:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF
  ```

## File Structure

| File                                            | Responsibility                                                  |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `scripts/local/instance.mjs`                    | Pure. Directory → database name, port offset, ports             |
| `scripts/local/instance.test.mjs`               | Unit tests for the above                                        |
| `scripts/local/schema.mjs`                      | Pure classification + effectful migrate/rebuild/seed            |
| `scripts/local/schema.test.mjs`                 | Unit tests for classification and journal reading               |
| `scripts/local/env-file.mjs`                    | Render `.env.local`; create `.env` from the example             |
| `scripts/local/env-file.test.mjs`               | Unit tests for rendering and secret generation                  |
| `scripts/local/postgres.mjs`                    | Docker container and database lifecycle                         |
| `scripts/local/servers.mjs`                     | Spawn dev servers, wait for readiness, render the banner        |
| `scripts/local/servers.test.mjs`                | Unit tests for banner rendering                                 |
| `scripts/local-up.mjs`                          | Orchestration, exit codes, signal handling                      |
| `apps/api/src/env.ts`                           | _Modify._ Load `.env.local` then `.env`                         |
| `e2e/support/env.ts`                            | _Modify._ Same                                                  |
| `apps/api/tests/unit/env-precedence.test.ts`    | Unit test proving `.env.local` wins and real env beats both     |
| `apps/web/vite.config.ts`                       | _Modify._ Env-driven ports; register the dev-legend plugin      |
| `apps/web/src/dev/head.ts`                      | Pure. Git HEAD contents → branch name                           |
| `apps/web/src/dev/branch-plugin.ts`             | Vite plugin: watch HEAD, serve the virtual module, push updates |
| `apps/web/src/dev/DevLegend.tsx`                | Presentational component, props only                            |
| `apps/web/src/dev/mount.tsx`                    | The only file touching the virtual module and the websocket     |
| `apps/web/src/main.tsx`                         | _Modify._ Dynamic import behind `import.meta.env.DEV`           |
| `apps/web/src/theme/tokens.css`                 | _Modify._ Add `--spacing-dev-legend: 0px`                       |
| `apps/web/src/shell/MobileNav.tsx`              | _Modify._ Offset by the token                                   |
| `apps/web/src/shell/AppShell.tsx`               | _Modify._ Offset by the token                                   |
| `apps/web/tests/unit/head.test.ts`              | Unit tests for HEAD parsing                                     |
| `apps/web/tests/dev-legend.test.tsx`            | Component tests                                                 |
| `e2e/navigation.spec.ts`                        | _Modify._ Assert the legend is absent from the production build |
| `packages/config/vitest.base.ts`                | _Modify._ Add `scripts/**/*.test.mjs` to the unit project       |
| `package.json`                                  | _Modify._ Add the `start` script                                |
| `README.md`                                     | _Modify._ Setup and Run collapse to `pnpm start`                |
| `specs/001-production-foundation/quickstart.md` | _Modify._ Eight corrections                                     |

---

### Task 1: Instance identity

Pure functions mapping a directory to the database name and ports that make parallel instances possible. This task also opens `scripts/` to the unit test runner, which every later script task depends on.

**Files:**

- Create: `scripts/local/instance.mjs`
- Create: `scripts/local/instance.test.mjs`
- Modify: `packages/config/vitest.base.ts` (unit project `include`)

**Interfaces:**

- Consumes: nothing
- Produces:
  - `databaseNameFor(directory: string): string`
  - `portOffsetFor(directory: string, options: { isMainWorktree: boolean }): number`
  - `instanceFor(directory: string, options: { isMainWorktree: boolean, overrides?: { databaseName?: string, portOffset?: number } }): { name, databaseName, portOffset, webPort, apiPort }`

- [ ] **Step 1: Open `scripts/` to the unit test project**

In `packages/config/vitest.base.ts`, add one entry to `unitProject.test.include`:

```ts
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/api/tests/unit/**/*.test.ts',
      'apps/web/tests/unit/**/*.test.ts',
      // The local-run orchestration is plain `.mjs`, matching `scripts/asset-budget.mjs`.
      // Its pure logic — instance identity, drift classification — is exactly the part worth
      // testing, so the runner has to be able to see it.
      'scripts/**/*.test.mjs',
    ],
```

- [ ] **Step 2: Write the failing test**

Create `scripts/local/instance.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import { databaseNameFor, instanceFor, portOffsetFor } from './instance.mjs'

describe('databaseNameFor', () => {
  it('uses the directory basename, lowercased, with separators normalised', () => {
    expect(databaseNameFor('/mnt/D/repos/mynet-ps')).toBe('mynet_ps')
    expect(databaseNameFor('/home/dev/MyNet.Feature')).toBe('mynet_feature')
  })

  it('prefixes a name that would not be a valid identifier', () => {
    // PostgreSQL identifiers may not begin with a digit.
    expect(databaseNameFor('/repos/2026-rewrite')).toBe('mynet_2026_rewrite')
  })

  it('truncates to the 63-byte identifier limit', () => {
    const long = `/repos/${'a'.repeat(80)}`
    expect(databaseNameFor(long)).toHaveLength(63)
  })
})

describe('portOffsetFor', () => {
  it('gives the main working tree offset zero, so existing bookmarks keep working', () => {
    expect(portOffsetFor('/mnt/D/repos/mynet-ps', { isMainWorktree: true })).toBe(0)
  })

  it('is stable for the same worktree path', () => {
    const first = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    const second = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    expect(first).toBe(second)
  })

  it('separates different worktree paths and stays inside the reserved band', () => {
    const a = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    const b = portOffsetFor('/repos/wt-b', { isMainWorktree: false })
    expect(a).not.toBe(b)
    for (const offset of [a, b]) {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(200)
    }
  })
})

describe('instanceFor', () => {
  it('derives both ports from the offset', () => {
    const instance = instanceFor('/repos/wt-a', { isMainWorktree: false })
    expect(instance.webPort).toBe(5173 + instance.portOffset)
    expect(instance.apiPort).toBe(3000 + instance.portOffset)
  })

  it('honours overrides, which is the escape hatch for two clones sharing a basename', () => {
    const instance = instanceFor('/repos/mynet-ps', {
      isMainWorktree: true,
      overrides: { databaseName: 'custom_db', portOffset: 7 },
    })
    expect(instance.databaseName).toBe('custom_db')
    expect(instance.webPort).toBe(5180)
    expect(instance.apiPort).toBe(3007)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm test:unit -- instance`
Expected: FAIL — `Failed to load .../instance.mjs`

- [ ] **Step 4: Implement**

Create `scripts/local/instance.mjs`:

```js
/**
 * Instance identity — the mechanism that lets several worktrees run at once.
 *
 * Every value here is a pure function of the directory, so the same directory always resolves
 * to the same database and the same ports. That is the property that makes a bookmark keep
 * working, and it is why nothing here reads the clock, the network, or a random source.
 */
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

/** PostgreSQL truncates identifiers past this, silently. Better to do it deliberately. */
const MAX_IDENTIFIER_LENGTH = 63

/** The band of ports reserved for instances. 200 is far more than anyone will run at once. */
const OFFSET_RANGE = 200

const BASE_WEB_PORT = 5173
const BASE_API_PORT = 3000

export const databaseNameFor = (directory) => {
  const sanitised = basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')

  // An identifier may not begin with a digit, and an empty basename is not a name at all.
  const valid = /^[a-z_]/.test(sanitised) ? sanitised : `mynet_${sanitised}`

  return valid.slice(0, MAX_IDENTIFIER_LENGTH)
}

/**
 * The main working tree keeps 5173/3000 so that the committed `.env.example`, every bookmark,
 * and every piece of existing documentation stay correct.
 *
 * A linked worktree hashes its absolute path. `sha256` rather than an ad-hoc arithmetic hash
 * because the value has to be identical across machines and Node versions — an offset that
 * drifts is worse than no offset, since it silently orphans the database the last run created.
 */
export const portOffsetFor = (directory, { isMainWorktree }) => {
  if (isMainWorktree) return 0
  return createHash('sha256').update(directory).digest().readUInt32BE(0) % OFFSET_RANGE
}

export const instanceFor = (directory, { isMainWorktree, overrides = {} }) => {
  const portOffset = overrides.portOffset ?? portOffsetFor(directory, { isMainWorktree })

  return {
    name: basename(directory),
    databaseName: overrides.databaseName ?? databaseNameFor(directory),
    portOffset,
    webPort: BASE_WEB_PORT + portOffset,
    apiPort: BASE_API_PORT + portOffset,
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm test:unit -- instance`
Expected: PASS, 8 tests

- [ ] **Step 6: Confirm nothing else broke**

Run: `pnpm test:unit && pnpm lint`
Expected: PASS both

- [ ] **Step 7: Commit**

```bash
git add scripts/local/instance.mjs scripts/local/instance.test.mjs packages/config/vitest.base.ts
git commit -m "feat: derive a database name and port pair from the working directory

Lets several worktrees run at once. The main working tree keeps 5173/3000
so existing bookmarks and .env.example stay correct; a linked worktree
hashes its absolute path with sha256, which is stable across machines.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 2: Schema drift classification

The part that makes a branch switch a non-event. Drizzle records one row per applied migration in `drizzle.__drizzle_migrations`, whose `hash` column is `sha256` of the migration file's raw contents — verified against this repository's applied row before this plan was written. Comparing that sequence against the journal tells you exactly which of three situations you are in.

**Files:**

- Create: `scripts/local/schema.mjs`
- Create: `scripts/local/schema.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `classifyDrift(committedHashes: string[], appliedHashes: string[]): 'none' | 'ahead' | 'diverged'`
  - `committedMigrations(migrationsDir: string): Array<{ tag: string, hash: string }>`

- [ ] **Step 1: Write the failing test**

Create `scripts/local/schema.test.mjs`:

```js
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { classifyDrift, committedMigrations } from './schema.mjs'

describe('classifyDrift', () => {
  it('reports no drift when the applied sequence is the committed sequence', () => {
    expect(classifyDrift(['a', 'b'], ['a', 'b'])).toBe('none')
  })

  it('reports ahead when the branch adds migrations on top', () => {
    expect(classifyDrift(['a', 'b', 'c'], ['a', 'b'])).toBe('ahead')
  })

  it('reports ahead against an empty database', () => {
    expect(classifyDrift(['a'], [])).toBe('ahead')
  })

  it('reports diverged when the branch is behind — the backward checkout case', () => {
    expect(classifyDrift(['a'], ['a', 'b'])).toBe('diverged')
  })

  it('reports diverged when an applied migration file was edited', () => {
    // Same position, different hash. Applying the rest would leave a schema nobody has.
    expect(classifyDrift(['a', 'edited'], ['a', 'b'])).toBe('diverged')
  })

  it('reports diverged when history was rewritten at the first position', () => {
    expect(classifyDrift(['x', 'b'], ['a', 'b'])).toBe('diverged')
  })
})

describe('committedMigrations', () => {
  it('reads the journal in order and hashes each migration file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynet-migrations-'))
    mkdirSync(join(dir, 'meta'))
    writeFileSync(
      join(dir, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [
          { idx: 0, version: '7', when: 1, tag: '0000_first', breakpoints: true },
          { idx: 1, version: '7', when: 2, tag: '0001_second', breakpoints: true },
        ],
      }),
    )
    writeFileSync(join(dir, '0000_first.sql'), 'CREATE TABLE a ();')
    writeFileSync(join(dir, '0001_second.sql'), 'CREATE TABLE b ();')

    const migrations = committedMigrations(dir)

    expect(migrations.map((m) => m.tag)).toEqual(['0000_first', '0001_second'])
    // sha256 of the raw file contents — the algorithm drizzle's migrator records.
    expect(migrations[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(migrations[0].hash).not.toBe(migrations[1].hash)
  })

  it('returns nothing when no journal exists yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynet-migrations-empty-'))
    expect(committedMigrations(dir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:unit -- schema`
Expected: FAIL — `Failed to load .../schema.mjs`

- [ ] **Step 3: Implement**

Create `scripts/local/schema.mjs`:

```js
/**
 * Schema drift: deciding whether the database in front of you matches the branch you are on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Drizzle records one row per applied migration in `drizzle.__drizzle_migrations`, and its
 * `hash` column is `sha256` of the migration file's raw contents. So the applied sequence and
 * the committed sequence are directly comparable, and the comparison answers the only question
 * that matters after a checkout: can these migrations be applied on top, or is this database
 * describing a history this branch does not have?
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `none` — nothing to do. `ahead` — apply the new migrations. `diverged` — the database
 * describes a history this branch does not have, so it is rebuilt from zero.
 *
 * Divergence is not an error and not a question. Locally it is the ordinary consequence of
 * checking out an older branch, and the only correct repair is to start again.
 */
export const classifyDrift = (committedHashes, appliedHashes) => {
  if (appliedHashes.length > committedHashes.length) return 'diverged'

  for (const [index, applied] of appliedHashes.entries()) {
    if (applied !== committedHashes[index]) return 'diverged'
  }

  return appliedHashes.length === committedHashes.length ? 'none' : 'ahead'
}

/**
 * The journal is the ordering authority, not the directory listing — filenames sort correctly
 * today only because the tags happen to be zero-padded, which is drizzle's convention rather
 * than a guarantee.
 */
export const committedMigrations = (migrationsDir) => {
  const journalPath = join(migrationsDir, 'meta', '_journal.json')
  if (!existsSync(journalPath)) return []

  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))

  return (journal.entries ?? []).map((entry) => {
    const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8')
    return { tag: entry.tag, hash: createHash('sha256').update(sql).digest('hex') }
  })
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test:unit -- schema`
Expected: PASS, 8 tests

- [ ] **Step 5: Verify the hash algorithm against the real database**

This guards against the whole task resting on a wrong assumption. Run:

```bash
docker start mynet-pg >/dev/null 2>&1 || true
node -e "
import('./scripts/local/schema.mjs').then(({ committedMigrations }) => {
  console.log(committedMigrations('apps/api/migrations'))
})"
docker exec mynet-pg psql -U mynet -d mynet_dev -tAc \
  'select hash from drizzle.__drizzle_migrations order by id;'
```

Expected: the `hash` printed by the script matches the `hash` in the table, character for character. If they differ, stop — the classification is meaningless and the algorithm needs re-deriving before going further.

- [ ] **Step 6: Commit**

```bash
git add scripts/local/schema.mjs scripts/local/schema.test.mjs
git commit -m "feat: classify schema drift between a database and the current branch

Compares drizzle's applied-migration hashes against the journal. Ahead
means apply; diverged — a backward checkout, or an edited migration —
means the database describes a history this branch does not have.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 3: Environment files

Renders `.env.local`, and creates `.env` with real generated secrets when it is missing. The second half is what makes a fresh clone genuinely one command.

**Files:**

- Create: `scripts/local/env-file.mjs`
- Create: `scripts/local/env-file.test.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `renderEnvLocal(values: { databaseUrl, apiPort, webOrigin, apiOrigin }): string`
  - `writeEnvLocal(root: string, values): void`
  - `ensureEnvFile(root: string): 'created' | 'present'`

- [ ] **Step 1: Write the failing test**

Create `scripts/local/env-file.test.mjs`:

```js
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ensureEnvFile, renderEnvLocal, writeEnvLocal } from './env-file.mjs'

const VALUES = {
  databaseUrl: 'postgresql://mynet:mynet@localhost:55432/mynet_ps',
  apiPort: 3000,
  webOrigin: 'http://localhost:5173',
  apiOrigin: 'http://localhost:3000',
}

describe('renderEnvLocal', () => {
  it('writes every derived value', () => {
    const rendered = renderEnvLocal(VALUES)
    expect(rendered).toContain('DATABASE_URL=postgresql://mynet:mynet@localhost:55432/mynet_ps')
    expect(rendered).toContain('API_PORT=3000')
    expect(rendered).toContain('WEB_ORIGIN=http://localhost:5173')
    expect(rendered).toContain('VITE_API_BASE_URL=http://localhost:3000')
  })

  it('says it is generated, so nobody edits it expecting the edit to survive', () => {
    expect(renderEnvLocal(VALUES)).toMatch(/generated/i)
  })

  it('carries no secret — those stay in .env', () => {
    const rendered = renderEnvLocal(VALUES)
    expect(rendered).not.toContain('AUTH_PASSWORD_PEPPER')
    expect(rendered).not.toContain('AUTH_ATTEMPT_HASH_KEY')
  })
})

describe('writeEnvLocal', () => {
  it('writes to .env.local at the given root', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeEnvLocal(root, VALUES)
    expect(readFileSync(join(root, '.env.local'), 'utf8')).toContain('API_PORT=3000')
  })
})

describe('ensureEnvFile', () => {
  it('creates .env from the example, with generated secrets substituted', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeFileSync(
      join(root, '.env.example'),
      [
        'AUTH_PASSWORD_PEPPER=replace-me-with-openssl-rand-base64-48',
        'AUTH_ATTEMPT_HASH_KEY=replace-me-with-openssl-rand-base64-48',
        'AUTH_SESSION_IDLE_DAYS=14',
      ].join('\n'),
    )

    expect(ensureEnvFile(root)).toBe('created')

    const written = readFileSync(join(root, '.env'), 'utf8')
    expect(written).not.toContain('replace-me')
    expect(written).toContain('AUTH_SESSION_IDLE_DAYS=14')

    const pepper = /AUTH_PASSWORD_PEPPER=(.+)/.exec(written)[1]
    const key = /AUTH_ATTEMPT_HASH_KEY=(.+)/.exec(written)[1]
    expect(pepper.length).toBeGreaterThan(40)
    expect(pepper).not.toBe(key)
  })

  it('never touches an existing .env', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeFileSync(join(root, '.env.example'), 'AUTH_PASSWORD_PEPPER=replace-me')
    writeFileSync(join(root, '.env'), 'AUTH_PASSWORD_PEPPER=mine\n')

    expect(ensureEnvFile(root)).toBe('present')
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('AUTH_PASSWORD_PEPPER=mine\n')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:unit -- env-file`
Expected: FAIL — `Failed to load .../env-file.mjs`

- [ ] **Step 3: Implement**

Create `scripts/local/env-file.mjs`:

```js
/**
 * The two environment files, and the division of labour between them.
 *
 * `.env` is yours: it holds the secrets and you own its contents. `.env.local` is generated on
 * every run and holds only what this directory's identity implies — which database, which
 * ports. Keeping them apart is what lets the derived half be rewritten freely without ever
 * putting a secret at risk of being clobbered.
 *
 * Both are gitignored already: `.gitignore` covers `.env.*` and `*.local`.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADER = `# GENERATED by \`pnpm start\` — do not edit; every run overwrites this file.
#
# Derived from this directory, so several worktrees can run at once without colliding.
# Secrets live in .env and are never written here.
#
# Loaded BEFORE .env. \`process.loadEnvFile\` does not overwrite an already-set variable, so
# loading first is what makes these values win — while the real process environment still beats
# both, which is what keeps CI pointed at its own database.
`

export const renderEnvLocal = ({ databaseUrl, apiPort, webOrigin, apiOrigin }) =>
  `${HEADER}
DATABASE_URL=${databaseUrl}
API_PORT=${apiPort}
WEB_ORIGIN=${webOrigin}
VITE_API_BASE_URL=${apiOrigin}
`

export const writeEnvLocal = (root, values) => {
  writeFileSync(join(root, '.env.local'), renderEnvLocal(values), 'utf8')
}

/**
 * Creates `.env` from the example when it is absent, generating real secrets rather than
 * copying the placeholders through — a placeholder pepper would work, which is worse than
 * failing, because it would make every local hash trivially reproducible.
 *
 * An existing `.env` is never read, rewritten, or inspected.
 */
export const ensureEnvFile = (root) => {
  const envPath = join(root, '.env')
  if (existsSync(envPath)) return 'present'

  const example = readFileSync(join(root, '.env.example'), 'utf8')
  const generated = example
    .replace(
      /^AUTH_PASSWORD_PEPPER=.*$/m,
      `AUTH_PASSWORD_PEPPER=${randomBytes(48).toString('base64')}`,
    )
    .replace(
      /^AUTH_ATTEMPT_HASH_KEY=.*$/m,
      `AUTH_ATTEMPT_HASH_KEY=${randomBytes(48).toString('base64')}`,
    )

  writeFileSync(envPath, generated, 'utf8')
  return 'created'
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test:unit -- env-file`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/local/env-file.mjs scripts/local/env-file.test.mjs
git commit -m "feat: generate .env.local, and .env with real secrets when absent

.env stays yours and holds the secrets; .env.local is generated per run
and holds only what this directory's identity implies. Creating .env
from the example with generated secrets is what makes a fresh clone one
command rather than three.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 4: Environment loader precedence

Make `.env.local` reach the API, the Playwright harness, and Vite. The mechanism is subtle enough to deserve a test: `process.loadEnvFile` **does not overwrite an already-set variable**, so _earlier_ load means _higher_ precedence — the reverse of what most `.env` tooling does.

**Files:**

- Modify: `apps/api/src/env.ts`
- Modify: `e2e/support/env.ts`
- Modify: `apps/web/vite.config.ts:server.port`, `preview.port`
- Create: `apps/api/tests/unit/env-precedence.test.ts`

**Interfaces:**

- Consumes: `.env.local` written by `writeEnvLocal` (Task 3)
- Produces: `loadEnvFiles(root: string): void` exported from `apps/api/src/env.ts`, replacing `loadDotEnv`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/env-precedence.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadEnvFiles } from '../../src/env.js'

const NAMES = ['MYNET_TEST_ONLY_IN_ENV', 'MYNET_TEST_IN_BOTH', 'MYNET_TEST_FROM_SHELL'] as const

afterEach(() => {
  for (const name of NAMES) delete process.env[name]
})

const rootWith = (env: string, local: string) => {
  const root = mkdtempSync(join(tmpdir(), 'mynet-env-'))
  writeFileSync(join(root, '.env'), env)
  writeFileSync(join(root, '.env.local'), local)
  return root
}

describe('loadEnvFiles', () => {
  it('lets .env.local win over .env', () => {
    // The whole mechanism in one assertion: `process.loadEnvFile` will not overwrite a variable
    // that is already set, so loading .env.local first is what makes it take precedence.
    const root = rootWith('MYNET_TEST_IN_BOTH=from_env\n', 'MYNET_TEST_IN_BOTH=from_local\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_IN_BOTH']).toBe('from_local')
  })

  it('still reads values that only .env carries', () => {
    const root = rootWith('MYNET_TEST_ONLY_IN_ENV=secret\n', 'MYNET_TEST_IN_BOTH=x\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_ONLY_IN_ENV']).toBe('secret')
  })

  it('lets the real environment beat both — this is what keeps CI on its own database', () => {
    process.env['MYNET_TEST_FROM_SHELL'] = 'from_shell'
    const root = rootWith('MYNET_TEST_FROM_SHELL=from_env\n', 'MYNET_TEST_FROM_SHELL=from_local\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_FROM_SHELL']).toBe('from_shell')
  })

  it('treats a missing file as ordinary — a deployed API is configured by its host', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-env-none-'))
    expect(() => loadEnvFiles(root)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:unit -- env-precedence`
Expected: FAIL — `loadEnvFiles` is not exported

- [ ] **Step 3: Rewrite the API loader**

Replace the body of `apps/api/src/env.ts` below its existing doc comment, keeping that comment and adding the precedence note:

```ts
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/** Repository root, from `apps/api/src/`. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Load order is reverse precedence, and that is not a mistake.**
 *
 * `process.loadEnvFile` does not overwrite a variable that is already set. So the file loaded
 * *first* wins, and the real process environment — set before any of this runs — beats every
 * file. `.env.local` therefore goes first: it is generated per directory by `pnpm start` and
 * must override the committed defaults in `.env`, while never being able to override what the
 * pipeline injected (FR-067).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const FILES = ['.env.local', '.env'] as const

let loaded = false

/** Exported with an explicit root so the precedence rule is testable rather than asserted. */
export const loadEnvFiles = (root: string): void => {
  for (const file of FILES) {
    const path = `${root}${file}`
    if (existsSync(path)) process.loadEnvFile(path)
  }
}

export const loadDotEnv = (): void => {
  if (loaded) return
  loaded = true
  loadEnvFiles(ROOT)
}

loadDotEnv()
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:unit -- env-precedence`
Expected: PASS, 4 tests

- [ ] **Step 5: Apply the same ordering to the Playwright harness**

In `e2e/support/env.ts`, replace the single-file constant and loader with the same two-file order, keeping the existing comment about the real environment winning:

```ts
/** Repository root, from `e2e/support/`. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Same reverse-precedence rule as `apps/api/src/env.ts`: first loaded wins, real env beats both.
const FILES = ['.env.local', '.env'] as const

let loaded = false

export const loadDotEnv = (): void => {
  if (loaded) return
  loaded = true
  for (const file of FILES) {
    const path = `${ROOT}${file}`
    if (existsSync(path)) process.loadEnvFile(path)
  }
}

loadDotEnv()
```

- [ ] **Step 6: Make the Vite ports follow the instance**

In `apps/web/vite.config.ts`, replace the two hardcoded `5173` values. Add near the top, after the `resolve` helper:

```ts
/**
 * The dev server and `vite preview` must both answer on the port this instance was assigned,
 * because the API's CORS allow-list is the single origin in WEB_ORIGIN. Vite loads `.env.local`
 * natively via `envDir`, but that happens after this config is evaluated — so the port is read
 * from the process environment, which `pnpm start` sets on the child it spawns.
 */
const webPort = Number(process.env['MYNET_WEB_PORT'] ?? 5173)
```

Then `server: { port: webPort }` and `preview: { port: webPort, strictPort: true }`, keeping the existing comment above `preview`.

- [ ] **Step 7: Verify nothing regressed**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`
Expected: PASS all four

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/env.ts e2e/support/env.ts apps/web/vite.config.ts apps/api/tests/unit/env-precedence.test.ts
git commit -m "feat: load .env.local ahead of .env, and make the web port follow the instance

process.loadEnvFile will not overwrite an already-set variable, so the
file loaded first wins and the real environment beats both. That last
part is what keeps CI pointed at its own ephemeral database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 5: Postgres lifecycle

Container and database management. No unit tests: every function here is a thin wrapper over `docker`, and a mock would only prove the mock was called. It is verified by running it, including the failure paths.

**Files:**

- Create: `scripts/local/postgres.mjs`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `CONTAINER = 'mynet-pg'`, `HOST_PORT = 55432`
  - `ensureContainer(): Promise<void>`
  - `ensureDatabase(name: string): Promise<void>`
  - `databaseUrlFor(name: string): string`
  - `assertLocalDatabaseUrl(url: string | undefined): void`

- [ ] **Step 1: Implement**

Create `scripts/local/postgres.mjs`:

```js
/**
 * The local PostgreSQL container.
 *
 * One container, shared by every instance, holding one database per directory. Published on
 * 55432 rather than 5432 so it cannot collide with a PostgreSQL somebody already runs on this
 * machine — a collision there is confusing in a way that costs an afternoon, because everything
 * connects and the data is simply someone else's.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const CONTAINER = 'mynet-pg'
export const HOST_PORT = 55432
const IMAGE = 'postgres:17'
const USER = 'mynet'
const PASSWORD = 'mynet'

export const databaseUrlFor = (name) =>
  `postgresql://${USER}:${PASSWORD}@localhost:${HOST_PORT}/${name}`

/**
 * FR-007, made structural. Local development must never require access to a store holding real
 * attendee data, and the cheapest way to guarantee that is to refuse to start when the
 * environment points anywhere but this machine.
 */
export const assertLocalDatabaseUrl = (url) => {
  if (!url) return
  const { hostname } = new URL(url)
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `DATABASE_URL in your environment points at ${hostname}, which is not this machine.\n` +
        'pnpm start only ever runs against a local, throwaway database (FR-007).\n' +
        'Unset DATABASE_URL in your shell and let .env.local provide it.',
    )
  }
}

const docker = async (args) => (await run('docker', args)).stdout.trim()

const dockerAvailable = async () => {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'])
    return true
  } catch {
    return false
  }
}

const containerState = async () => {
  try {
    return await docker(['inspect', '-f', '{{.State.Status}}', CONTAINER])
  } catch {
    return 'absent'
  }
}

const waitForReady = async (timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      await docker(['exec', CONTAINER, 'pg_isready', '-U', USER])
      return
    } catch {
      // Still starting. Expected for the first second or two.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const logs = await docker(['logs', '--tail', '20', CONTAINER]).catch(() => '(no logs)')
  throw new Error(`PostgreSQL did not become ready within ${timeoutMs}ms.\n\n${logs}`)
}

export const ensureContainer = async () => {
  if (!(await dockerAvailable())) {
    throw new Error(
      'Docker is not available — it is either not installed or the daemon is not running.\n\n' +
        'Start it, or run PostgreSQL yourself:\n' +
        `  docker run --name ${CONTAINER} -e POSTGRES_PASSWORD=${PASSWORD} ` +
        `-e POSTGRES_USER=${USER} \\\n    -p ${HOST_PORT}:5432 -d ${IMAGE}`,
    )
  }

  const state = await containerState()

  if (state === 'absent') {
    console.log(`Creating the ${CONTAINER} container on :${HOST_PORT}…`)
    await docker([
      'run',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_USER=${USER}`,
      '-e',
      `POSTGRES_PASSWORD=${PASSWORD}`,
      '-e',
      'POSTGRES_DB=postgres',
      '-p',
      `${HOST_PORT}:5432`,
      '-d',
      IMAGE,
    ])
  } else if (state !== 'running') {
    await docker(['start', CONTAINER])
  }

  await waitForReady()
}

/**
 * `CREATE DATABASE` cannot run inside a transaction and has no `IF NOT EXISTS`, so existence is
 * checked first. The container is never recreated to get a database — that would destroy every
 * other instance's data.
 */
export const ensureDatabase = async (name) => {
  const existing = await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    'postgres',
    '-tAc',
    `select 1 from pg_database where datname = '${name}'`,
  ])

  if (existing !== '1') {
    console.log(`Creating database ${name}…`)
    await docker([
      'exec',
      CONTAINER,
      'psql',
      '-U',
      USER,
      '-d',
      'postgres',
      '-c',
      `CREATE DATABASE "${name}"`,
    ])
  }
}

/** Applied migrations, oldest first. Empty when the schema has never been created. */
export const appliedMigrationHashes = async (name) => {
  const out = await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    name,
    '-tAc',
    'select hash from drizzle.__drizzle_migrations order by id',
  ]).catch(() => '')

  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** The rebuild path. Only ever reached for a local, per-directory database. */
export const dropSchema = async (name) => {
  await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    name,
    '-c',
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  ])
}
```

- [ ] **Step 2: Verify against the real daemon**

```bash
node -e "
import('./scripts/local/postgres.mjs').then(async (pg) => {
  await pg.ensureContainer()
  await pg.ensureDatabase('mynet_smoke_test')
  console.log('applied:', await pg.appliedMigrationHashes('mynet_smoke_test'))
  console.log('url:', pg.databaseUrlFor('mynet_smoke_test'))
})"
```

Expected: the container is created or started, the database is created, `applied:` prints `[]`, and a URL on `:55432` is printed. Run it a second time and expect it to be silent and fast — idempotence is the requirement, not a nicety.

- [ ] **Step 3: Verify the guard rejects a remote URL**

```bash
node -e "
import('./scripts/local/postgres.mjs').then((pg) => {
  try { pg.assertLocalDatabaseUrl('postgresql://u:p@ep-cool-name.neon.tech/db') }
  catch (error) { console.log('refused:', error.message.split('\n')[0]) }
})"
```

Expected: `refused: DATABASE_URL in your environment points at ep-cool-name.neon.tech, …`

- [ ] **Step 4: Clean up the smoke-test database**

```bash
docker exec mynet-pg psql -U mynet -d postgres -c 'DROP DATABASE mynet_smoke_test'
```

- [ ] **Step 5: Commit**

```bash
git add scripts/local/postgres.mjs
git commit -m "feat: manage the shared local PostgreSQL container

One container on :55432 — deliberately not 5432, so it cannot be
confused with a PostgreSQL already on the machine — holding one database
per directory. Refuses outright to run against a non-local host.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 6: Servers and the banner

Spawning both dev servers, waiting until they actually answer, and printing the thing the whole feature exists to produce. The banner is a pure function, so it is tested.

**Files:**

- Create: `scripts/local/servers.mjs`
- Create: `scripts/local/servers.test.mjs`

**Interfaces:**

- Consumes: `instanceFor` (Task 1)
- Produces:
  - `renderBanner(context: { branch, instance, database, hostPort }): string`
  - `startServers(context): Promise<{ stop: () => void }>`
  - `waitForPort(port: number, timeoutMs?: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `scripts/local/servers.test.mjs`:

```js
import { describe, expect, it } from 'vitest'

import { renderBanner } from './servers.mjs'

const CONTEXT = {
  branch: 'spec/production-foundation',
  instance: { name: 'mynet-ps', databaseName: 'mynet_ps', webPort: 5173, apiPort: 3000 },
  hostPort: 55432,
}

describe('renderBanner', () => {
  it('leads with the URL, because that is the one thing being copied', () => {
    const lines = renderBanner(CONTEXT)
      .split('\n')
      .filter((line) => line.trim())
    const urlLine = lines.findIndex((line) => line.includes('http://localhost:5173'))
    const branchLine = lines.findIndex((line) => line.includes('spec/production-foundation'))
    expect(urlLine).toBeLessThan(branchLine)
  })

  it('names the branch, instance, database and API', () => {
    const banner = renderBanner(CONTEXT)
    expect(banner).toContain('spec/production-foundation')
    expect(banner).toContain('mynet-ps')
    expect(banner).toContain('mynet_ps on localhost:55432')
    expect(banner).toContain('http://localhost:3000')
  })

  it('prints the seeded credentials, so signing in needs no second document', () => {
    const banner = renderBanner(CONTEXT)
    expect(banner).toContain('ada@example.com')
    expect(banner).toContain('correct-horse-battery-staple')
  })

  it('follows the instance rather than assuming 5173', () => {
    const banner = renderBanner({
      ...CONTEXT,
      instance: { ...CONTEXT.instance, webPort: 5241, apiPort: 3068 },
    })
    expect(banner).toContain('http://localhost:5241')
    expect(banner).toContain('http://localhost:3068')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:unit -- servers`
Expected: FAIL — `Failed to load .../servers.mjs`

- [ ] **Step 3: Implement**

Create `scripts/local/servers.mjs`:

```js
/**
 * Starting both dev servers, and the banner.
 *
 * The banner is printed only once both ports actually answer. A URL that is not yet serving is
 * worse than no URL — it gets clicked, fails, and teaches you to distrust the output.
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'

/** Matches `SEED_PASSWORD` in apps/api/src/db/seed.ts. */
const SEED_PASSWORD = 'correct-horse-battery-staple'

export const renderBanner = ({ branch, instance, hostPort }) => `
  MyNet is running

  →  http://localhost:${instance.webPort}

     branch    ${branch}
     instance  ${instance.name}
     database  ${instance.databaseName} on localhost:${hostPort}
     api       http://localhost:${instance.apiPort}

  Sign in as ada@example.com or grace@example.com
  password: ${SEED_PASSWORD}

  Ctrl-C to stop.
`

/** Resolves once something accepts a TCP connection on the port. */
export const waitForPort = async (port, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
    })

    if (open) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Nothing is listening on port ${port} after ${timeoutMs}ms.`)
}

/** True when the port is already taken — checked before starting, not after failing. */
export const portInUse = async (port) => {
  try {
    await waitForPort(port, 300)
    return true
  } catch {
    return false
  }
}

export const startServers = async ({ instance, root }) => {
  const env = {
    ...process.env,
    // Read by `apps/web/vite.config.ts`, which is evaluated before Vite loads `.env.local`.
    MYNET_WEB_PORT: String(instance.webPort),
  }

  const children = [
    spawn('pnpm', ['dev:api'], { cwd: root, env, stdio: 'inherit' }),
    spawn('pnpm', ['dev:web'], { cwd: root, env, stdio: 'inherit' }),
  ]

  const stop = () => {
    for (const child of children) child.kill('SIGTERM')
  }

  // A server that dies during startup must not leave the other running and the banner printed.
  for (const child of children) {
    child.once('exit', (code) => {
      if (code !== 0 && code !== null) {
        stop()
        process.exitCode = code
      }
    })
  }

  await Promise.all([waitForPort(instance.apiPort), waitForPort(instance.webPort)])

  return { stop }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test:unit -- servers`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/local/servers.mjs scripts/local/servers.test.mjs
git commit -m "feat: start both dev servers and print the banner once they answer

The banner waits for both ports to accept a connection first. A URL that
is not yet serving gets clicked, fails, and teaches you to distrust the
output.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 7: The orchestrator and `pnpm start`

Sequences everything. This is the task that makes the feature real.

**Files:**

- Create: `scripts/local-up.mjs`
- Modify: `package.json` (`scripts.start`)

**Interfaces:**

- Consumes: every module from Tasks 1, 2, 3, 5, 6
- Produces: `pnpm start`, `pnpm start --reset`

- [ ] **Step 1: Implement the orchestrator**

Create `scripts/local-up.mjs`:

```js
/**
 * `pnpm start` — from any clone or worktree to a running MyNet at a printed URL.
 *
 * Idempotent by construction: every step asks what state it is in before changing anything, so
 * a fresh clone, a run straight after `git checkout`, and a second run in a row all converge on
 * the same place. That property is the feature. Steps that "just do it again" would make a
 * second run destructive, and a command you hesitate to re-run is not one command.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'

import { ensureEnvFile, writeEnvLocal } from './local/env-file.mjs'
import { instanceFor } from './local/instance.mjs'
import {
  appliedMigrationHashes,
  assertLocalDatabaseUrl,
  databaseUrlFor,
  dropSchema,
  ensureContainer,
  ensureDatabase,
  HOST_PORT,
} from './local/postgres.mjs'
import { classifyDrift, committedMigrations } from './local/schema.mjs'
import { portInUse, renderBanner, startServers } from './local/servers.mjs'

const run = promisify(execFile)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = fileURLToPath(new URL('../apps/api/migrations', import.meta.url))

const reset = process.argv.includes('--reset')

const git = async (args) => (await run('git', args, { cwd: ROOT })).stdout.trim()

/**
 * A linked worktree's `.git` is a file pointing elsewhere, so `--git-dir` and `--git-common-dir`
 * differ there and are equal in the main working tree. That difference is the whole test.
 */
const isMainWorktree = async () => {
  const [gitDir, commonDir] = await Promise.all([
    git(['rev-parse', '--absolute-git-dir']),
    git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
  ])
  return gitDir === commonDir
}

const currentBranch = async () => (await git(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'detached'

const pnpm = (args, env) => run('pnpm', args, { cwd: ROOT, env: { ...process.env, ...env } })

const main = async () => {
  // Before anything is created, so a misconfigured shell fails in under a second.
  assertLocalDatabaseUrl(process.env['DATABASE_URL'])

  if (ensureEnvFile(ROOT) === 'created') {
    console.log('Created .env from .env.example, with freshly generated secrets.')
  }

  const instance = instanceFor(ROOT.replace(/\/$/, ''), {
    isMainWorktree: await isMainWorktree(),
    overrides: {
      databaseName: process.env['MYNET_DATABASE_NAME'],
      portOffset: process.env['MYNET_PORT_OFFSET']
        ? Number(process.env['MYNET_PORT_OFFSET'])
        : undefined,
    },
  })

  for (const [label, port] of [
    ['web', instance.webPort],
    ['API', instance.apiPort],
  ]) {
    if (await portInUse(port)) {
      throw new Error(
        `Port ${port} (${label}) is already in use.\n` +
          'Another instance of this directory is probably already running.\n' +
          'Stop it, or set MYNET_PORT_OFFSET to move this one out of the way.',
      )
    }
  }

  await ensureContainer()
  await ensureDatabase(instance.databaseName)

  const databaseUrl = databaseUrlFor(instance.databaseName)
  writeEnvLocal(ROOT, {
    databaseUrl,
    apiPort: instance.apiPort,
    webOrigin: `http://localhost:${instance.webPort}`,
    apiOrigin: `http://localhost:${instance.apiPort}`,
  })

  // Every child below reads DATABASE_URL from the real environment, which beats both files.
  const env = { DATABASE_URL: databaseUrl }

  const committed = committedMigrations(MIGRATIONS).map((migration) => migration.hash)
  const applied = await appliedMigrationHashes(instance.databaseName)
  const drift = reset ? 'diverged' : classifyDrift(committed, applied)

  if (drift === 'diverged') {
    console.log(
      reset
        ? 'Rebuilding the database from zero (--reset).'
        : 'This database was built from a different migration history — rebuilding it from zero.',
    )
    await dropSchema(instance.databaseName)
  }

  if (drift !== 'none') {
    await pnpm(['db:migrate'], env)
  }

  const needsSeed = drift === 'diverged' || applied.length === 0
  if (needsSeed) {
    await pnpm(['db:seed'], env)
  }

  const { stop } = await startServers({ instance, root: ROOT })

  console.log(renderBanner({ branch: await currentBranch(), instance, hostPort: HOST_PORT }))

  // Leave the container running: starting it again is cheap, and stopping it would only make
  // the next run slower for no benefit.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stop()
      process.exit(0)
    })
  }
}

main().catch((error) => {
  console.error(`\n${error.message}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 2: Add the script**

In `package.json`, add to `scripts`, directly above `"dev"`:

```json
    "start": "node scripts/local-up.mjs",
```

- [ ] **Step 3: Verify the fresh-clone path**

The strongest available test of "no undocumented step" (SC-014). Run:

```bash
git clone . /tmp/claude-1000/-mnt-D-repos-mynet-ps/5cab36ef-3f95-4e71-8fe7-bc940cff2a8f/scratchpad/clone-test
cd /tmp/claude-1000/-mnt-D-repos-mynet-ps/5cab36ef-3f95-4e71-8fe7-bc940cff2a8f/scratchpad/clone-test
pnpm install --frozen-lockfile
pnpm start
```

Expected: `.env` is created, the container is reused, a new database is created, migrations apply, seed runs, and a banner prints with a URL. Open it and sign in as `ada@example.com`. Then Ctrl-C and clean up:

```bash
cd /mnt/D/repos/mynet-ps
rm -rf /tmp/claude-1000/-mnt-D-repos-mynet-ps/5cab36ef-3f95-4e71-8fe7-bc940cff2a8f/scratchpad/clone-test
```

- [ ] **Step 4: Verify idempotence and drift repair**

```bash
pnpm start          # first run
# Ctrl-C, then:
pnpm start          # second run — expect no migrate, no seed, straight to the banner
# Ctrl-C, then force the rebuild path:
pnpm start --reset  # expect "Rebuilding the database from zero (--reset)."
```

Expected: the second run prints no migration or seed output. `--reset` prints the rebuild line and re-seeds.

- [ ] **Step 5: Verify the port guard**

With `pnpm start` running in one terminal, run `pnpm start` again in another.
Expected: it refuses, names the port, and suggests `MYNET_PORT_OFFSET` — rather than starting a half-broken second instance.

- [ ] **Step 6: Commit**

```bash
git add scripts/local-up.mjs package.json
git commit -m "feat: pnpm start — one command from a clone to a running MyNet

Ensures the container and database, repairs schema drift left by a branch
switch, migrates, seeds when needed, starts both servers, and prints the
URL once they answer. Idempotent, so a second run is never destructive.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 8: Git HEAD parsing and the Vite plugin

The dev-only half. HEAD parsing is pure and tested; the plugin around it is thin.

**Files:**

- Create: `apps/web/src/dev/head.ts`
- Create: `apps/web/src/dev/branch-plugin.ts`
- Create: `apps/web/tests/unit/head.test.ts`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**

- Consumes: `MYNET_WEB_PORT` handling from Task 4
- Produces:
  - `branchFromHead(contents: string): string`
  - `devBranchLegend(): Plugin` — default export of `branch-plugin.ts`
  - Virtual module `virtual:mynet-dev-legend` exporting `{ branch, instance, webPort, database }`
  - Websocket event `mynet:branch` with payload `{ branch: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/head.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { branchFromHead } from '../../src/dev/head.js'

describe('branchFromHead', () => {
  it('reads an ordinary branch', () => {
    expect(branchFromHead('ref: refs/heads/spec/production-foundation\n')).toBe(
      'spec/production-foundation',
    )
  })

  it('keeps slashes in the branch name rather than taking the last segment', () => {
    expect(branchFromHead('ref: refs/heads/feat/a/b\n')).toBe('feat/a/b')
  })

  it('falls back to a short SHA on a detached HEAD', () => {
    expect(branchFromHead('9f8e7d6c5b4a39281706f5e4d3c2b1a098765432\n')).toBe('9f8e7d6')
  })

  it('does not throw on an empty or unreadable HEAD', () => {
    expect(branchFromHead('')).toBe('unknown')
    expect(branchFromHead('   \n')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:unit -- head`
Expected: FAIL — cannot resolve `../../src/dev/head.js`

- [ ] **Step 3: Implement the parser**

Create `apps/web/src/dev/head.ts`:

```ts
/**
 * Parsing `.git/HEAD`.
 *
 * Separated from the plugin because it is the only part with cases worth testing, and because
 * a pure function is testable under Vitest while a Vite plugin is not.
 */
export const branchFromHead = (contents: string): string => {
  const trimmed = contents.trim()
  if (!trimmed) return 'unknown'

  // `refs/heads/feat/a/b` is one branch name containing slashes, not a path to walk.
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(trimmed)
  if (ref?.[1]) return ref[1]

  // Detached HEAD: the file holds a bare SHA.
  return trimmed.slice(0, 7)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test:unit -- head`
Expected: PASS, 4 tests

- [ ] **Step 5: Implement the plugin**

Create `apps/web/src/dev/branch-plugin.ts`:

```ts
/**
 * The dev-server side of the branch legend (`apply: 'serve'`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `apply: 'serve'` is the guarantee, not a convenience. The virtual module resolves only while
 * the dev server is running, so if the `import.meta.env.DEV` guard in `main.tsx` were ever
 * removed, `pnpm build` fails to resolve it — loudly, in CI — rather than shipping a developer
 * badge to an attendee.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, watch } from 'node:fs'
import type { Plugin } from 'vite'

import { branchFromHead } from './head.js'

const VIRTUAL_ID = 'virtual:mynet-dev-legend'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * A linked worktree's `.git` is a *file* pointing at the real git directory, so the HEAD to
 * watch cannot be assumed to be `.git/HEAD`. `rev-parse --git-path` answers correctly in both
 * layouts, which is the only reason this shells out at all.
 */
const headPath = (root: string): string | undefined => {
  try {
    return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return undefined
  }
}

const readBranch = (path: string | undefined): string => {
  if (!path) return 'unknown'
  try {
    return branchFromHead(readFileSync(path, 'utf8'))
  } catch {
    return 'unknown'
  }
}

export const devBranchLegend = (): Plugin => {
  let path: string | undefined
  let branch = 'unknown'

  return {
    name: 'mynet:dev-branch-legend',
    apply: 'serve',

    configResolved(config) {
      path = headPath(config.root)
      branch = readBranch(path)
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },

    load(id) {
      if (id !== RESOLVED_ID) return undefined

      // Everything but the branch is fixed for the life of the server, so it is inlined here
      // and only the branch travels over the websocket.
      return `export const initial = ${JSON.stringify({
        branch,
        instance: process.env['MYNET_INSTANCE_NAME'] ?? 'local',
        webPort: Number(process.env['MYNET_WEB_PORT'] ?? 5173),
        database: process.env['MYNET_DATABASE_NAME'] ?? 'unknown',
      })}`
    },

    configureServer(server) {
      if (!path) return

      // `git checkout` replaces HEAD rather than editing it in place, so `fs.watch` on the file
      // reports a rename. Re-reading on any event covers both.
      const watcher = watch(path, () => {
        const next = readBranch(path)
        if (next === branch) return
        branch = next
        server.ws.send({ type: 'custom', event: 'mynet:branch', data: { branch } })
      })

      server.httpServer?.once('close', () => watcher.close())
    },
  }
}
```

- [ ] **Step 6: Register the plugin**

In `apps/web/vite.config.ts`, add the import beside the others:

```ts
import { devBranchLegend } from './src/dev/branch-plugin.js'
```

and add `devBranchLegend(),` to the `plugins` array, after `tailwindcss(),`.

- [ ] **Step 7: Verify the build still excludes it**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. The plugin is `apply: 'serve'`, so `vite build` never invokes it.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/dev/head.ts apps/web/src/dev/branch-plugin.ts apps/web/tests/unit/head.test.ts apps/web/vite.config.ts
git commit -m "feat: watch git HEAD and publish the branch to the dev client

apply: 'serve' means the virtual module resolves only while the dev
server runs — so removing the DEV guard fails the build loudly instead of
shipping a developer badge to an attendee. Resolves HEAD via rev-parse
because a linked worktree's .git is a file, not a directory.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 9: The legend component

Split in two deliberately: a presentational component that takes props and is therefore testable under Vitest, and a mount module that is the only thing touching the virtual module and the websocket.

**Files:**

- Create: `apps/web/src/dev/DevLegend.tsx`
- Create: `apps/web/src/dev/mount.tsx`
- Create: `apps/web/tests/dev-legend.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/theme/tokens.css:170`
- Modify: `apps/web/src/shell/MobileNav.tsx:23`
- Modify: `apps/web/src/shell/AppShell.tsx:60`

**Interfaces:**

- Consumes: `virtual:mynet-dev-legend` and the `mynet:branch` event (Task 8)
- Produces: `DevLegend(props: { branch, instance, webPort, database })`, `mountDevLegend(): void`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/dev-legend.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DevLegend } from '../src/dev/DevLegend.js'

const PROPS = {
  branch: 'spec/production-foundation',
  instance: 'mynet-ps',
  webPort: 5173,
  database: 'mynet_ps',
}

describe('DevLegend', () => {
  it('names the branch and the instance, which is the point of having two tabs open', () => {
    render(<DevLegend {...PROPS} />)
    expect(screen.getByText('spec/production-foundation')).toBeInTheDocument()
    expect(screen.getByText(/mynet-ps/)).toBeInTheDocument()
    expect(screen.getByText(/5173/)).toBeInTheDocument()
    expect(screen.getByText(/mynet_ps/)).toBeInTheDocument()
  })

  it('collapses on click and restores on a second click', async () => {
    const user = userEvent.setup()
    render(<DevLegend {...PROPS} />)

    await user.click(screen.getByRole('button', { name: /collapse/i }))
    expect(screen.queryByText(/mynet_ps/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText(/mynet_ps/)).toBeInTheDocument()
  })

  it('marks itself as decoration for assistive technology', () => {
    // It is developer scaffolding, not part of the product being tested for accessibility.
    const { container } = render(<DevLegend {...PROPS} />)
    expect(container.querySelector('[data-dev-legend]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test:component -- dev-legend`
Expected: FAIL — cannot resolve `../src/dev/DevLegend.js`

- [ ] **Step 3: Implement the component**

Create `apps/web/src/dev/DevLegend.tsx`:

```tsx
import { useEffect, useState } from 'react'

/**
 * The local-instance legend. Present only under `vite dev` — see `mount.tsx`.
 *
 * Props-only and free of any environment access, so it can be rendered in the component suite.
 * Everything environment-specific lives in `mount.tsx`.
 *
 * Colours come from theme tokens like everything else; `mynet/no-colour-literals` applies here
 * exactly as it does to product code, and no exemption is added for it.
 */
const STORAGE_KEY = 'mynet.devLegend.collapsed'

export const DevLegend = ({
  branch,
  instance,
  webPort,
  database,
}: {
  branch: string
  instance: string
  webPort: number
  database: string
}) => {
  const [collapsed, setCollapsed] = useState(
    () => globalThis.localStorage?.getItem(STORAGE_KEY) === 'true',
  )

  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(collapsed))
    // Reserves space so the strip never covers the mobile bottom navigation. Zero when
    // collapsed, and always zero in production, where this component does not exist.
    document.documentElement.style.setProperty(
      '--spacing-dev-legend',
      collapsed ? '0px' : '2.75rem',
    )
  }, [collapsed])

  return (
    <div
      data-dev-legend
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface-inverse px-3 py-1 font-mono text-2xs text-text-inverse"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={
          collapsed ? 'Expand the local instance legend' : 'Collapse the local instance legend'
        }
        className="flex w-full items-center gap-2 text-left"
      >
        <span aria-hidden="true">⎇</span>
        <span>{branch}</span>
        {!collapsed && (
          <span className="text-navy-200">
            {instance} · :{webPort} · db {database}
          </span>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test:component -- dev-legend`
Expected: PASS, 3 tests

- [ ] **Step 5: Implement the mount module**

Create `apps/web/src/dev/mount.tsx`:

```tsx
/**
 * The only file that touches the virtual module and the dev websocket.
 *
 * Kept apart from `DevLegend.tsx` so the component stays testable: the virtual module does not
 * resolve under Vitest, because the plugin that provides it is not loaded there.
 */
import { createRoot } from 'react-dom/client'
// @ts-expect-error — provided by `devBranchLegend()` in vite.config.ts, dev server only.
import { initial } from 'virtual:mynet-dev-legend'

import { DevLegend } from './DevLegend.js'

export const mountDevLegend = (): void => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  const render = (branch: string) =>
    root.render(
      <DevLegend
        branch={branch}
        instance={initial.instance}
        webPort={initial.webPort}
        database={initial.database}
      />,
    )

  render(initial.branch)

  // Pushed by the plugin when `.git/HEAD` changes, so checking out another branch updates the
  // strip without a restart or a reload.
  import.meta.hot?.on('mynet:branch', (data: { branch: string }) => render(data.branch))
}
```

- [ ] **Step 6: Mount it from the entry point**

In `apps/web/src/main.tsx`, append after the `createRoot(...).render(...)` call:

```tsx
/**
 * The local-instance legend, dev server only.
 *
 * Vite replaces `import.meta.env.DEV` with `false` at build time, so Rollup drops this branch
 * and neither module enters the production bundle. `e2e/navigation.spec.ts` asserts it is
 * absent from a real production build rather than trusting that on inspection.
 */
if (import.meta.env.DEV) {
  void import('./dev/mount.js').then(({ mountDevLegend }) => mountDevLegend())
}
```

- [ ] **Step 7: Add the spacing token**

In `apps/web/src/theme/tokens.css`, after line 170 (`--spacing-bottom-nav`):

```css
/* Reserved by the dev-only instance legend (see src/dev/DevLegend.tsx). Always 0 in a
     production build, where that component does not exist — the two references to it below
     are inert there. */
--spacing-dev-legend: 0px;
```

- [ ] **Step 8: Offset the shell by it**

In `apps/web/src/shell/MobileNav.tsx:23`, change `bottom-0` to `bottom-(--spacing-dev-legend)`.

In `apps/web/src/shell/AppShell.tsx:60`, change:

```
          'pb-(--spacing-bottom-nav) tablet:pb-0',
```

to:

```
          'pb-[calc(var(--spacing-bottom-nav)+var(--spacing-dev-legend))] tablet:pb-(--spacing-dev-legend)',
```

- [ ] **Step 9: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:component && pnpm build`
Expected: PASS all five.

Then run `pnpm start`, open the URL, and confirm: the strip shows the branch and instance; clicking collapses it and the choice survives a reload; at a 375px-wide window the bottom navigation sits above the strip rather than under it. In another terminal run `git checkout -b throwaway-legend-check` and confirm the strip updates with no reload, then `git checkout spec/production-foundation && git branch -D throwaway-legend-check`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/dev apps/web/src/main.tsx apps/web/src/theme/tokens.css apps/web/src/shell/MobileNav.tsx apps/web/src/shell/AppShell.tsx apps/web/tests/dev-legend.test.tsx
git commit -m "feat: show the branch and instance while running locally

A collapsible strip naming the branch, instance, port and database, so
two tabs are never confused. Split into a props-only component and a
mount module because the virtual module does not resolve under Vitest.
--spacing-dev-legend keeps it clear of the mobile bottom navigation and
is always 0 in production.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 10: Prove the legend never ships

The guard in `main.tsx` is an assertion about the production bundle. This turns it into a check, in the one suite that runs against a real production build.

**Files:**

- Modify: `e2e/navigation.spec.ts`

**Interfaces:**

- Consumes: `DevLegend`'s `data-dev-legend` attribute (Task 9)
- Produces: nothing

- [ ] **Step 1: Write the failing test**

Append to `e2e/navigation.spec.ts`, inside the existing `describe('navigation')` block:

```ts
test('the developer instance legend is absent from a production build', async ({ page }) => {
  // This suite runs against `vite preview`, so this is a claim about the bundle an attendee
  // actually receives — not about the source. If the `import.meta.env.DEV` guard in main.tsx
  // is ever removed, this is what catches it.
  await page.goto('/')
  await expect(page.locator('[data-dev-legend]')).toHaveCount(0)
})
```

- [ ] **Step 2: Confirm it would catch the regression**

Temporarily change the guard in `apps/web/src/main.tsx` from `if (import.meta.env.DEV) {` to `if (true) {`, then run:

Run: `pnpm test:e2e -- navigation`
Expected: **FAIL** — either at the assertion, or at the build, because `virtual:mynet-dev-legend` cannot be resolved outside the dev server. Either failure is the guard working. A gate that does not fail when you break it is not a gate.

Restore the guard.

- [ ] **Step 3: Run it for real**

Stop anything already running on the instance ports first — Playwright uses `strictPort` with `reuseExistingServer: false`, so a running `pnpm start` will fail the run.

Run: `pnpm test:e2e -- navigation`
Expected: PASS, including the new case.

- [ ] **Step 4: Commit**

```bash
git add e2e/navigation.spec.ts
git commit -m "test: assert the dev legend is absent from the production build

Runs against vite preview, so it is a claim about the bundle an attendee
receives rather than about the source.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
```

---

### Task 11: Documentation

README collapses to `pnpm start`; `quickstart.md` gets the eight corrections confirmed against a full local run on 2026-08-06.

**Files:**

- Modify: `README.md` (Setup and Run sections, roughly lines 40–125)
- Modify: `specs/001-production-foundation/quickstart.md`

**Interfaces:**

- Consumes: `pnpm start` (Task 7)
- Produces: nothing

- [ ] **Step 1: Rewrite the README's Setup and Run sections**

Replace them with `pnpm start` as the primary path, keeping the manual sequence below it as an escape hatch:

````markdown
## Run it

```bash
pnpm install
pnpm start
```

That is the whole thing. `pnpm start` creates `.env` if you do not have one, starts the shared
PostgreSQL container, creates this directory's own database, applies migrations, rebuilds the
database if you switched to a branch with a different migration history, seeds two attendees,
starts both servers, and prints the URL once they answer.

It is safe to run repeatedly. Every step checks its state before changing anything, so a second
run is never destructive.

**Several worktrees at once.** The database name and both ports are derived from the directory,
so each worktree gets its own. The main working tree keeps 5173 and 3000. Override with
`MYNET_DATABASE_NAME` or `MYNET_PORT_OFFSET` if two directories ever collide.

**Seeded accounts.** Both use the password `correct-horse-battery-staple`:

| Email               | Registered for                             |
| ------------------- | ------------------------------------------ |
| `ada@example.com`   | Product & Design Summit, Frontend Horizons |
| `grace@example.com` | Product & Design Summit, Systems & Scale   |

They share one event and differ on the other. The shared one shows that the isolation boundary is
the _registration_ rather than the event; the differing one shows that the boundary holds.

Once, before running the end-to-end suite — it downloads a browser into a shared cache, so it is a
no-op if you already have one:

```bash
pnpm exec playwright install chromium
```

`pnpm start --reset` rebuilds the database from zero without waiting for drift to be detected.

<details>
<summary>Running the steps by hand</summary>

```bash
docker run --name mynet-pg -e POSTGRES_PASSWORD=mynet -e POSTGRES_USER=mynet \
  -p 55432:5432 -d postgres:17
cp .env.example .env         # then fill in your own values
pnpm db:migrate
pnpm db:seed
pnpm dev                     # or dev:api / dev:web
```

`.env` is read automatically by every command. There is no step where you have to export it into
your shell — if you find one, that is a defect in this document.

> **Never run `drizzle-kit push`**, in any environment including your own machine. It changes a
> database without producing a reviewable migration. If it appears in a `package.json` script,
> that is a defect.

</details>
````

- [ ] **Step 2: Note the port conflict in the README's Verify section**

Immediately after the `pnpm verify` code block, add:

```markdown
**Stop `pnpm start` first.** The end-to-end suite builds and serves on the same port with
`strictPort`, and starts its own API. With an instance running, `pnpm verify` fails at
`test:e2e` with `http://localhost:5173 is already used` — a confusing way to learn that the
code was fine.

`pnpm test:integration` and `pnpm test:e2e` both truncate and re-seed the database they are
pointed at. That is your instance's database, not a scratch one.
```

- [ ] **Step 3: Correct `quickstart.md`, defects 1–4**

In the Prerequisites table, add a row:

```markdown
| Playwright browsers | `pnpm exec playwright install chromium`, once per machine — `pnpm test:e2e` cannot run without it |
```

Replace the Setup block with a pointer to `pnpm start`, keeping the manual commands beneath it, and add the seeded credentials directly after it:

```markdown
Both seeded attendees use the password `correct-horse-battery-staple`: `ada@example.com` and
`grace@example.com`. The scenarios below refer to them as the first and second attendee.
```

In the "Individually" command list, correct the `build` line and add the two missing commands:

```bash
pnpm typecheck        # FR-001
pnpm lint             # FR-004, and the no-colour-literals rule (SC-009)
pnpm format:check     # Prettier — part of `pnpm verify` and a CI gate
pnpm test:unit        # FR-005 unit
pnpm test:component   # FR-005 component
pnpm test:integration # FR-005 integration — needs a real database
pnpm test:e2e         # FR-068 — Playwright, includes accessibility
pnpm contract:check   # FR-044b — regenerate and diff the committed contract
pnpm build            # production build (FR-072's budget is a separate command)
pnpm budget           # the client asset budget (FR-072)
```

- [ ] **Step 4: Correct `quickstart.md`, defects 5–8**

After the `pnpm verify` block, replace the "everything CI runs, in the same order" claim:

```markdown
`pnpm verify` runs the same checks CI does, in CI's order, with two exceptions: CI additionally
verifies that migrations apply **twice** cleanly against a fresh database branch, and deploys a
preview. Neither is reproducible locally.

**Stop any running instance first.** `pnpm test:e2e` builds and serves with `strictPort` and
starts its own API; with `pnpm start` running it fails on the port, not on the code.
`pnpm test:integration` and `pnpm test:e2e` both truncate and re-seed the database.
```

In Scenario 6, replace the instruction to shorten the idle window:

````markdown
Fourteen days of idling is impractical to test by hand, and `AUTH_SESSION_IDLE_DAYS` is parsed as
a positive integer — one day is the shortest it will accept. So expire the session directly
instead:

```sql
update auth_sessions set expires_at = now() - interval '1 second';
```
````

Then:

````

- [ ] **Step 5: Verify the documentation is true**

Run: `pnpm format:check && pnpm lint`
Expected: PASS.

Then read the new README section start to finish and execute every command in it in order on a fresh clone. Any step you needed that is not written down is the defect — fix the document.

- [ ] **Step 6: Commit**

```bash
git add README.md specs/001-production-foundation/quickstart.md
git commit -m "docs: pnpm start, and eight quickstart corrections

README leads with pnpm start; the manual sequence stays as an escape
hatch. quickstart.md gains the missing playwright install and seed
credentials, stops claiming pnpm build runs the asset budget, warns that
the e2e suite conflicts on ports and truncates the database, and replaces
Scenario 6's unachievable idle-window step with a direct expiry.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019zmAh259rthUvJ95KRJQyF"
````

---

### Task 12: Full verification

**Files:** none

- [ ] **Step 1: Stop every running instance**

```bash
for port in 5173 3000; do
  pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  [ -n "$pid" ] && kill "$pid"
done
```

- [ ] **Step 2: Run the full pipeline**

Run: `pnpm verify`
Expected: PASS, all ten stages including `test:e2e`.

If `test:e2e` fails with `already used`, Step 1 did not take effect — re-run it rather than
re-running the suite.

- [ ] **Step 3: Confirm the working tree is clean and `.env.local` is untracked**

```bash
git status --short
```

Expected: no output. `.env.local` must not appear — `.gitignore` already covers `.env.*` and `*.local`.

- [ ] **Step 4: Verify parallel instances, the feature's headline claim**

```bash
git worktree add ../mynet-parallel-check -b throwaway/parallel-check
cd ../mynet-parallel-check && pnpm install --frozen-lockfile && pnpm start
```

Expected: a different port, a different database name, and a legend naming
`throwaway/parallel-check`. With `pnpm start` also running in the original directory, both work at
once and neither sees the other's data.

Then clean up:

```bash
cd /mnt/D/repos/mynet-ps
git worktree remove ../mynet-parallel-check --force
git branch -D throwaway/parallel-check
docker exec mynet-pg psql -U mynet -d postgres -c 'DROP DATABASE mynet_parallel_check'
```

---

## Self-Review

**Spec coverage** — every section of the design maps to a task:

| Spec section               | Task                                                      |
| -------------------------- | --------------------------------------------------------- |
| 1. Command surface         | 7                                                         |
| 2. Modules                 | 1, 2, 3, 5, 6, 7                                          |
| 3. Instance identity       | 1                                                         |
| 4. Postgres                | 5                                                         |
| 5. Schema drift            | 2 (classification), 7 (application)                       |
| 6. Configuration transport | 3 (writing), 4 (loading)                                  |
| 7. Branch legend           | 8 (plugin), 9 (component)                                 |
| 8. Failure handling        | 5 (docker, remote URL), 7 (ports, migrations), 3 (`.env`) |
| 9. Testing                 | 1, 2, 3, 4, 6, 8, 9, 10                                   |
| 10. Documentation          | 11                                                        |

**Type consistency** — names used across task boundaries were checked against their definitions:
`instanceFor` returns `{ name, databaseName, portOffset, webPort, apiPort }`, consumed with those
exact keys in Tasks 6 and 7; `classifyDrift` returns the three strings Task 7 switches on;
`committedMigrations` returns `{ tag, hash }` and Task 7 maps to `.hash`; `renderBanner` takes
`{ branch, instance, hostPort }` in both its test and its caller; `DevLegend`'s four props match
`mount.tsx`; `data-dev-legend` matches between Task 9 and Task 10.

**Verified before writing, not assumed:**

- `drizzle.__drizzle_migrations.hash` is `sha256` of the raw `.sql` file — checked against this
  repository's applied row.
- `process.loadEnvFile` does not overwrite an already-set variable — checked empirically, and it
  is the entire basis of Task 4.
- `no-console` applies only to `.ts`/`.tsx`, so `scripts/**/*.mjs` may use `console.log`.
- `.gitignore` already covers `.env.*` and `*.local`, so Task 3 adds nothing to it.
- The unit project's `include` does not currently cover `scripts/`, which is why Task 1 extends it.

**Known risk, stated rather than designed around:** Task 9 adds two references to
`--spacing-dev-legend` in shipped components. The token is `0px` in production and the component
that sets it otherwise does not exist there, so the effect is inert — but it is production code
serving a development concern, and it was accepted deliberately in the design.
