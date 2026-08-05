/**
 * The seeded attendees, and the sign-in journey every spec starts from.
 *
 * These mirror `apps/api/src/db/seed.ts`. Two attendees with **different** registrations is the
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

export type SeededAttendee = typeof ADA | typeof GRACE

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
