import type { FastifyInstance } from 'fastify'

import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../auth/throttle.js'
import { loadConfig } from '../config.js'
import {
  readOwnAvatarKey,
  readOwnProfile,
  setAvatarObjectKey,
  setDiscoverable,
  writeOwnProfile,
} from '../db/queries/profiles.js'
import {
  AVAILABILITIES,
  NETWORKING_INTENTS,
  PROFILE_LIMITS,
  type Availability,
  type NetworkingIntent,
} from '../db/schema/profiles.js'
import { imageTooLarge, imageUnreadable, notFound, tooManyAttempts } from '../errors.js'
import { processAvatar, UnreadableImageError } from '../images/avatar.js'
import { avatarObjectKey, cardKeyFor } from '../storage/service.js'

/**
 * T071 (004) — the attendee's own profile (FR-334–FR-341).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ROUTE IN THIS FILE IS ABOUT THE SIGNED-IN ATTENDEE, AND NONE TAKES AN IDENTIFIER.**
 *
 * `/profile` has no path segment naming anybody, no body field naming anybody, and no query
 * parameter naming anybody. FR-335 requires an attendee to edit every field of their own
 * profile and **no field of anyone else's**, and the absence of a parameter is what makes that
 * structural rather than a check a future handler has to remember to write.
 *
 * Reading **another** attendee's profile is deliberately not here: it lives under
 * `/events/:eventId/attendees/:attendeeId`, carries the event guard, and applies three
 * server-side conditions (research D5). Keeping the two apart means "read anyone" is never one
 * autocomplete away from "write mine".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** The response shape, shared by the read and the write so the two cannot answer differently. */
const ownProfileSchema = {
  type: 'object',
  required: [
    'displayName',
    'email',
    'company',
    'role',
    'headline',
    'sector',
    'subsector',
    'productiveActivity',
    'networkingIntent',
    'availability',
    'interests',
    'discoverable',
    'emailVerified',
    'hasAvatar',
  ],
  additionalProperties: false,
  properties: {
    displayName: { type: 'string' },
    email: { type: 'string' },
    company: { type: ['string', 'null'] },
    role: { type: ['string', 'null'] },
    headline: { type: ['string', 'null'] },
    sector: {
      type: ['string', 'null'],
      description:
        'The chosen sector LABEL (014 T2, FR-1090). May be a retired value the attendee still ' +
        'holds — holding outlives retirement (FR-1094a).',
    },
    subsector: { type: ['string', 'null'] },
    productiveActivity: { type: ['string', 'null'] },
    networkingIntent: { type: ['string', 'null'], enum: [...NETWORKING_INTENTS, null] },
    availability: { type: ['string', 'null'], enum: [...AVAILABILITIES, null] },
    interests: { type: 'array', items: { type: 'string' } },
    discoverable: {
      type: 'boolean',
      description:
        "The attendee's own setting. NOT the same as being visible: an unverified attendee with this on still appears to nobody (FR-359).",
    },
    emailVerified: {
      type: 'boolean',
      description:
        "Present so the profile can state plainly what verification adds (FR-325b). Never returned about anybody else — FR-361 forbids a requester learning another attendee's verification state.",
    },
    hasAvatar: { type: 'boolean' },
  },
} as const

export const profileRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/profile',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: "The signed-in attendee's own profile",
        description:
          'Never 404s. An attendee who has written nothing reads as a profile whose every field is null — "you have not written one yet" is not an error, and a 404 here would make the client render a failure for the ordinary condition of a new account (FR-341). The owner reads their own profile regardless of any visibility setting (FR-340).',
        security: [{ sessionCookie: [] }],
        response: {
          200: ownProfileSchema,
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      const profile = await readOwnProfile(request.attendee!.id)
      // Only reachable if the account was deleted between the session check and this read.
      if (!profile) throw notFound()
      return profile
    },
  )

  app.put(
    '/profile',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: "Replace the signed-in attendee's profile",
        description:
          'WHOLE-PROFILE SEMANTICS: the client sends the complete profile and an omitted field CLEARS it. That gives "field absent" exactly one meaning, and removes the partial-update path in which a cleared field and an unmentioned one look the same. Interests are replaced rather than merged, for the same reason — removing one is expressed by sending the set without it.',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            company: { type: ['string', 'null'], maxLength: PROFILE_LIMITS.company },
            role: { type: ['string', 'null'], maxLength: PROFILE_LIMITS.role },
            headline: { type: ['string', 'null'], maxLength: PROFILE_LIMITS.headline },
            sector: {
              type: ['string', 'null'],
              maxLength: PROFILE_LIMITS.sector,
              description:
                'A LABEL that must be currently choosable or already held by the caller ' +
                '(FR-1095b) — the union is enforced in the query layer, with a distinct code ' +
                'per refusal. Free text is not accepted for values the caller does not hold ' +
                '(FR-1087).',
            },
            subsector: {
              type: ['string', 'null'],
              maxLength: PROFILE_LIMITS.subsector,
              description: 'Must belong to the submitted sector (FR-1087), or be held with it.',
            },
            productiveActivity: {
              type: ['string', 'null'],
              maxLength: PROFILE_LIMITS.productiveActivity,
              description:
                'Free text (FR-1090, REQ-030) — unlike sector and subsector, what somebody ' +
                'actually makes or does is theirs to word.',
            },
            networkingIntent: { type: ['string', 'null'], enum: [...NETWORKING_INTENTS, null] },
            availability: { type: ['string', 'null'], enum: [...AVAILABILITIES, null] },
            interests: {
              type: 'array',
              maxItems: PROFILE_LIMITS.interestCount,
              items: { type: 'string', maxLength: PROFILE_LIMITS.interest },
              description:
                'Bounded in count HERE and in the query layer, because a per-row CHECK cannot see a set. Each value is bounded in length by the column as well (FR-337).',
            },
          },
        },
        response: {
          200: ownProfileSchema,
          400: {
            description:
              'Over a stated limit. Reachable only by a client that bypassed the editor, which surfaces every limit as it is approached (FR-337, FR-338).',
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const attendeeId = request.attendee!.id
      const body = request.body as {
        company?: string | null
        role?: string | null
        headline?: string | null
        sector?: string | null
        subsector?: string | null
        productiveActivity?: string | null
        networkingIntent?: NetworkingIntent | null
        availability?: Availability | null
        interests?: string[]
      }

      /**
       * ─────────────────────────────────────────────────────────────────────────────────────
       * **Blank is normalised to null, so "unset" has exactly one representation.**
       *
       * A form submits `''` for a field the person emptied, and storing that would give the
       * database two ways to say "no company" — one of which the column's CHECK refuses anyway
       * (`length > 0`). Normalising here means the editor does not have to know that, and the
       * refusal is never reached by an ordinary edit.
       * ─────────────────────────────────────────────────────────────────────────────────────
       */
      const text = (value: string | null | undefined): string | null => {
        const trimmed = value?.trim()
        return trimmed ? trimmed : null
      }

      const written = await writeOwnProfile(attendeeId, {
        company: text(body.company),
        role: text(body.role),
        headline: text(body.headline),
        sector: text(body.sector),
        subsector: text(body.subsector),
        productiveActivity: text(body.productiveActivity),
        // An absent field clears — `?? null` rather than leaving it out, which is the whole of
        // whole-profile semantics.
        networkingIntent: body.networkingIntent ?? null,
        availability: body.availability ?? null,
        interests: body.interests ?? [],
      })

      // ─────────────────────────────────────────────────────────────────────────────────────
      // T174 (014 tranche 2) — **each refusal carries its OWN code**, this feature's
      // twice-recorded lesson: the client renders one sentence per code, and folding the four
      // membership refusals into `validation_failed` would make the sentence that teaches the
      // rule — choose from the list, choose a subsector OF your sector — unreachable. Every
      // message describes the caller's own submission and nothing about anybody else.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (!written.ok) {
        switch (written.refusal) {
          case 'interests-out-of-bounds':
            // The pre-014 refusal, unchanged in code and shape: the interest COUNT bound is
            // the one limit no column CHECK can see, re-checked here as the last line.
            return reply.status(400).send({
              code: 'validation_failed',
              message: `A profile may carry at most ${PROFILE_LIMITS.interestCount} interests.`,
            })
          case 'sector-not-available':
            return reply.status(400).send({
              code: 'sector_not_choosable',
              message:
                'That sector is not on the list right now. Choose one of the offered sectors, ' +
                'or leave it unset — every field here is optional.',
            })
          case 'subsector-not-available':
            return reply.status(400).send({
              code: 'subsector_not_choosable',
              message:
                'That subsector is not on the list right now. Choose one of the offered ' +
                'subsectors of your sector, or leave it unset.',
            })
          case 'subsector-outside-sector':
            return reply.status(400).send({
              code: 'subsector_outside_sector',
              message:
                'That subsector belongs to a different sector than the one you chose. Pick a ' +
                'subsector of your own sector, or change the sector first (they travel ' +
                'together).',
            })
          case 'interest-not-available':
            return reply.status(400).send({
              code: 'interest_not_choosable',
              message:
                'One of those interests is not in the vocabulary. New interests are chosen ' +
                'from the offered list; everything you already had stays yours.',
            })
        }
      }

      const profile = await readOwnProfile(attendeeId)
      if (!profile) throw notFound()

      // Echoed in full, so the editor's state comes from a confirmed response rather than from
      // what it just sent — the same non-optimistic property 005 established for notes.
      return profile
    },
  )

  /**
   * T091 (004) — the discoverability setting (FR-359, FR-360, FR-362, FR-363).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THE RESPONSE STATES EFFECTIVE VISIBILITY, NOT THE FLAG THAT WAS JUST WRITTEN.**
   *
   * An unverified attendee who turns discoverability on is **still invisible to everyone**
   * (FR-359). Echoing the flag back would tell them the exact opposite of what is true — and
   * FR-362 asks this surface to state plainly what the setting currently does, which is the one
   * thing an echo cannot do.
   *
   * **All-or-nothing** (FR-360). There is one boolean here and there must stay one: per-field
   * visibility was considered in brainstorm #04 and rejected, and reintroducing it needs a
   * recorded decision rather than a second property on this body.
   *
   * **Takes effect on the next request** (FR-363), because nothing caches it: every read
   * evaluates the column, and no session or token carries a copy that could go stale.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  app.put(
    '/profile/discoverability',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: 'Turn discoverability on or off',
        description:
          'Answers with EFFECTIVE visibility rather than the flag: an unverified attendee with this on still appears to nobody (FR-359), and a response echoing only the setting would tell them the opposite of what is true (FR-362). Takes effect on the next request, with no new sign-in (FR-363).',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['discoverable'],
          // All-or-nothing (FR-360). A second property here would be per-field visibility
          // arriving without the recorded decision that reintroducing it requires.
          additionalProperties: false,
          properties: { discoverable: { type: 'boolean' } },
        },
        response: {
          200: {
            type: 'object',
            required: ['discoverable', 'emailVerified', 'effectivelyVisible'],
            additionalProperties: false,
            properties: {
              discoverable: { type: 'boolean', description: 'The setting, as stored.' },
              emailVerified: {
                type: 'boolean',
                description:
                  "The other half of FR-359's condition. Returned about the CALLER only — never about anybody else (FR-361).",
              },
              effectivelyVisible: {
                type: 'boolean',
                description:
                  'Whether co-attendees can actually find them: the setting AND a verified address. This is the field the surface must show.',
              },
            },
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      const { discoverable } = request.body as { discoverable: boolean }

      const result = await setDiscoverable(request.attendee!.id, discoverable)
      if (!result) throw notFound()
      return result
    },
  )

  await avatarRoutes(app)
}

/**
 * T083 (004) — the attendee's own avatar (FR-346–FR-351, research D8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Bytes travel as base64 in JSON, in both directions, and that is a decision** — see
 * `packages/data/src/http/profile-repository.ts` for the three reasons. The short version:
 * `contracts/openapi.json` is generated from these schemas and checked in CI, `HttpClient` reads
 * every response with `response.json()`, and the export already embeds the avatar as base64
 * (research D11). One mechanism, not two.
 *
 * **Serving a CO-ATTENDEE's avatar is not here.** It lives with the co-attendee profile route,
 * under `/events/:eventId/attendees/:attendeeId`, because it must apply exactly the same three
 * visibility conditions — a hidden attendee whose photograph was served would be the profile
 * withheld and the face given away.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const avatarRoutes = async (app: FastifyInstance): Promise<void> => {
  const { avatar } = loadConfig()

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The body limit is what makes FR-347's "before any bytes are stored" true at the
   * transport**, rather than after a decode.
   *
   * Base64 inflates by four bytes per three, so the limit is scaled accordingly plus a small
   * allowance for the JSON envelope. Fastify refuses a larger body before the handler runs, so
   * an oversize upload never reaches `sharp`, never reaches `StorageService`, and never
   * occupies memory proportional to what somebody chose to send.
   *
   * The handler checks the *decoded* size too. Both are needed, and the **headroom between
   * them is deliberate**: without it, a photograph a little over the limit would be cut off by
   * the transport and answered with a generic `bad_request`, which does not state the limit —
   * and FR-347 requires the refusal to state it, because somebody has to know what to resize
   * to. The headroom lets the ordinary "slightly too big" case reach the handler and get the
   * message with the number in it; a grossly oversized body is still refused at the transport,
   * where the point is to not read it at all rather than to explain anything.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const BASE64_OVERHEAD = 4 / 3
  const HEADROOM = 1.5
  const bodyLimit = Math.ceil(avatar.maxUploadBytes * BASE64_OVERHEAD * HEADROOM) + 1024

  const avatarBody = {
    type: 'object',
    required: ['contentType', 'base64'],
    additionalProperties: false,
    properties: {
      contentType: { type: 'string' },
      base64: { type: 'string' },
    },
  } as const

  app.get(
    '/profile/avatar',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: "The signed-in attendee's own avatar",
        description:
          'Answers 204 with no body when there is none — the ordinary state of a new account, and what makes the client render the non-photographic fallback rather than a broken image (FR-351).',
        security: [{ sessionCookie: [] }],
        response: {
          200: avatarBody,
          204: { type: 'null', description: 'No avatar. The fallback renders.' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const key = await readOwnAvatarKey(request.attendee!.id)
      if (!key) return reply.status(204).send()

      const stored = await app.storage.get(key)
      // A row pointing at missing bytes is the one inconsistency the deletion path can leave
      // behind, and it is deliberately the recoverable one (research D10). It renders as "no
      // avatar" rather than as a failure.
      if (!stored) return reply.status(204).send()

      return { contentType: stored.contentType, base64: stored.bytes.toString('base64') }
    },
  )

  app.put(
    '/profile/avatar',
    {
      preHandler: app.requireAttendee,
      bodyLimit,
      schema: {
        tags: ['profile'],
        summary: 'Upload an image as the avatar, replacing any previous one',
        description:
          'The bytes are decoded, resized to a bounded square and RE-ENCODED server-side, so metadata absence is a property of the operation rather than a list of tags to maintain (FR-349, research D8). The type is determined by INSPECTING the bytes, never by the declared content type or a filename. Over the size limit is refused before anything is stored (FR-347).',
        security: [{ sessionCookie: [] }],
        body: {
          type: 'object',
          required: ['image'],
          additionalProperties: false,
          properties: {
            image: {
              type: 'string',
              description: 'The image, base64-encoded. See the file header for why not raw bytes.',
            },
          },
        },
        response: {
          204: { type: 'null', description: 'Stored, replacing any previous object.' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          413: {
            description: 'Over the size limit, refused before any bytes are stored (FR-347).',
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              maxBytes: { type: 'number' },
            },
          },
          415: {
            description:
              'Not a decodable image of an accepted type — determined by inspection (FR-347).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              'Throttled on the `avatar_upload` counter. Authenticated, so a denial can only ever fall on the uploader.',
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              retryAfterSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const attendeeId = request.attendee!.id
      const { image } = request.body as { image: string }

      // ───────────────────────────────────────────────────────────────────────────────────
      // **Throttled because this is the most expensive request the product serves.**
      //
      // A decode, an entropy analysis over the full raster to choose the crop, and a re-encode
      // — the `export` counter exists for a weaker version of the same argument. The byte limit
      // and `limitInputPixels` bound *one* upload; nothing bounded how many an account could
      // ask for, and accounts are self-serve.
      //
      // The identifier is the signed-in attendee, so `mayDeny` is safe for the reason it is
      // safe on join and export: a denial can only inconvenience the person uploading.
      // ───────────────────────────────────────────────────────────────────────────────────
      const identifierHash = hashAttemptValue(attendeeId)
      const sourceHash = hashAttemptValue(request.ip)
      const action = 'avatar_upload' as const

      // 010 T017 — recorded before it is judged (FR-804), excluded from its own count (FR-805),
      // and never settled: the decode is the cost and it is paid before anything can be known
      // about the bytes, so a successful upload must still count.
      const attemptId = await beginAttempt({ identifierHash, sourceHash, action })
      const outstanding = await serveDelay(
        await failureDelayMs({ identifierHash, sourceHash, action }, attemptId),
      )
      if (outstanding > 0) throw tooManyAttempts(outstanding, 'avatar uploads')

      const raw = Buffer.from(image, 'base64')

      // The decoded size, checked **before** the decoder is handed anything. `Buffer.from`
      // ignores characters outside the base64 alphabet rather than throwing, so a padded or
      // malformed value arrives here as a smaller buffer and is caught by the decode instead.
      if (raw.byteLength > avatar.maxUploadBytes) {
        throw imageTooLarge(avatar.maxUploadBytes)
      }
      if (raw.byteLength === 0) throw imageUnreadable()

      let processed
      try {
        processed = await processAvatar(raw)
      } catch (error) {
        if (error instanceof UnreadableImageError) throw imageUnreadable()
        throw error
      }

      // ───────────────────────────────────────────────────────────────────────────────────
      // **The key is derived from the attendee, so a replacement OVERWRITES** (FR-350).
      //
      // A fresh key per upload would leave the previous object behind — retrievable by anyone
      // who had its key, which is precisely what "the previous bytes are no longer retrievable"
      // rules out. Overwriting means there is never a second copy to forget about.
      // ───────────────────────────────────────────────────────────────────────────────────
      // ───────────────────────────────────────────────────────────────────────────────────
      // T024 (006) — **both renditions are written here**, from the one decode (FR-457, D2).
      //
      // Upload time rather than read time, and the objection to that is backfill: what about
      // avatars stored before this change? There are none. `register entry 11` and this repo's
      // own history both record that **the product has never been deployed**, so the only
      // databases holding an avatar are development and test ones built from a seed that
      // regenerates. `routes/events/directory.ts` carries a read-path repair for a developer
      // whose database predates this, and that is all it is for.
      //
      // Deriving only on read was rejected: it would put image processing on the hot path of
      // the one request FR-456 exists to make cheap, and would need a cache not to repeat —
      // a second mechanism where FR-466 already forbids caching.
      // ───────────────────────────────────────────────────────────────────────────────────
      const key = avatarObjectKey(attendeeId)
      await app.storage.put(key, processed.profile.bytes, processed.profile.contentType)
      await app.storage.put(cardKeyFor(key), processed.card.bytes, processed.card.contentType)
      await setAvatarObjectKey(attendeeId, key)

      return reply.status(204).send()
    },
  )

  app.delete(
    '/profile/avatar',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['profile'],
        summary: 'Remove the avatar. Idempotent',
        description:
          'Succeeds whether or not there was one. The bytes are deleted and the non-photographic fallback returns (FR-346, FR-351).',
        security: [{ sessionCookie: [] }],
        response: {
          204: { type: 'null' },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const attendeeId = request.attendee!.id

      // Object first, then the row — the same ordering the account-deletion path uses and for
      // the same reason: a failure between the two must leave a row pointing at missing bytes
      // (recoverable, renders the fallback) rather than bytes no row references (unreachable).
      //
      // T024 (006) — **both renditions**. Removing an avatar and leaving the card copy behind
      // would keep the attendee's face in every co-attendee's directory after they had removed
      // it, which is the same regression FR-460 forbids on the deletion path.
      const key = avatarObjectKey(attendeeId)
      await app.storage.delete(key)
      await app.storage.delete(cardKeyFor(key))
      await setAvatarObjectKey(attendeeId, null)

      return reply.status(204).send()
    },
  )
}
