import type { FastifyInstance, FastifyRequest } from 'fastify'

import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../../auth/throttle.js'
import {
  DIRECTORY_MAX_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE,
  InvalidCursorError,
  listDirectory,
  type DirectoryRow,
} from '../../db/queries/directory.js'
import { AVAILABILITIES, NETWORKING_INTENTS } from '../../db/schema/profiles.js'
import { notAuthenticated, notFound } from '../../errors.js'
import { processAvatar } from '../../images/avatar.js'
import { eventScopeOf, type EventParams } from '../../plugins/event-access.js'
import { cardKeyFor } from '../../storage/service.js'

/**
 * T046 (006) — `GET /events/:eventId/attendees`, the Discover directory (research D14).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ROUTE NAMES `:eventId`, SO THE AUDIT FAILS THE BUILD IF THE GUARD IS EVER DROPPED.**
 *
 * That is the whole reason the listing lives under a conference address rather than at
 * `/directory?event=…`. `tests/unit/event-scope-audit.test.ts` walks the real route table and
 * refuses any route naming a conference without `requireEventAccess` — so FR-402's reader-side
 * condition is enforced by CI rather than by anyone remembering to enforce it, on the one route
 * in this feature where forgetting would expose every attendee in the product.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`additionalProperties: false`, and the query does not select them either.** Two mechanisms
 * for one property, exactly as 004 did for the single-profile response. `email` and
 * `emailVerified` must never appear here, and this is the response where getting it wrong is
 * silent — nothing renders differently, nobody notices, and the disclosure is total.
 * `tests/unit/directory-response-shape.test.ts` asserts both mechanisms over the schema itself.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
/**
 * T020 (010) — **the read bound** (FR-801, FR-802, research R7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A JOIN CODE IS PRINTED ON BADGES AND SHOWN ON SLIDES, SO "SIGNED IN" IS NOT A BARRIER.**
 *
 * Anybody can sign themselves up and enter one. Once inside, this route pages an entire
 * conference at a hundred rows a request — name, company, role, headline, interests, availability
 * and a face — and until now nothing counted the requests. That is the whole attendee list of a
 * conference, downloadable by anybody who read a slide, and a public URL makes it worse in the
 * only way that matters: it removes the need to be in the building.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT MAY DELAY AND MAY NEVER DENY** (FR-802), and the clamp that guarantees it lives inside
 * `failureDelayMs` rather than here — so this handler has no remainder it could turn into a
 * refusal even if a later edit wanted one. That is deliberate: a 429 on this route refuses
 * Discover to somebody standing in a venue trying to find the person they were told to meet.
 *
 * Keyed on the **reader's own identity**, never on anything else. Keyed on the conference, one
 * attendee's browsing would slow every other attendee's; keyed on the source, a venue behind one
 * address would throttle itself.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const throttleRead = async (request: FastifyRequest): Promise<void> => {
  const attendee = request.attendee
  if (!attendee) throw notAuthenticated()

  const key = {
    identifierHash: hashAttemptValue(attendee.id),
    sourceHash: hashAttemptValue(request.ip),
    action: 'directory_read' as const,
  }

  // Recorded before it is judged, so concurrent listings count each other (FR-804); excluded
  // from its own count, so the allowance is what it would have been the other way round (FR-805).
  const attemptId = await beginAttempt(key)

  // No `outstanding` to inspect: `directory_read` is delay-only, so `failureDelayMs` has already
  // clamped its result to what `serveDelay` will actually sleep. There is nothing left to refuse
  // on, which is how FR-802 is structural rather than remembered.
  await serveDelay(await failureDelayMs(key, attemptId))
}

export const directoryRoutes = async (app: FastifyInstance): Promise<void> => {
  interface DirectoryQuerystring {
    readonly q?: string
    readonly role?: string
    readonly interest?: string
    readonly cursor?: string
    readonly limit?: number
  }

  app.get<{ Params: EventParams; Querystring: DirectoryQuerystring }>(
    '/events/:eventId/attendees',
    {
      preHandler: [app.requireAttendee, app.requireEventAccess],
      schema: {
        tags: ['profile'],
        summary: 'The attendee directory for one conference',
        description:
          'Filtered, ranked by shared interests, paginated, with card-sized avatars embedded. Carries both guards: the READER is registered for this conference (proven by the branded EventScope the route audit guarantees is present), and every returned attendee is additionally registered for the same conference, discoverable, and verified — all three evaluated in one query before any field is produced (FR-402, FR-409). An attendee excluded by any condition is absent from the response entirely, never withheld from display. There is no total, no withheld count, and no field distinguishing a hidden attendee from a nonexistent one (FR-404).',
        security: [{ sessionCookie: [] }],
        params: {
          type: 'object',
          required: ['eventId'],
          // No `format: uuid`, matching every other event-scoped route: Fastify would answer a
          // malformed identifier with a 400 and a validation body before the guard ran,
          // separating "not a uuid" from "not yours".
          properties: { eventId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: {
              type: 'string',
              maxLength: 200,
              description:
                'Free text over display name, company, role and headline — case- and accent-insensitively, so "Munoz" finds "Muñoz". NEVER matches email address (FR-407).',
            },
            role: { type: 'string', maxLength: 120 },
            interest: { type: 'string', maxLength: 60 },
            cursor: {
              type: 'string',
              maxLength: 200,
              description:
                "Opaque. Encodes the previous page's last (sharedInterestCount, attendeeId). It is a position, never a scope — the conference comes from the path and its guard.",
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: DIRECTORY_MAX_PAGE_SIZE,
              default: DIRECTORY_PAGE_SIZE,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['attendees', 'nextCursor'],
            additionalProperties: false,
            properties: {
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  /**
                   * **Every field is required, and the nullable ones are nullable rather than
                   * absent.** The query projects all of them explicitly, so "the attendee has
                   * not written a company" is `null` and never a missing key — which means a
                   * client never has to distinguish the two, and the generated contract type
                   * binds to the client's domain type without an `Omit` or a `Required` papering
                   * over the difference (`packages/data/src/contract.ts`).
                   */
                  required: [
                    'attendeeId',
                    'displayName',
                    'company',
                    'role',
                    'headline',
                    'networkingIntent',
                    'availability',
                    'interests',
                    'sharedInterestCount',
                    'avatar',
                  ],
                  additionalProperties: false,
                  properties: {
                    attendeeId: { type: 'string', format: 'uuid' },
                    displayName: { type: 'string' },
                    company: { type: ['string', 'null'] },
                    role: { type: ['string', 'null'] },
                    headline: { type: ['string', 'null'] },
                    networkingIntent: {
                      type: ['string', 'null'],
                      enum: [...NETWORKING_INTENTS, null],
                    },
                    availability: { type: ['string', 'null'], enum: [...AVAILABILITIES, null] },
                    interests: { type: 'array', items: { type: 'string' } },
                    sharedInterestCount: {
                      type: 'integer',
                      description:
                        'How many interests this attendee shares with the reader. May be 0, and a zero-overlap attendee still appears — they simply rank last (FR-411). This is the number the card displays, which is what makes FR-413 checkable.',
                    },
                    avatar: {
                      description:
                        'The 96px CARD rendition, embedded so a page of 24 faces is one request rather than 25 (FR-456, SC-407). Never the 512px profile rendition, which continues to serve the profile view. Null when the attendee has no avatar.',
                      anyOf: [
                        {
                          type: 'object',
                          required: ['contentType', 'base64'],
                          additionalProperties: false,
                          properties: {
                            contentType: { type: 'string' },
                            base64: { type: 'string' },
                          },
                        },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
              nextCursor: {
                type: ['string', 'null'],
                description: 'Null when this is the last page.',
              },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            description:
              'No such conference, **or** the reader is not registered for it. One refusal for both, produced by requireEventAccess before the handler runs — the reader learns nothing about conferences they are not part of (FR-148).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      // T020 (010) — FR-801. Charged before the query runs, so the cost of a listing is paid by
      // the request that asked for it rather than only by ones that turn out to be servable.
      await throttleRead(request)

      let page
      try {
        page = await listDirectory(eventScopeOf(request), request.query)
      } catch (error) {
        // A cursor this server did not issue is refused the way every other unusable input on
        // an event-scoped route is refused. Answering 400 with a validation body would make a
        // hand-edited cursor distinguishable from a conference that is not yours — a small
        // difference, and the kind an attacker reads.
        if (error instanceof InvalidCursorError) throw notFound()
        throw error
      }

      // ───────────────────────────────────────────────────────────────────────────────────
      // **The page's faces are read in ONE statement, not one per attendee.**
      //
      // `withAvatar` called `storage.get` per row, which is 1 + N statements against a pool of
      // ten connections — 101 at the maximum page size, all issued concurrently, on the one
      // request FR-456 exists to make cheap. `getMany` collapses that to a second statement.
      // ───────────────────────────────────────────────────────────────────────────────────
      const cardKeys = page.attendees
        .map((row) => row.avatarObjectKey)
        .filter((key): key is string => key !== null)
        .map(cardKeyFor)
      const cards = await app.storage.getMany(cardKeys)

      return {
        attendees: await Promise.all(page.attendees.map((row) => withAvatar(app, row, cards))),
        nextCursor: page.nextCursor,
      }
    },
  )
}

interface EmbeddedAvatar {
  readonly contentType: string
  readonly base64: string
}

/**
 * Attaches the card rendition to one row.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FR-459 — THE FACE IS BOUND BY THE SAME THREE CONDITIONS AS THE PROFILE, AND THIS IS WHERE
 * THAT IS TRUE.**
 *
 * It is true by *position* rather than by a check: this maps over the rows `listDirectory`
 * returned, and those rows are already bounded by the reader's registration, the target's
 * registration, and the target's discoverability and verification. There is no attendee here
 * whose profile was withheld, so there is no face here to give away.
 *
 * That is worth naming precisely because nothing enforces it locally. Resolving avatars from a
 * separate query — by attendee id, say, to batch them — would compile, pass every other test,
 * and serve a hidden attendee's photograph inside a response that carefully omits their name.
 * `tests/integration/directory-visibility.test.ts` asserts it against real stored bytes.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T026 (006) — THE READ-PATH REPAIR, AND WHAT IT IS *NOT* FOR** (research D2).
 *
 * A read that finds the card rendition missing derives it once from the stored profile
 * rendition, stores it, and serves it. **This is not a backfill mechanism**, and the difference
 * matters because backfill would be a reason to distrust the whole upload-time design:
 *
 *   *There is no production avatar to backfill.* The product has never been deployed — register
 *   entry 11 and the API Dockerfile's own header both say so — and the only databases holding an
 *   avatar are development and test ones built from a seed that regenerates. This exists for a
 *   developer whose database predates the change, and it costs one derivation per avatar, once.
 *
 * **It goes through `processAvatar`, not through a copy or a resize written here** (FR-458).
 * The stored profile rendition already carries no metadata, so re-encoding it strips nothing —
 * but a second production path is a second place EXIF stripping could regress, and the whole
 * point of FR-458 is that metadata absence stays a property of *the* operation rather than of
 * however many places happen to produce an image today.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * A failure to resolve an avatar yields `null` rather than failing the page. A directory that
 * refuses to render because one person's bytes are missing is a worse answer than a directory
 * with one fallback initial in it.
 */
const withAvatar = async (
  app: FastifyInstance,
  row: DirectoryRow,
  cards: ReadonlyMap<string, EmbeddedAvatarBytes>,
): Promise<Omit<DirectoryRow, 'avatarObjectKey'> & { avatar: EmbeddedAvatar | null }> => {
  const { avatarObjectKey, ...entry } = row
  if (!avatarObjectKey) return { ...entry, avatar: null }

  const stored = cards.get(cardKeyFor(avatarObjectKey))
  if (stored) {
    return {
      ...entry,
      avatar: { contentType: stored.contentType, base64: stored.bytes.toString('base64') },
    }
  }

  return { ...entry, avatar: await repairCard(app, avatarObjectKey) }
}

interface EmbeddedAvatarBytes {
  readonly bytes: Buffer
  readonly contentType: string
}

/**
 * The repair path only — reached when the batched read above found no card rendition.
 *
 * **Bounded, and that bound is the point.** It decodes an image and writes to storage, on a
 * request the reader is waiting on. Unbounded, one page of a database predating this change
 * would start up to a hundred concurrent `sharp` pipelines on a Standard_B2s that also runs
 * PostgreSQL — which the file header's own reasoning rules out, since the repair exists for a
 * developer's stale database and is explicitly *not* a backfill mechanism. Beyond the ceiling
 * the fallback initials render, which is a handled state, and re-running the seed fixes it.
 */
const MAX_REPAIRS_PER_PAGE = 4
let repairsInFlight = 0

const repairCard = async (
  app: FastifyInstance,
  profileKey: string,
): Promise<EmbeddedAvatar | null> => {
  if (repairsInFlight >= MAX_REPAIRS_PER_PAGE) return null
  repairsInFlight += 1

  try {
    const original = await app.storage.get(profileKey)
    if (!original) return null

    const { card } = await processAvatar(original.bytes)
    await app.storage.put(cardKeyFor(profileKey), card.bytes, card.contentType)

    return { contentType: card.contentType, base64: card.bytes.toString('base64') }
  } catch (error) {
    app.log.warn({ err: error, profileKey }, 'could not resolve a directory card avatar')
    return null
  } finally {
    repairsInFlight -= 1
  }
}
