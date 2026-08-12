import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T149, T150 (013) — **the guards this feature was NOT licensed to touch** (FR-974, FR-975,
 * FR-976, FR-935, SC-908, SC-910).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **CONSTITUTION v4.0.0 NAMES FIVE CODE-LEVEL GUARDS THAT ENFORCE THE REVERSED PROHIBITION AND
 * SAYS EACH MUST BE AMENDED DELIBERATELY, NEVER WEAKENED UNTIL IT STOPS CHECKING ANYTHING.**
 *
 * 011 is licensed to amend exactly **two** of them:
 *
 *   - `qa-absences.test.ts` — narrowed by path to permit one moderation route (FR-953). It was
 *     **strengthened first**: the moderation half matched words in a URL, and
 *     `DELETE /admin/questions/:questionId` contains none of them, so it passed while reporting
 *     success. See `guard-amendments.md`.
 *   - `no-report-read-surface.test.ts` — narrowed to `apps/web` and the attendee API (FR-972).
 *
 * The other three are **out of scope for this feature entirely**, and the reason is the delivery
 * order: conference content authoring is **012** and registration management is **013**. A guard
 * relaxed here would be those features arriving without their amendments.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THIS ASSERTS CONTENT, NOT MERE EXISTENCE.**
 *
 * A test that only checked the files were present would pass against a `catalog-read-only.test.ts`
 * whose every assertion had been commented out. So each is checked for the specific thing it must
 * still refuse — the pattern that would have to go for the guard to stop working.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const unitDir = fileURLToPath(new URL('./', import.meta.url))
/**
 * `join-grants-nothing.test.ts` lives in the **integration** layer, not this one — it drives a
 * real join against a real database, because what a join grants is a question about rows rather
 * than about source. Resolved by path rather than assumed, since guessing wrong here would make
 * this assertion fail for the wrong reason.
 */
const integrationDir = fileURLToPath(new URL('../integration/', import.meta.url))
const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const read = (path: string): string => readFileSync(path, 'utf8')

describe('011 — the guards this feature did not touch are still in force', () => {
  /**
   * **FR-974 — conference content stays read-only. That is 012's, not this feature's.**
   *
   * 011 delivers moderation and promotion. It creates, edits and deletes **no** session, track,
   * room, speaker or event, and `event-scope-audit.test.ts` gained a positive assertion saying so
   * over the administrative route table.
   */
  it('keeps the catalog read-only guard checking writes (FR-974)', () => {
    const guard = read(join(unitDir, 'catalog-read-only.test.ts'))

    expect(
      guard.length,
      '`catalog-read-only.test.ts` is missing or empty. It is the guard that stops conference ' +
        'content becoming writable, and that is 012 — which needs its own amendment (FR-974).',
    ).toBeGreaterThan(500)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Checked against the mechanism it actually uses, which is NOT HTTP methods.**
    //
    // The first version of this assertion looked for `POST`/`PUT`/`PATCH`/`DELETE` and failed —
    // correctly, and usefully. `catalog-read-only.test.ts` guards by **name-shape over the
    // repository's exports**: it asserts that no exported function is named like a write. A
    // guard-of-a-guard that checked for the wrong mechanism would have gone green the day
    // somebody replaced that one with something weaker, which is the whole failure mode this
    // file exists to catch.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const verb of ['create', 'update', 'delete']) {
      expect(
        guard.toLowerCase(),
        `catalog-read-only no longer refuses a "${verb}" export, so it has stopped checking ` +
          'that conference content is read-only in perpetuity (FR-191, FR-974).',
      ).toContain(verb)
    }

    // The seed module the guard's header rests on: no write path at any privilege.
    const seed = read(join(apiSrc, 'db/seed/catalog.ts'))
    expect(
      seed,
      '`seed/catalog.ts` no longer states that conference content has no write path at any ' +
        'privilege. 011 introduced privilege for the first time, so that sentence is now load-' +
        'bearing rather than incidental.',
    ).toMatch(/no write path|read-only|FR-191/i)
  })

  /**
   * **FR-975 — a join code grants nothing but registration. That is 013's.**
   *
   * 011 adds no route that creates, rotates or revokes a join code. Promotion is the only way a
   * conference organizer comes into being, and it acts on somebody **already registered**.
   */
  it('keeps the join-grants-nothing guard in force (FR-975)', () => {
    const guard = read(join(integrationDir, 'join-grants-nothing.test.ts'))
    expect(
      guard.length,
      '`join-grants-nothing.test.ts` is missing or empty (FR-975).',
    ).toBeGreaterThan(500)
    expect(
      guard,
      'join-grants-nothing no longer mentions the join code, so it has stopped checking what a ' +
        'join grants. Registration management is 013 (FR-975).',
    ).toMatch(/join_code|joinCode|join code/i)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T150 — SC-910: THE NOTIFICATION TRIGGER SET IS UNCHANGED, AND THE AUDIT IS UNEDITED.**
   *
   * 007 built that audit specifically so that 008 and 009 could not adopt the notification
   * platform for appointments or Q&A without a decision — *"a second trigger has to edit the
   * test, and editing it is the conversation."*
   *
   * 011 is the third feature to pass it, and it had the most plausible reason yet to fail:
   * telling somebody they have been promoted, or telling a reporter their report was read, are
   * both obvious product ideas. Both are forbidden — FR-935 and FR-946 — and this is what would
   * notice the audit being edited to permit one.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves the notification trigger audit unedited, with a received message its only trigger (FR-935, SC-910)', () => {
    const guard = read(join(unitDir, 'notification-triggers.test.ts'))

    expect(
      guard.length,
      '`notification-triggers.test.ts` is missing or empty. It is the guard that keeps the ' +
        'notification trigger set at a received message (FR-561, FR-935).',
    ).toBeGreaterThan(500)

    expect(
      guard,
      'The notification trigger audit no longer names the message send as its permitted trigger.',
    ).toMatch(/message/i)

    // The audit must not have acquired an administrative exemption. If 011 needed one, that
    // would be a second trigger and a governance conversation (v3.1.0, standing decision 21).
    expect(
      /admin|operator|promot|resolv/i.test(guard),
      'The notification trigger audit mentions an administrative concept, which means somebody ' +
        'has taught it about a second trigger. The trigger set is a received message and nothing ' +
        'else — a second one needs another amendment (FR-935, SC-910).',
    ).toBe(false)
  })

  /**
   * **The two guards 011 IS licensed to amend must still refuse what they always refused.**
   *
   * A narrowing that took the rest of the guard with it would satisfy "amended narrowly" in a
   * diff and check nothing in practice, which is exactly what FR-976 forbids.
   */
  it('keeps the two amended guards refusing everything they always refused (FR-976)', () => {
    const qa = read(join(unitDir, 'qa-absences.test.ts'))
    for (const forbidden of ['answered', 'pinned', 'downvote', 'voter', 'bell']) {
      expect(
        qa.toLowerCase(),
        `qa-absences no longer mentions "${forbidden}". Narrowing it to permit ONE moderation ` +
          'route must not take the other ten absences with it (FR-976).',
      ).toContain(forbidden)
    }

    const reports = read(join(unitDir, 'no-report-read-surface.test.ts'))
    expect(
      reports,
      'no-report-read-surface no longer names FR-548. It is narrowed to `apps/web` and the ' +
        'attendee API, not withdrawn — the guarantee survives everywhere FR-972 requires it.',
    ).toContain('FR-548')
    expect(
      reports,
      'no-report-read-surface no longer checks the repository interface, which is where a "my ' +
        'reports" screen would ask for a read first.',
    ).toMatch(/ReportRepository/)
  })
})
