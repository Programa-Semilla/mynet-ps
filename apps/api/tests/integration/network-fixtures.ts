import type { FastifyInstance } from 'fastify'

import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  SEED_PASSWORD,
  sessionCookieFrom,
} from './helpers.js'

/**
 * Shared fixtures for 008's integration files (FR-601–FR-659).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A plain module rather than exports from a `.test.ts` file, for the reason
 * `tests/support/export-columns.ts` records: importing one test file from another registers its
 * `describe` blocks in the importing project and runs them twice under a misdescribing name.
 * `directory-fixtures.ts` set the same precedent in 006.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Ada and Grace share `Product & Design Summit`**, and Alan attends it too — unverified and
 * therefore invisible to everybody, which makes him this feature's fixture for FR-607's
 * indistinguishability without needing a fourth account.
 */

export { ADA, GRACE }
export const ALAN = 'alan@example.com'

/** The conference Ada and Grace share. Every scheduling fixture happens here. */
export const SHARED_EVENT = 'Product & Design Summit'
/** Registered to Grace and not to Ada — the fixture for FR-614's cross-event durability. */
export const GRACE_ONLY_EVENT = 'Systems & Scale'
/** Registered to Ada and not to Grace. */
export const ADA_ONLY_EVENT = 'Frontend Horizons'

export interface Actor {
  readonly cookie: string
  readonly id: string
}

export const signIn = async (app: FastifyInstance, email: string): Promise<Actor> => {
  // Cleared first: the throttle counts every request, and 008's two new actions are configured
  // to genuinely deny (FR-638a), so a file that shares several cards in a row would otherwise
  // start refusing partway through for a reason unrelated to what it is asserting.
  await clearThrottle()

  const response = await app.inject({
    method: 'POST',
    url: '/auth/sign-in',
    payload: { email, password: SEED_PASSWORD },
  })

  const cookie = sessionCookieFrom(response)
  if (!cookie) throw new Error(`Sign-in failed for ${email}.`)

  const me = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { cookie: cookieHeader(cookie) },
  })

  return { cookie, id: (me.json() as { id: string }).id }
}

/** Share the actor's card with another attendee. */
export const shareCard = (app: FastifyInstance, actor: Actor, attendeeId: string) =>
  app.inject({
    method: 'POST',
    url: '/cards',
    headers: { cookie: cookieHeader(actor.cookie) },
    payload: { attendeeId },
  })

/** The actor's contacts list. */
export const listHeld = (app: FastifyInstance, actor: Actor) =>
  app.inject({
    method: 'GET',
    url: '/cards/held',
    headers: { cookie: cookieHeader(actor.cookie) },
  })

export const listShared = (app: FastifyInstance, actor: Actor) =>
  app.inject({
    method: 'GET',
    url: '/cards/shared',
    headers: { cookie: cookieHeader(actor.cookie) },
  })

export const readHeld = (app: FastifyInstance, actor: Actor, attendeeId: string) =>
  app.inject({
    method: 'GET',
    url: `/cards/held/${attendeeId}`,
    headers: { cookie: cookieHeader(actor.cookie) },
  })

/**
 * Switch the actor's active conference.
 *
 * The card routes name no conference, so which one is active decides where an exchange is
 * *recorded* (FR-605) and which contacts are *schedulable* (FR-639a) — never which contacts are
 * listed (FR-614), which is what several of these files exist to prove.
 */
export const switchTo = (app: FastifyInstance, actor: Actor, eventId: string) =>
  app.inject({
    method: 'PUT',
    url: '/workspace/active-event',
    headers: { cookie: cookieHeader(actor.cookie) },
    payload: { eventId },
  })

export const eventIdNamed = async (
  app: FastifyInstance,
  actor: Actor,
  name: string,
): Promise<string> => {
  const response = await app.inject({
    method: 'GET',
    url: '/events',
    headers: { cookie: cookieHeader(actor.cookie) },
  })

  // `GET /events` answers a bare array, not an envelope — 002's shape, unchanged.
  const events = response.json() as { id: string; name: string }[]
  const found = events.find((event) => event.name === name)
  if (!found) throw new Error(`${name} is not among this attendee's conferences.`)
  return found.id
}

export const slotsFor = (app: FastifyInstance, actor: Actor, eventId: string, withId: string) =>
  app.inject({
    method: 'GET',
    url: `/events/${eventId}/appointments/slots?attendeeId=${withId}`,
    headers: { cookie: cookieHeader(actor.cookie) },
  })

export const propose = (
  app: FastifyInstance,
  actor: Actor,
  eventId: string,
  payload: { inviteeId: string; slotId: string; topic: string },
) =>
  app.inject({
    method: 'POST',
    url: `/events/${eventId}/appointments`,
    headers: { cookie: cookieHeader(actor.cookie) },
    payload,
  })

export const listAppointments = (app: FastifyInstance, actor: Actor, eventId: string) =>
  app.inject({
    method: 'GET',
    url: `/events/${eventId}/appointments`,
    headers: { cookie: cookieHeader(actor.cookie) },
  })

export const answer = (
  app: FastifyInstance,
  actor: Actor,
  eventId: string,
  appointmentId: string,
  action: 'accept' | 'decline' | 'cancel',
) =>
  app.inject({
    method: 'POST',
    url: `/events/${eventId}/appointments/${appointmentId}/${action}`,
    headers: { cookie: cookieHeader(actor.cookie) },
  })

export const block = (app: FastifyInstance, actor: Actor, attendeeId: string) =>
  app.inject({
    method: 'POST',
    url: '/blocks',
    headers: { cookie: cookieHeader(actor.cookie) },
    payload: { attendeeId },
  })

export const unblock = (app: FastifyInstance, actor: Actor, attendeeId: string) =>
  app.inject({
    method: 'DELETE',
    url: '/blocks',
    headers: { cookie: cookieHeader(actor.cookie) },
    payload: { attendeeId },
  })

/** Shapes the two card routes answer with, so a file states only what it asserts. */
export interface HeldCardBody {
  attendeeId: string
  displayName: string
  company: string | null
  role: string | null
  headline: string | null
  interests: string[]
  avatar: { contentType: string; base64: string } | null
  eventId: string
  eventName: string
  sharedAt: string
  atActiveEvent: boolean
}

export interface AppointmentBody {
  appointmentId: string
  role: 'proposer' | 'invitee'
  counterpart: { attendeeId: string; displayName: string; avatar: unknown }
  slot: { slotId: string; startsAt: string; endsAt: string }
  topic: string
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'lapsed'
  createdAt: string
  answeredAt: string | null
}
