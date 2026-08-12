/**
 * The seeded attendees, and the sign-in journey every spec starts from.
 *
 * These mirror `apps/api/src/db/seed/`. Two attendees with **different** registrations is the
 * whole point — one attendee cannot demonstrate isolation, because there is nobody else's data
 * to fail to see (FR-069, SC-001).
 */
import { expect, type Page } from '@playwright/test'

export const SEED_PASSWORD = 'correct-horse-battery-staple'

export const ADA = {
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  /** The shared event, plus one of her own. */
  events: ['Product & Design Summit', 'Frontend Horizons'],
  /** Registered to nobody but Grace — Ada must never see this one. */
  notHerEvent: 'Systems & Scale',
} as const

export const GRACE = {
  email: 'grace@example.com',
  displayName: 'Grace Hopper',
  events: ['Product & Design Summit', 'Systems & Scale'],
  notHerEvent: 'Frontend Horizons',
} as const

/**
 * 011 — the **third** attendee at the shared conference, and 011 is the first suite to need him.
 *
 * He exists so that a spec can have an observer who is neither the author of something nor the
 * person who reported it. Reporting **blocks** in the same action (007), and a block filters
 * audience questions from both sides (009) — so a reporter is precisely the wrong person to ask
 * "is it gone?", because it was already invisible to them and would be whether or not any
 * moderation happened.
 *
 * He is deliberately unverified and has no profile, which is what makes him a good third party
 * here and changes nothing about this: verification gates discoverability alone, and the Q&A
 * author join consults it not at all (FR-735).
 */
export const ALAN = {
  email: 'alan@example.com',
  displayName: 'Alan Turing',
  events: ['Product & Design Summit'],
  notHerEvent: 'Frontend Horizons',
} as const

export type SeededAttendee = typeof ADA | typeof GRACE | typeof ALAN

/**
 * Switches to a conference the attendee is **not** currently in, and returns its name.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Reads the current conference rather than assuming it**, because an explicit choice is
 * durable by design (FR-104) and the end-to-end database is seeded once for the whole run. A
 * test that hard-coded "switch to the second conference" would pass alone and fail whenever an
 * earlier test had already switched there — which is precisely the order-dependent flake this
 * helper exists to remove. The durability that makes the product correct is what makes the
 * suite order-sensitive; the fix belongs here, not in weaker assertions.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const switchToAnotherConference = async (
  page: Page,
  attendee: SeededAttendee,
): Promise<string> => {
  const trigger = page.getByRole('button', { name: /change conference/i })
  await expect(trigger).toBeVisible()

  const current = (await trigger.getAttribute('aria-label')) ?? ''
  const target = attendee.events.find((name) => !current.includes(name))
  if (!target) {
    throw new Error(
      `Could not find a conference to switch to. Active label was "${current}", and the ` +
        `attendee's conferences are ${attendee.events.join(', ')}.`,
    )
  }

  await trigger.click()
  await page.getByRole('menuitemradio', { name: new RegExp(target) }).click()
  await expect(trigger).toHaveAccessibleName(new RegExp(target))

  return target
}

/**
 * Makes a NAMED conference the active one, switching only if it is not already.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A SPEC THAT DEPENDS ON *WHICH* CONFERENCE IS ACTIVE MUST SAY SO, AND THIS IS HOW.**
 *
 * The active conference is durable by design (FR-104) and the end-to-end database is seeded
 * once for the whole run — so a spec that ran earlier and switched conferences has changed the
 * starting state of every spec after it. `switchToAnotherConference` above records the same
 * hazard from the other direction.
 *
 * 006 is where this stopped being theoretical: the Discover specs need Ada in `Product & Design
 * Summit`, because that is the conference she shares with Grace. Run alone they passed; run
 * after the agenda specs — which switch her to `Frontend Horizons` — the directory was correctly
 * empty and every assertion failed. The suite was right and the specs were wrong.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Idempotent, so calling it costs nothing when the conference is already active. Asserted on
 * the switcher's accessible name rather than on any content, so it does not depend on what the
 * destination underneath happens to be rendering.
 */
export const useConference = async (page: Page, name: string): Promise<void> => {
  const trigger = page.getByRole('button', { name: /change conference/i })
  await expect(trigger).toBeVisible()

  const current = (await trigger.getAttribute('aria-label')) ?? ''
  if (current.includes(name)) return

  await trigger.click()
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click()
  await expect(trigger).toHaveAccessibleName(new RegExp(name))
}

/** Fills and submits the sign-in form, and waits until the workspace has rendered. */
export const signIn = async (page: Page, attendee: SeededAttendee): Promise<void> => {
  await page.getByLabel('Email address').fill(attendee.email)
  await page.getByLabel('Password').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: `Hello, ${attendee.displayName}` })).toBeVisible()
}

/** Asserts the workspace shows this attendee's events and none of anybody else's (SC-001). */
export const expectOwnWorkspace = async (page: Page, attendee: SeededAttendee): Promise<void> => {
  await expect(page.getByRole('heading', { name: `Hello, ${attendee.displayName}` })).toBeVisible()

  for (const event of attendee.events) {
    await expect(page.getByRole('heading', { name: event })).toBeVisible()
  }

  await expect(page.getByRole('heading', { name: attendee.notHerEvent })).toHaveCount(0)
}
