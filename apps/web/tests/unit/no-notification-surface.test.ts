import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T123 (007) — **no notification bell, and no in-product notification centre** (FR-560,
 * constitution 3.1.0).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **3.1.0 REVERSED HALF OF REGISTER ENTRY 10, AND THIS IS THE HALF IT DID NOT REVERSE.**
 *
 * The amendment brought *delivery* into scope for a received message. The prohibition on
 * reproducing the prototype's bell is carried forward **unchanged and explicitly**, which makes
 * this the moment it becomes fragile rather than the moment it becomes safe: until now there was
 * nothing to put in a bell, and from now on there is.
 *
 * The prototype header shows a bell with an unread dot. It is the most visually obvious thing in
 * it, it is the thing a reviewer comparing screens will notice missing, and it will be added in
 * good faith by somebody who assumes its absence was an oversight. So the absence is asserted.
 *
 * **A notification is read in the operating system and nowhere else.** MyNet has no inbox of past
 * notifications, no unread counter over an icon, and no dismissal state to synchronise — three
 * things the product would otherwise have to own, all of which the platform already does.
 *
 * The one unread signal this product does have is Home's card (T086) and Messages' own row
 * treatment: both are about *conversations*, which are durable content, not about notifications,
 * which are transient events. That distinction is the whole line FR-560 draws.
 *
 * **Distinct from `notification-triggers.test.ts`** in `apps/api`, which covers what may cause a
 * push at all. Either could pass while the other failed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SRC = join(import.meta.dirname, '../../src')

const sourcesUnder = (directory: string, prefix = ''): { name: string; text: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return sourcesUnder(path, name)
    return /\.tsx?$/.test(entry.name) ? [{ name, text: readFileSync(path, 'utf8') }] : []
  })

/**
 * Comments and JSX comments stripped: every one of the words below appears in the prose
 * explaining why the thing is absent, `NotificationPrompt.tsx` most of all. A gate that failed on
 * its own justification would drive the reasoning out of the code.
 */
const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('no notification surface exists in the product (FR-560)', () => {
  it('finds the source to check — a gate that cannot fail is not a gate', () => {
    expect(sourcesUnder(SRC).length).toBeGreaterThan(40)
  })

  /**
   * The bell, in every spelling somebody would actually reach for.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THIS PATTERN WAS WRITTEN BACKWARDS AND CAUGHT NOTHING THAT MATTERED.**
   *
   * It read `/from 'lucide-react'[\s\S]{0,200}\bBell\b/` — requiring `Bell` to appear *after* the
   * module string. A named import puts the identifier **before** it (`import { Send } from
   * 'lucide-react'`, which is how every import in this codebase is written), so
   * `import { Bell } from 'lucide-react'` — the canonical export name, and the single most likely
   * way the prototype's bell comes back — matched none of the three alternatives and passed.
   *
   * The guard was checking the two *less* common spellings and missing the obvious one, which is
   * worse than having no guard: it reads as protection. `catches` below is the fix for the fix —
   * a regex whose direction can invert again silently is not a control.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const BELL =
    /import\s*\{[^}]*\bBell(Icon|Ring|Dot|Off|Plus|Minus)?\b[^}]*\}\s*from\s*'lucide-react'|<\s*Bell(Icon|Ring|Dot)?\b|\bBellIcon\b|\bBellRing\b/

  it('the bell pattern matches a bell — a guard whose regex is backwards is not a guard', () => {
    // Asserted against synthetic samples rather than trusted, because the previous version of
    // this pattern was inverted and nothing noticed.
    expect(BELL.test("import { Bell } from 'lucide-react'")).toBe(true)
    expect(BELL.test("import { ArrowLeft, Bell, Flag } from 'lucide-react'")).toBe(true)
    expect(BELL.test("import { BellRing } from 'lucide-react'")).toBe(true)
    expect(BELL.test('<Bell className="size-4" />')).toBe(true)
    // And does not fire on the neighbours it must not: `Ban` and `Flag` are 007's own icons.
    expect(BELL.test("import { Ban, Flag } from 'lucide-react'")).toBe(false)
  })

  it.each([
    ['a bell', BELL],
    ['a notification bell', /\bnotificationBell\b|\bNotificationBell\b/],
    ['a notification centre', /\bNotificationCent(er|re)\b|\bnotificationCent(er|re)\b/i],
    [
      'a notification inbox or feed',
      /\bnotificationInbox\b|\bnotificationFeed\b|\bnotificationList\b/i,
    ],
    ['a notification badge or dot', /\bnotificationBadge\b|\bnotificationDot\b|\bunreadDot\b/i],
    [
      'stored notifications',
      /\bnotifications\s*\.\s*map\b|\bsetNotifications\b|\bNotification\[\]/,
    ],
  ])('renders no %s', (_label, pattern) => {
    const offending = sourcesUnder(SRC)
      .filter(({ text }) => pattern.test(codeOf(text)))
      .map(({ name }) => name)

    expect(offending).toEqual([])
  })

  /**
   * The permission surface is the one thing 007 *does* add, and it is not a bell: it asks a
   * question once and then renders nothing forever. This asserts it stays that shape.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **TWO FILES NOW, AND THE SECOND IS ASSERTED TO RENDER NOTHING RATHER THAN MERELY ALLOWED.**
   *
   * 014's deep review added `app/NotificationTarget.tsx`, which consumes the `?event=` a
   * notification carries so the address it opens resolves against the right conference (FR-1029,
   * FR-1034b) — without it, a notification about a conference the attendee is not currently in
   * landed on "That session is not available to you".
   *
   * Adding a name to this list is exactly the move this guard exists to make expensive, so the
   * allowance is paid for: the assertion below requires the new file to **return null**. FR-560
   * forbids a notification *surface* — a bell, a centre, a list of things that happened — and a
   * component that renders nothing cannot become one without failing this test. That is a stronger
   * statement than the old one, which permitted `NotificationPrompt` to render whatever it liked.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('the notification-related components are exactly two, and one of them renders nothing', () => {
    const found = sourcesUnder(SRC).filter(({ name }) => /Notification/i.test(name))

    expect(found.map(({ name }) => name).sort()).toEqual([
      'app/NotificationTarget.tsx',
      'app/messages/NotificationPrompt.tsx',
    ])

    const target = found.find(({ name }) => name === 'app/NotificationTarget.tsx')

    expect(
      target && /return null/.test(codeOf(target.text)),
      '`NotificationTarget` renders something. It exists to consume a query parameter and switch ' +
        'the active conference; the moment it renders, it is a notification surface, which FR-560 ' +
        'forbids. A banner saying "a notification could not open" is the first step to a centre.',
    ).toBe(true)

    // And it must not be a *list* of anything, which is the specific shape FR-1031 forbids.
    for (const forbidden of ['map(', '<ul', '<li', 'role="list"']) {
      expect(
        codeOf(target?.text ?? '').includes(forbidden),
        `\`NotificationTarget\` contains \`${forbidden}\`. It must not iterate or list — a ` +
          'surface whose subject is "things that happened" is the notification centre v3.1.0 ' +
          'excluded and v5.2.0 N2 kept excluded (FR-1031).',
      ).toBe(false)
    }
  })

  it('nothing outside that component requests permission or subscribes (FR-551, FR-1036)', () => {
    // FR-551 is enforced by construction rather than by review: the explanation and the prompt
    // are the same component, so a second caller would be a prompt with no explanation in front
    // of it. `services.ts` is excluded — the composition root constructs the capability, which is
    // not the same as using it.
    //
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **T050 (016) — FR-1036 rides on this assertion, and 016 is its first real test.**
    //
    // `auth/InstallGuidance.tsx` is a surface whose entire subject is notifications, on a screen
    // reached before anybody has signed in. Requesting permission there is the obvious next
    // thought and the wrong one — it would ask a stranger for permission to send messages they
    // cannot yet receive, with no explanation in front of it. The guidance explains a capability
    // and asks for nothing, and this is what keeps that true as it changes.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const callers = sourcesUnder(SRC)
      .filter(({ name }) => name !== 'app/messages/NotificationPrompt.tsx')
      .filter(({ text }) => /\brequestPermission\s*\(|\.\s*subscribe\s*\(\s*\)/.test(codeOf(text)))
      .map(({ name }) => name)

    expect(callers).toEqual([])
  })
})
