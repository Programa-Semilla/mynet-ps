import type { FastifyInstance } from 'fastify'

import { registerSubscription, unregisterSubscription } from '../db/queries/push-subscriptions.js'
import { notAuthenticated } from '../errors.js'

/**
 * T112 (007) — registering and surrendering a device (FR-553–FR-556).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ENDPOINT IS BOUND TO THE CALLING SESSION, AND NEITHER ROUTE TAKES AN ATTENDEE
 * IDENTIFIER** (FR-525).
 *
 * That is what stops one browser profile delivering one attendee's messages using another's
 * registration: a device signed into a different account that re-registers the same endpoint
 * **reassigns** it, because the upsert is keyed on the endpoint alone. `queries/push-subscriptions
 * .ts` records why the obvious key — the attendee-endpoint pair — is a cross-account leak.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THERE IS NO `GET`, AND ITS ABSENCE IS DELIBERATE.**
 *
 * What *this* device currently holds is a question for the browser, not the server —
 * `NotificationService.currentSubscription()` answers it. A list of an attendee's registered
 * devices would be a surface nothing in the product needs and a disclosure of where they are
 * reachable, which is the same reasoning that keeps the export's key columns redacted.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const pushRoutes = async (app: FastifyInstance): Promise<void> => {
  const refusals = {
    401: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  } as const

  const subscriptionBody = {
    type: 'object',
    required: ['endpoint', 'keys'],
    additionalProperties: false,
    properties: {
      endpoint: {
        type: 'string',
        // A push endpoint is a full URL from the browser's own push service. Bounded generously
        // rather than tightly: the shape is the vendor's, not ours, and refusing a long one would
        // be refusing a device for a reason we invented.
        minLength: 1,
        maxLength: 2_048,
      },
      keys: {
        type: 'object',
        required: ['p256dh', 'auth'],
        additionalProperties: false,
        properties: {
          p256dh: { type: 'string', minLength: 1, maxLength: 512 },
          auth: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
  } as const

  app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
    '/push/subscriptions',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['notifications'],
        summary: 'Register this device for notification delivery',
        description:
          '201 for a new endpoint, 200 when the same one re-registers. **Re-subscription is a replacement rather than an accumulation** — a browser silently renews its subscription, and every renewal that left its predecessor behind would be a row the server tries and fails to deliver to forever. The endpoint is bound to the calling session, so a device signed into a different account reassigns it (FR-555).',
        security: [{ sessionCookie: [] }],
        body: subscriptionBody,
        response: {
          201: { type: 'null', description: 'A new device.' },
          200: { type: 'null', description: 'This endpoint re-registered; it now belongs here.' },
          400: {
            description: 'Malformed subscription.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      const { created } = await registerSubscription(attendee.id, {
        endpoint: request.body.endpoint,
        p256dhKey: request.body.keys.p256dh,
        authKey: request.body.keys.auth,
      })

      return reply.code(created ? 201 : 200).send()
    },
  )

  app.delete<{ Body: { endpoint: string } }>(
    '/push/subscriptions',
    {
      preHandler: [app.requireAttendee],
      schema: {
        tags: ['notifications'],
        summary: 'Surrender this device’s registration. Idempotent',
        description:
          'Drops **this device only** (FR-556); every other device the attendee has registered keeps receiving. **Not called on sign-out** — a subscription is per device, not per session (FR-555), and somebody who signs out on their phone still wants to hear about a reply. What drops one is revoking permission, the browser replacing the subscription, a permanent delivery failure (FR-557), or deleting the account.\\n\\nThe endpoint is in the body rather than the path: it is a full URL, frequently longer than is comfortable to percent-encode into a path segment, and putting it there would write it into every access log the request passes through.',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['endpoint'],
          additionalProperties: false,
          properties: { endpoint: { type: 'string', minLength: 1, maxLength: 2_048 } },
        },
        response: {
          204: { type: 'null' },
          ...refusals,
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee
      if (!attendee) throw notAuthenticated()

      await unregisterSubscription(attendee.id, request.body.endpoint)
      return reply.code(204).send()
    },
  )
}
