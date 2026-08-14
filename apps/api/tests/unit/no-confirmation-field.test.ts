import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T030 (016) — **the confirmation field is never transmitted or stored** (FR-1019, FR-1020).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IT EXISTS TO CATCH A TYPING ERROR ON ONE DEVICE, AND IT HAS NO SERVER SIDE AT ALL.**
 *
 * A confirmation that reached the server would be a second copy of a credential in a request
 * body, in logs that redact by field name, and in whatever a proxy keeps — for a check the
 * client has already performed and which the server could not meaningfully repeat. Two identical
 * strings arriving together prove nothing the first one does not.
 *
 * Every route body in this product declares `additionalProperties: false`, so an extra field is
 * refused rather than ignored. That is the mechanism; this is the guard that says it is
 * deliberate, because "no route accepts it" and "nobody has added it yet" look identical.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-1020 — THE CREDENTIAL POLICY ITSELF IS UNCHANGED.**
 *
 * 016 changes how a password is *typed*, never what is accepted. The minimum length, the
 * strength rules and the hashing are all exactly where 004 and 013 left them. A feature that
 * added a confirmation field and quietly tightened the policy in the same change would be two
 * decisions wearing one requirement's number, and the second one would reach existing attendees
 * as a sign-in that stopped working.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const SRC = join(import.meta.dirname, '../../src')

const sourcesUnder = (directory: string, prefix = ''): { name: string; text: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return sourcesUnder(path, name)
    return entry.name.endsWith('.ts') ? [{ name, text: readFileSync(path, 'utf8') }] : []
  })

/**
 * Comments stripped, because the phrases below appear in the prose explaining the absence —
 * including in this file's own neighbours and in the client components that own the field.
 * Matching raw text fails on a correct implementation, and the natural repair is to weaken the
 * pattern until it checks nothing. 009's absence tests record the same trap.
 */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('no route accepts a password confirmation (FR-1019)', () => {
  it('finds the source to check — a gate that cannot fail is not a gate', () => {
    const sources = sourcesUnder(SRC)
    expect(sources.length).toBeGreaterThan(20)
    expect(sources.map((source) => source.name)).toContain('routes/auth/sign-up.ts')
  })

  it.each([
    ['confirmPassword', /\bconfirmPassword\b/],
    ['confirm_password', /\bconfirm_password\b/],
    ['passwordConfirmation', /\bpasswordConfirmation\b/],
    ['confirmation as a credential field', /\bconfirmation\s*:\s*\{?\s*type:\s*'string'/],
  ])('declares no %s anywhere in the API', (_label, pattern) => {
    const offenders = sourcesUnder(SRC)
      .filter(({ text }) => pattern.test(codeOf(text)))
      .map(({ name }) => name)

    expect(
      offenders,
      'A route or schema names a password confirmation. It is a client-side check against a ' +
        'typing error (FR-1019) — sending it would put a second copy of a credential in a ' +
        'request body for a check the server cannot meaningfully repeat.',
    ).toEqual([])
  })

  /**
   * The column half. A confirmation that was accepted and then discarded would still be wrong,
   * but a confirmation that was *stored* would be a second credential at rest.
   */
  it('stores no confirmation column', () => {
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **Narrowed to a *password* confirmation, deliberately.**
    //
    // A bare `/confirm/i` flags `appointments.ts`, whose statuses include `confirmed` — an
    // appointment somebody accepted, which has nothing to do with a credential typed twice.
    // Matching that would be a guard that fails on correct code, and the natural repair is to
    // delete it. So the pattern names the pairing that would actually be wrong.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const offenders = sourcesUnder(join(SRC, 'db/schema'))
      .filter(({ text }) =>
        /confirmPassword|password_confirm|passwordConfirm|confirm_password/i.test(codeOf(text)),
      )
      .map(({ name }) => name)

    expect(
      offenders,
      'A schema stores a password confirmation. It is never transmitted (FR-1019), so storing ' +
        'it would be a second credential at rest for a check that already happened on a device.',
    ).toEqual([])
  })

  /**
   * FR-1020's guard. The minimum is asserted by value rather than by existence, so a change to
   * the credential policy has to be made deliberately here rather than arriving inside a feature
   * about how a password is typed.
   */
  it('leaves the credential policy exactly where it was (FR-1020)', async () => {
    const { PASSWORD_MIN_LENGTH } = await import('../../src/routes/auth/sign-up.js')

    expect(
      PASSWORD_MIN_LENGTH,
      '016 changes how a password is entered, never what is accepted. If the policy is being ' +
        'changed deliberately, that is its own decision and this number is where it is recorded.',
    ).toBe(12)
  })
})
