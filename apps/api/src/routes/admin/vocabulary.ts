import type { FastifyInstance, FastifyRequest } from 'fastify'

import { platformScopeOf, requirePlatformOperator } from '../../admin/require-operator.js'
import { beginAttempt, failureDelayMs, hashAttemptValue, serveDelay } from '../../auth/throttle.js'
import { getDb } from '../../db/client.js'
import {
  createInterestOption,
  createSector,
  createSubsector,
  deleteInterestOption,
  deleteSector,
  deleteSubsector,
  listInterestOptions,
  listSectors,
  listSubsectors,
  renameInterestOption,
  renameSector,
  renameSubsector,
  setInterestOptionRetired,
  setSectorRetired,
  setSubsectorRetired,
  type VocabularyResult,
} from '../../db/queries/admin-vocabulary.js'
import { PROFILE_LIMITS } from '../../db/schema/profiles.js'
import { AppError, notFound, tooManyAttempts } from '../../errors.js'

/**
 * T172, T173 (014 tranche 2) — **the vocabulary destination's routes** (FR-1085, FR-1089,
 * FR-1093a, FR-1094, FR-1094a, FR-1094b, FR-1094c, R20).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ROUTE HERE CARRIES `requirePlatformOperator`, AND NONE NAMES A CONFERENCE.**
 *
 * The vocabulary is product-wide reference data no conference owns (FR-1085), so the guard is
 * the platform-tier one and NOT `requireConferenceAuthority` — that guard reads `:eventId` from
 * the path and refuses with 404 when there is none, because its whole predicate is
 * per-conference (R20). Nesting these under `/admin/conferences/:eventId/…` would falsely
 * promise that a conference owns the reference data, and would demand a guard that cannot
 * express product-wide authority at all.
 *
 * A conference organizer is refused with the **same 404 as a route that does not exist**
 * (`requirePlatformOperator`'s single `notFound()` factory), which is the server half of
 * SC-1020; `tier-controls.test.tsx` asserts they are never offered the door. Every route is
 * listed in `operator-audit.test.ts`'s `PLATFORM_TIER_ONLY` table, so downgrading the guard
 * fails the build.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE PATHS NAME LISTS, NEVER PEOPLE** (FR-1093a, FR-1099b). `sectors`, `subsectors` and
 * `interests` are reference data by name — a path is a promise, and none of these matches the
 * disclosure guard's noun set (`notes|saves|votes|attendees|…`) because none of them is about
 * attendee state. There is no route from a vocabulary value to an attendee, no per-value count
 * and no roster; `vocabulary-absences.test.ts` asserts the absence.
 *
 * **Retirement is addressed as its own resource** — `POST …/:id/retirement` to retire,
 * `DELETE …/:id/retirement` to reverse it — following `…/deactivation`'s rule that a route is
 * named for what it does. It is NOT a lifecycle (FR-1094b): a value is choosable from the moment
 * it exists, and retirement only withdraws it from future choice, writing to no attendee record.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const refusal = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

const throttled = {
  429: {
    description:
      "Throttled on `vocabulary_write`, keyed on the acting operator's own identity so a " +
      'refusal can only inconvenience the person authoring.',
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      retryAfterSeconds: { type: 'number' },
    },
  },
} as const

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const

/**
 * A vocabulary label's bounds are `PROFILE_LIMITS`', and that is load-bearing rather than tidy
 * (R18): a chosen value is stored on the attendee's own row under the same constant's column
 * CHECK, so a longer label here would be a value an operator can author that no attendee can
 * ever select. One constant, read in both places, so they cannot drift.
 */
const labelBody = (limit: number) =>
  ({
    type: 'object',
    required: ['label'],
    additionalProperties: false,
    properties: { label: { type: 'string', minLength: 1, maxLength: limit } },
  }) as const

const subsectorBody = {
  type: 'object',
  required: ['sectorId', 'label'],
  additionalProperties: false,
  properties: {
    sectorId: { type: 'string', format: 'uuid' },
    label: { type: 'string', minLength: 1, maxLength: PROFILE_LIMITS.subsector },
  },
} as const

const listResponse = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'label', 'retiredAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      label: { type: 'string' },
      retiredAt: {
        type: ['string', 'null'],
        description:
          'Set while the value is withdrawn from NEW choice (FR-1094a). Holders keep it either ' +
          'way, and clearing this reverses the withdrawal with no repair (FR-1094b).',
      },
    },
  },
} as const

const subsectorListResponse = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'sectorId', 'label', 'retiredAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      sectorId: { type: 'string', format: 'uuid' },
      label: { type: 'string' },
      retiredAt: { type: ['string', 'null'] },
    },
  },
} as const

/**
 * Charges one vocabulary write against the acting operator (FR-1039's shape). Keyed on their
 * own authenticated identity, which is what makes `mayDeny: true` legitimate: a refusal can
 * only inconvenience the person authoring.
 */
const throttle = async (request: FastifyRequest): Promise<void> => {
  const operator = platformScopeOf(request)

  const key = {
    identifierHash: hashAttemptValue(operator.operatorId),
    sourceHash: hashAttemptValue(request.ip),
    action: 'vocabulary_write' as const,
  }

  // Recorded before it is judged (FR-804); excluded from its own count (FR-805).
  const attemptId = await beginAttempt(key)
  const outstanding = await serveDelay(await failureDelayMs(key, attemptId))
  if (outstanding > 0) throw tooManyAttempts(outstanding, 'changes')
}

/**
 * Turns a refused vocabulary write into the response the contract declares.
 *
 * **Every explained refusal carries its OWN code** — this feature's twice-recorded lesson: the
 * administrative client classifies on the code and renders one sentence per code, so two
 * refusals sharing one become one sentence and the one that mattered is unreachable. The two
 * "held" refusals name THAT attendees hold the value and deliberately carry **no number**: a
 * count would be the per-value census FR-1099b forbids.
 */
const refuse = (result: Extract<VocabularyResult<unknown>, { ok: false }>): AppError => {
  switch (result.refusal) {
    case 'not-found':
      return notFound()
    case 'label-taken':
      return new AppError(
        'vocabulary_label_taken',
        409,
        'A value with that name already exists in this list. Two spellings of one thing is how ' +
          'a curated list stops being curated — reuse the existing value, or rename it.',
      )
    case 'rename-held':
      return new AppError(
        'vocabulary_rename_held',
        409,
        'Attendees hold this value on their own profiles, so its wording cannot be changed ' +
          'under them. Retire it and create the new wording instead — holders keep what they ' +
          'chose, and everyone choosing now sees only the new value.',
      )
    case 'delete-held':
      return new AppError(
        'vocabulary_delete_held',
        409,
        'Attendees hold this value on their own profiles, so it cannot be deleted. Retire it ' +
          'instead — it stops being offered, and what anybody already chose stays theirs.',
      )
    case 'sector-retired':
      return new AppError(
        'sector_retired',
        409,
        'That sector is retired, so it is not on offer to anybody choosing now — a new ' +
          'subsector of it could never be selected. Un-retire the sector first.',
      )
    case 'sector-has-subsectors':
      return new AppError(
        'sector_has_subsectors',
        409,
        'This sector still has subsectors. Delete or move them first, then remove it.',
      )
  }
}

export const adminVocabularyRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = [requirePlatformOperator]

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Sectors.
  // ─────────────────────────────────────────────────────────────────────────────────────────

  app.get(
    '/admin/vocabulary/sectors',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Every sector, including retired ones',
        description:
          'Retired values are listed because this screen is where retirement is reversed; the ' +
          'attendee-side read (`GET /vocabulary`) offers only the choosable (FR-1094a). No ' +
          'value carries any figure about who holds it — the vocabulary surface is not a ' +
          'census (FR-1099b).',
        response: { 200: listResponse, 401: refusal, 404: refusal },
      },
    },
    async (request) => listSectors(platformScopeOf(request)),
  )

  app.post(
    '/admin/vocabulary/sectors',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Add a sector',
        body: labelBody(PROFILE_LIMITS.sector),
        response: {
          201: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { label } = request.body as { label: string }
      const result = await getDb().transaction((tx) =>
        createSector(platformScopeOf(request), label, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/vocabulary/sectors/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Rename a sector nobody holds',
        description:
          'Refused with `vocabulary_rename_held` while any attendee holds the value (FR-1094c) ' +
          '— a rename would change what every holder’s profile asserts about them without ' +
          'writing to any attendee record. Retire-plus-create is the offered alternative.',
        params: idParams,
        body: labelBody(PROFILE_LIMITS.sector),
        response: {
          200: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const { label } = request.body as { label: string }
      const result = await getDb().transaction((tx) =>
        renameSector(platformScopeOf(request), id, label, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.post(
    '/admin/vocabulary/sectors/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Retire a sector — withdraw it from new choice, keeping every holder’s',
        description:
          'Writes to NO attendee record (FR-1094): holders keep the value, it keeps displaying ' +
          'and ranking, and it simply stops being offered to anybody choosing now (FR-1094a). ' +
          'Reversible via DELETE on this address, with no repair, because nothing was written.',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setSectorRetired(platformScopeOf(request), id, true, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/sectors/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Un-retire a sector, making it choosable again',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setSectorRetired(platformScopeOf(request), id, false, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/sectors/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Delete a sector nobody holds and nothing refines',
        description:
          'Refused with `vocabulary_delete_held` while any attendee holds the value (FR-1094) ' +
          'and with `sector_has_subsectors` while subsectors refine it. Retirement is the ' +
          'mechanism for a held value, because it writes to no attendee record.',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, 409: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteSector(platformScopeOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Subsectors. Everything above, plus FR-1087: every subsector belongs to exactly one sector.
  // ─────────────────────────────────────────────────────────────────────────────────────────

  app.get(
    '/admin/vocabulary/subsectors',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Every subsector, with the sector it refines',
        response: { 200: subsectorListResponse, 401: refusal, 404: refusal },
      },
    },
    async (request) => listSubsectors(platformScopeOf(request)),
  )

  app.post(
    '/admin/vocabulary/subsectors',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Add a subsector to an existing, unretired sector',
        description:
          'Refused with `sector_retired` when the named sector is withdrawn from choice ' +
          '(FR-1087, FR-1094a): a subsector of a retired sector could never be selected ' +
          'alongside its own sector.',
        body: subsectorBody,
        response: {
          201: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const body = request.body as { sectorId: string; label: string }
      const result = await getDb().transaction((tx) =>
        createSubsector(platformScopeOf(request), body, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/vocabulary/subsectors/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Rename a subsector nobody holds',
        params: idParams,
        body: labelBody(PROFILE_LIMITS.subsector),
        response: {
          200: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const { label } = request.body as { label: string }
      const result = await getDb().transaction((tx) =>
        renameSubsector(platformScopeOf(request), id, label, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.post(
    '/admin/vocabulary/subsectors/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Retire a subsector',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setSubsectorRetired(platformScopeOf(request), id, true, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/subsectors/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Un-retire a subsector',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setSubsectorRetired(platformScopeOf(request), id, false, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/subsectors/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Delete a subsector nobody holds',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, 409: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteSubsector(platformScopeOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Interest options. The label limit is `PROFILE_LIMITS.interest`, the same constant the
  // attendee's column CHECK enforces — see `labelBody`'s note.
  // ─────────────────────────────────────────────────────────────────────────────────────────

  app.get(
    '/admin/vocabulary/interests',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Every networking-interest option, including retired ones',
        response: { 200: listResponse, 401: refusal, 404: refusal },
      },
    },
    async (request) => listInterestOptions(platformScopeOf(request)),
  )

  app.post(
    '/admin/vocabulary/interests',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Add a networking-interest option',
        body: labelBody(PROFILE_LIMITS.interest),
        response: {
          201: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { label } = request.body as { label: string }
      const result = await getDb().transaction((tx) =>
        createInterestOption(platformScopeOf(request), label, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(201).send(result.value)
    },
  )

  app.patch(
    '/admin/vocabulary/interests/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Rename an interest option nobody holds',
        description:
          'The holder check matches the LABEL, so a retained free-text value an attendee wrote ' +
          'before the vocabulary listed it protects the option too (FR-1094c, FR-1095).',
        params: idParams,
        body: labelBody(PROFILE_LIMITS.interest),
        response: {
          200: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          401: refusal,
          404: refusal,
          409: refusal,
          ...throttled,
        },
      },
    },
    async (request) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const { label } = request.body as { label: string }
      const result = await getDb().transaction((tx) =>
        renameInterestOption(platformScopeOf(request), id, label, tx),
      )
      if (!result.ok) throw refuse(result)
      return result.value
    },
  )

  app.post(
    '/admin/vocabulary/interests/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Retire an interest option',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setInterestOptionRetired(platformScopeOf(request), id, true, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/interests/:id/retirement',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Un-retire an interest option',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        setInterestOptionRetired(platformScopeOf(request), id, false, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/vocabulary/interests/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['admin'],
        summary: 'Delete an interest option nobody holds',
        params: idParams,
        response: { 204: { type: 'null' }, 401: refusal, 404: refusal, 409: refusal, ...throttled },
      },
    },
    async (request, reply) => {
      await throttle(request)
      const { id } = request.params as { id: string }
      const result = await getDb().transaction((tx) =>
        deleteInterestOption(platformScopeOf(request), id, tx),
      )
      if (!result.ok) throw refuse(result)
      return reply.status(204).send()
    },
  )
}
