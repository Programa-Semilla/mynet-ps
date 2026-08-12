import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T080 (010) — **what feature 010 did NOT build** (FR-895, and FR-890–FR-894, FR-861, FR-806a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FEATURE'S ABSENCES ARE OF A DIFFERENT KIND FROM 007's AND 009's, AND THAT IS WHY THEY
 * NEED THEIR OWN GUARD.**
 *
 * 009's absences are product decisions — no downvote, no moderation route, no voter disclosure.
 * They would be filled in by somebody adding a feature.
 *
 * 010's are structural claims about a *deployment*, and they would be broken by somebody being
 * helpful during an incident. "We need a way to see reports without SSHing in." "Let's add an
 * admin page so we can fix a stuck registration." "Production's subscription is the same, may as
 * well fill it in while I'm here." Each is a reasonable thought at 2am, and each breaks a
 * requirement that has no other enforcement.
 *
 * The riskiest one is FR-894. Every value production needs is now *known* — the subscription is
 * the same as UAT's, the domain has a provisional name — so the file reads as merely unfinished
 * rather than deliberately blank.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **COMMENTS ARE STRIPPED BEFORE MATCHING, AND 007 AND 009 BOTH RECORD WHY.**
 *
 * Every phrase forbidden below also appears in the prose explaining why it is forbidden — in this
 * file, in the specification, and in the source comments of the very modules being searched.
 * Matching raw text fails on a correct implementation, and the natural repair is to weaken the
 * pattern until it checks nothing at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const API_SRC = fileURLToPath(new URL('../../src/', import.meta.url))
const REPO = fileURLToPath(new URL('../../../../', import.meta.url))

/** Strips block and line comments. See the header. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const readTree = (dir: string): { path: string; code: string }[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = `${dir}${entry}`
    if (statSync(path).isDirectory()) return readTree(`${path}/`)
    if (!path.endsWith('.ts')) return []
    return [{ path, code: stripComments(readFileSync(path, 'utf8')) }]
  })

const apiSources = readTree(API_SRC)

describe('the guard itself is real', () => {
  it('found sources to search', () => {
    // A stripper or a walker that returned nothing would make every assertion below pass while
    // checking nothing — the exact failure this whole file exists to prevent elsewhere.
    expect(apiSources.length).toBeGreaterThan(30)
    expect(apiSources.some(({ code }) => code.includes('fastify'))).toBe(true)
  })
})

/**
 * FR-890 — **no schema change.** The feature adds two throttled actions, and both are members of
 * a TypeScript union stored in an existing `text` column, which is what makes that possible.
 */
describe('no migration was added (FR-890)', () => {
  const MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url))

  it('the migration set still ends at 0008', () => {
    const applied = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith('.sql'))
      .sort()

    expect(
      applied.at(-1),
      'A migration was added. FR-890 says this feature changes no schema — and the two throttle ' +
        'actions it introduces are union members in an existing text column precisely so that ' +
        'stays true. A migration here also means the Drizzle snapshot was regenerated, which the ' +
        "migration README warns against: `drizzle-kit generate` JSON-parses every file in meta/.",
    ).toBe('0008_session_qa.sql')
  })

  it('leaves the journal alone', () => {
    // 0003 precedes 0004 while carrying a later timestamp, deliberately. Anyone regenerating
    // would "fix" that, and the README explains why both halves are load-bearing.
    const journal = readFileSync(`${MIGRATIONS}meta/_journal.json`, 'utf8')
    expect(journal).toContain('0008_session_qa')
  })
})

/**
 * FR-891 — **no product surface.** The UAT marker is the single permitted visible addition, and
 * it is a static span in an existing header rather than anything with an address.
 */
describe('no product surface was added (FR-891)', () => {
  it('registers no new route on the API', () => {
    // Every route this feature could have added would name one of these. The directory and the
    // message page gained a throttle CALL, not a route.
    const forbidden = [/['"]\/admin/, /['"]\/operator/, /['"]\/reports\/[^'"]*['"]\s*,\s*\{/]

    for (const { path, code } of apiSources) {
      for (const pattern of forbidden) {
        expect(pattern.test(code), `${path} registers an administrative route`).toBe(false)
      }
    }
  })

  it('adds no Home card', () => {
    const registry = stripComments(
      readFileSync(`${REPO}apps/web/src/app/home/registry.ts`, 'utf8'),
    )

    // Home's seventh card was 008's and is the last one. This feature contributes nothing here —
    // an environment marker is not a card, and a deployment has nothing an attendee acts on.
    expect(/uat|environment|deploy|marker/i.test(registry)).toBe(false)
  })

  it('adds no navigation destination', () => {
    const navigation = stripComments(
      readFileSync(`${REPO}apps/web/src/app/navigation.ts`, 'utf8'),
    )

    expect(
      /uat|environment marker|deployment/i.test(navigation),
      'The five destinations are fixed. An environment marker has no address and must not gain ' +
        'one — it is a statement about where you are, not a place you can go.',
    ).toBe(false)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * FR-892 — **a received message is still the only thing that dispatches a notification.**
 *
 * 007 built this guard and put it where a second trigger would have to edit it, so that adding
 * one is a conversation rather than a commit. This feature deploys push for real for the first
 * time, which is exactly the moment somebody notices that a deployed environment could usefully
 * notify people about other things.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a received message remains the only notification trigger (FR-892)', () => {
  it('leaves 007’s source-level audit in place and passing', () => {
    // Asserted by existence rather than duplicated: `notification-triggers.test.ts` walks
    // apps/api/src and is the mechanism. A feature that deleted it would pass a re-implementation
    // here while removing the thing that actually binds.
    const audit = readFileSync(
      fileURLToPath(new URL('./notification-triggers.test.ts', import.meta.url)),
      'utf8',
    )
    expect(audit.length).toBeGreaterThan(500)
    // It walks the real source tree and names the one file permitted to dispatch.
    expect(audit).toContain('routes/conversations.ts')
  })

  it('dispatches nothing from the deployment or mail modules', () => {
    for (const { path, code } of apiSources) {
      if (!path.includes('/mail/')) continue

      // ─────────────────────────────────────────────────────────────────────────────────
      // Named symbols, not the word "push" — which matched `Array.prototype.push` and failed
      // against a perfectly correct sink adapter. A pattern loose enough to catch a method call
      // is a pattern that gets weakened until it catches nothing, which is the failure mode this
      // whole file is written against.
      // ─────────────────────────────────────────────────────────────────────────────────
      expect(
        /PushService|app\.push|sendNotification|web-push/i.test(code),
        `${path} reaches for the push port. Mail and notifications are separate ports, and a ` +
          'received message is the only thing that dispatches one (FR-892).',
      ).toBe(false)
    }
  })
})

/**
 * FR-893 — **no administrative actor, in a product whose Principle III excludes one by
 * construction.** The operator acts entirely out-of-band: over SSH, against the database, through
 * the mail they receive.
 */
describe('no administrative interface or privileged role (FR-893)', () => {
  it('grants nobody a role', () => {
    for (const { path, code } of apiSources) {
      expect(
        /\brole\s*[:=]\s*['"](admin|operator|moderator|superuser)/i.test(code),
        `${path} introduces a privileged role. The attendee is the only actor.`,
      ).toBe(false)
    }
  })

  it('adds no column that could carry one', () => {
    const schema = readTree(`${API_SRC}db/schema/`)
    for (const { path, code } of schema) {
      expect(
        /is_?admin|isOperator|\bpermissions\b/i.test(code),
        `${path} adds a privilege column`,
      ).toBe(false)
    }
  })
})

/**
 * FR-861 — **a report is readable from nowhere inside the product**, and 010 is the feature that
 * makes the temptation concrete: reports now genuinely arrive somewhere, so "let me just check
 * them in the app" becomes a thing somebody wants.
 */
describe('reports stay unreadable from inside the product (FR-861)', () => {
  it('exposes no route that reads a report', () => {
    for (const { path, code } of apiSources) {
      if (!path.includes('/routes/')) continue

      // A GET on anything report-shaped. The POST that creates one is the only permitted verb.
      expect(
        /app\.get[^\n]*reports?/i.test(code),
        `${path} exposes a read over reports. The mail is the only way out, by design.`,
      ).toBe(false)
    }
  })

  it('leaves 009’s guard in place', () => {
    const guard = readFileSync(
      fileURLToPath(new URL('./no-report-read-surface.test.ts', import.meta.url)),
      'utf8',
    )
    expect(guard.length).toBeGreaterThan(300)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * FR-894 — **no production value is filled and no production resource is created**, and this is
 * the absence most likely to be broken by somebody being helpful.
 *
 * `deployment-config.test.ts` asserts the two blanks. This asserts the other half: that nothing
 * in the repository has quietly started naming production.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('nothing production was created or filled (FR-894)', () => {
  it('names mynetcr.com nowhere outside prose', () => {
    // The provisional production name may be discussed; it may not be configured. Scripts and
    // configuration are where it would take effect.
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Comment lines are excluded, because the name may be *discussed* and may not be
    // *configured* — and it is discussed at length, in exactly the files most likely to be
    // grepped. `envs/prod.env` explains why its APP_DOMAIN is blank, which necessarily involves
    // naming the domain that would otherwise be there.
    //
    // What this looks for is an assignment or an argument: the name taking effect.
    //
    // Tests are excluded, and finding that out was the point: without it this guard matched its
    // OWN assertion text and failed on a repository that was entirely correct. A guard that
    // searches the tree it lives in has to exclude itself, or the first thing it catches is
    // always the guard.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const configured = execFileSync(
      'bash',
      [
        '-c',
        `grep -rhE --exclude-dir=tests --exclude='*.test.*' 'mynetcr\\.com' ` +
          `${REPO}deploy ${REPO}apps ${REPO}.github 2>/dev/null ` +
          `| grep -vE '^\\s*[#*]|^\\s*//|\\*' || true`,
      ],
      { encoding: 'utf8' },
    ).trim()

    expect(
      configured,
      'mynetcr.com appears in configuration or a script. Constitution v3.4.0 (decision 31) ' +
        'records it as PROVISIONAL and unregistered, and forbids committing it until it is — a ' +
        "blank value is what keeps the deploy job's refusal honest.",
    ).toBe('')
  })

  it('creates no production resource group in any script', () => {
    const scripts = execFileSync(
      'bash',
      ['-c', `grep -rhE 'rg-mynet-prod' ${REPO}deploy/vm/*.sh 2>/dev/null || true`],
      { encoding: 'utf8' },
    ).trim()

    expect(scripts, 'a script names production’s resource group directly').toBe('')
  })
})

/**
 * FR-806a — **no backfill.** A card already shared is not removed or repaired because its sharer
 * turned out to be unverified. None exists, and a card is irrevocable by requirement (FR-618), so
 * a rule that removed one would contradict a shipped guarantee.
 */
describe('no card backfill was introduced (FR-806a)', () => {
  it('deletes no shared card anywhere', () => {
    for (const { path, code } of apiSources) {
      expect(
        /delete\s+from\s+shared_cards/i.test(code),
        `${path} deletes shared cards. FR-618 makes a card irrevocable; the only permitted ` +
          'removal is the cascade when an account is deleted.',
      ).toBe(false)
    }
  })

  it('keeps verification out of card resolution (FR-807)', () => {
    const cards = stripComments(readFileSync(`${API_SRC}db/queries/cards.ts`, 'utf8'))
    const checks = cards.match(/email_verified_at/gi) ?? []

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **EXACTLY ONE, AND IT IS IN THE INSERT.**
    //
    // Counting is the assertion. There is one legitimate verification check in this file — the
    // RECIPIENT's, inside `shareCard`'s `WHERE EXISTS`, because you may only share with somebody
    // you could have found. Every read path below it deliberately has none: no discoverability
    // condition (FR-612), no verification condition (FR-613), no registration join (FR-614).
    //
    // A second occurrence means one of those absences has been "completed" by somebody who read
    // `listDirectory` first and saw this file as unfinished.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      checks.length,
      'Card resolution now consults verification state. FR-807 forbids it: a held card resolves ' +
        'the sharer’s live profile under a standing consent that outlives both the conference ' +
        'and the discoverability toggle. The ONE permitted check is on the recipient, at share ' +
        'time, in the INSERT.',
    ).toBe(1)
    expect(cards.split('email_verified_at')[0]).toContain('INSERT INTO shared_cards')
  })
})
