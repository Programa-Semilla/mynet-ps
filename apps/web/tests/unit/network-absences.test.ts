import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { HOME_CARDS } from '../../src/app/home/registry.js'

/**
 * T137–T141 (008) — **the client-side absences that are requirements** (FR-610, FR-618, FR-643,
 * FR-619–FR-622).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ABSENCE THAT NOBODY ASSERTED IS AN ABSENCE THE NEXT FEATURE DELETES.**
 *
 * `apps/api/tests/unit/network-absences.test.ts` holds the server half. This is the client half,
 * and the two are separate files because they check different things: the server's are route
 * tables and schemas, these are components and the composition root.
 *
 * 007 established the discipline with `messages-absences.test.ts` and
 * `no-notification-surface.test.ts`. Every entry below would be filled in by somebody acting in
 * perfectly good faith, which is exactly why it is written down.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })

/** The feature's own surfaces. Every assertion below is scoped to these unless it says otherwise. */
const networkFiles = (): string[] =>
  sourceFiles(webSrc).filter(
    (path) =>
      path.includes(join('app', 'network')) ||
      path.endsWith(join('destinations', 'Network.tsx')) ||
      path.endsWith(join('home', 'cards', 'Appointments.tsx')),
  )

/** Comment lines are where the absences are *argued*; only executable text is checked. */
const executable = (source: string): string =>
  source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')
    })
    .join('\n')

describe('008 — the client absences that are requirements', () => {
  it('found the feature’s files to audit', () => {
    // A gate that cannot fail is not a gate: every assertion below is over a filtered list, and
    // an empty one would satisfy all of them while checking nothing.
    expect(networkFiles().length).toBeGreaterThan(3)
  })

  /**
   * T137 — **no notification is requested, shown, or dispatched by any surface of this feature**
   * (FR-643).
   *
   * The server half asserts the API dispatches none. This asserts the *client* neither asks for
   * permission nor renders a notification affordance — and 007's own guard already forbids a
   * bell anywhere, so what is left to check here is that 008 did not quietly become a second
   * caller of the permission API.
   *
   * `NotificationPrompt.tsx` remains the only caller in the client, which
   * `no-notification-surface.test.ts` asserts globally.
   */
  it('T137 — requests no notification permission and renders no notification surface (FR-643)', () => {
    const offenders = networkFiles().filter((path) => {
      const source = executable(readFileSync(path, 'utf8'))
      return (
        /requestPermission|useNotifications|Notification\s*\(/.test(source) ||
        /\bbell\b/i.test(source)
      )
    })

    expect(
      offenders.map((path) => relative(webSrc, path)),
      'A surface in this feature reaches for notifications. **This feature dispatches none, for ' +
        'any event** (FR-643): constitution v3.1.0 brought delivery into scope for a received ' +
        'message and nothing else, and the bell remains forbidden. Adopting the platform for ' +
        'proposals needs another amendment — which is what the server-side ' +
        '`notification-triggers.test.ts` exists to force, and 008 does not edit it.',
    ).toEqual([])
  })

  /**
   * T138 — **no revocation control anywhere** (FR-618).
   *
   * A card cannot be recalled: you cannot un-give what somebody already holds. The API half
   * asserts there is no route; this asserts there is no control that would need one — because a
   * button is how the pressure to add the route arrives.
   */
  it('T138 — offers no way to revoke or delete a shared card (FR-618)', () => {
    const offenders = networkFiles().filter((path) => {
      const source = executable(readFileSync(path, 'utf8'))
      return /unshare|revoke|removeContact|deleteCard|withdrawCard/i.test(source)
    })

    expect(
      offenders.map((path) => relative(webSrc, path)),
      'A revocation control exists. FR-618 makes a shared card irrevocable, and its ' +
        'implementation is the absence of exactly this. Blocking is the mechanism for ending ' +
        'contact — read-side, reversible, and destroying nothing.',
    ).toEqual([])
  })

  /**
   * T141 — **contacts are derived from held cards and from nothing else** (FR-610,
   * constitution v3.2.0 N1).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THIS IS THE PROHIBITION WITH THE SHARPEST CONSEQUENCE, AND IT IS THE EASIEST TO BREACH BY
   * ACCIDENT.**
   *
   * 007's open send makes a conversation **unilateral**: anyone sharing an event may start one,
   * with no request and no acceptance step. So deriving contacts from conversations — which
   * reads like an obvious convenience, and which the approved prototype actually does — would
   * let a stranger insert themselves into another attendee's Network by sending a single
   * message.
   *
   * The constitution closes it outright, and this is where the closure is checked: the contacts
   * surface must read `CardRepository` and nothing else.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T141 — the contacts surface reads held cards and no other signal (FR-610)', () => {
    const contacts = executable(readFileSync(join(webSrc, 'app/network/Contacts.tsx'), 'utf8'))

    expect(/useCardRepository/.test(contacts)).toBe(true)

    for (const forbidden of [
      'useConversationRepository',
      'useMessageRepository',
      'useDirectoryRepository',
    ]) {
      expect(
        contacts.includes(forbidden),
        `The contacts list reads ${forbidden}. A contact is somebody whose CARD you hold ` +
          '(constitution v3.2.0 N1, FR-610) — and contacts must never be derived from ' +
          "conversations, because 007's open send would then let a stranger insert themselves " +
          "into somebody's Network by sending one message.",
      ).toBe(false)
    }

    // Appointments are not a source either. Being invited to a meeting by somebody is not the
    // same as holding their card, and treating it as such would reopen the same hole through a
    // different door.
    expect(contacts.includes('useAppointmentRepository')).toBe(false)
  })

  /**
   * T140 — **no attendee-authored field acquired its own audience** (FR-619–FR-622).
   *
   * The spec originally carried a "contact line" — a phone number or similar, shown only to
   * people holding your card. The owner rejected that reading before any migration was written,
   * because standing decision 16 allows **one visibility decision per attendee** and no feature
   * may give an individual field its own audience.
   *
   * A client-side check because that is where it would come back: a field on the profile editor
   * is how somebody would start, and the column would follow.
   */
  it('T140 — introduces no per-field audience on the profile (FR-619–FR-622)', () => {
    const profileEditor = executable(
      readFileSync(join(webSrc, 'app/profile/ProfileEdit.tsx'), 'utf8'),
    )

    for (const forbidden of ['contactLine', 'contact_line', 'visibleToContacts', 'sharedOnCard']) {
      expect(
        profileEditor.includes(forbidden),
        `The profile editor has acquired a field with its own audience (${forbidden}). Standing ` +
          'decision 16 allows ONE visibility decision per attendee, and 008 withdrew exactly ' +
          'this field before a migration was written (FR-619–FR-622).',
      ).toBe(false)
    }
  })

  /**
   * The Home registry is append-only, and 008's entry is the last one.
   *
   * Asserted rather than trusted because the registry is *the* shared file the next features
   * touch, and "appended, nothing above reordered" is a claim every feature makes in a comment.
   */
  it('appends its Home card without reordering any neighbour’s', () => {
    const ids = HOME_CARDS.map((card) => card.id)

    expect(ids).toEqual([
      'greeting-day-context',
      'up-next',
      'rest-of-day',
      'your-conferences',
      'next-saved-session',
      'people-to-meet',
      'unread-messages',
      // 008, appended last.
      'appointments',
    ])

    // At most one lead card (FR-157) — restated here because 008 adds a card and the assertion
    // is cheap where the failure is a layout nobody decided.
    expect(HOME_CARDS.filter((card) => card.slot === 'lead')).toHaveLength(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A READ MUST NEVER BE CLASSIFIED AS A WRITE** (FR-215, FR-647).
   *
   * The caching decorator treats every method not named in `reads` as a **write**, and a write
   * purges the whole conference prefix on success. `slots` is a read that must stay live, so
   * omitting it from `reads` looked right and was silently destructive: opening the scheduling
   * dialog wiped the cached programme, tracks, saved sessions, notes and appointments for the
   * active conference. Nothing failed, nothing was logged, and the loss only appeared on the next
   * disconnection.
   *
   * `passThrough` is the declaration that fixes it. This asserts the declaration exists, because
   * the failure mode is an omission and an omission has no other signature.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('declares `slots` as a live read, not by omission (FR-215, FR-647)', () => {
    const services = readFileSync(join(webSrc, 'app/services.ts'), 'utf8')

    expect(
      /passThrough:\s*\['slots'\]/.test(services),
      'The appointments repository no longer declares `slots` as a pass-through read. Leaving it ' +
        'out of both `reads` and `passThrough` classifies it as a WRITE, and a write purges the ' +
        "whole conference cache — so opening the scheduling dialog destroys the attendee's " +
        'offline copy of the programme, their saved sessions and their notes.',
    ).toBe(true)
  })

  /**
   * The composition root's offline declaration, checked rather than trusted.
   *
   * `cards` must not be decorated and `appointments` must be — and both must be *stated*, since
   * "no cache" and "nobody got round to it" look identical in a composition root (FR-647,
   * FR-648).
   */
  it('declares its offline policy per member at the composition root (FR-647, FR-648)', () => {
    const services = readFileSync(join(webSrc, 'app/services.ts'), 'utf8')

    // Appointments are cached, under the existing per-conference key.
    expect(/const appointments = cached\(/.test(services)).toBe(true)

    // Cards are not, and the refusal is written beside the member rather than achieved by
    // leaving a line out.
    expect(/cards: new HttpCardRepository\(http\)/.test(services)).toBe(true)
    expect(
      /FR-648/.test(services),
      'The composition root no longer states WHY the card repository is uncached. An omission ' +
        'and a decision look identical here, which is why 006 and 007 each declared theirs ' +
        '(FR-648).',
    ).toBe(true)
  })
})
