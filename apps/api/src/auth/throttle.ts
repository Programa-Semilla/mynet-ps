import { createHmac } from 'node:crypto'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { authSessions } from '../db/schema/auth-sessions.js'
import { signInAttempts, type ThrottleAction } from '../db/schema/sign-in-attempts.js'

/**
 * T037 — database-backed sign-in throttling (FR-031a–d, research.md D9).
 *
 * Database-backed rather than in-process, for two reasons that are not about scale: an
 * in-process counter is wrong the moment the API runs more than one instance, and it resets
 * on every deploy — which hands an attacker a reset button.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THERE IS NO LOCKOUT PATH IN THIS FILE, AND THERE MUST NEVER BE ONE.**
 *
 * FR-031b forbids permanent lockout, and quickstart.md Scenario 7 step 4 states why in one
 * line: email is the identifier, so a lock would let *anyone* deny an attendee access by
 * typing their address wrong enough times. Delay escalates to a ceiling and stops. The
 * correct credential always works, however many failures preceded it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T021–T023 (004) — FOUR ACTIONS NOW, AND THE NO-LOCKOUT GUARANTEE DOES NOT TRANSFER FOR
 * FREE** (FR-307, FR-307a, FR-314, FR-331, research D2).
 *
 * 001 built this for one action, and its guarantee rests on two mechanisms: the delay is
 * measured as *outstanding time* rather than as a streak, and **the credential is verified
 * before the throttle is consulted**, so a correct password is never refused.
 *
 * The second mechanism does not transfer. Sign-up, join-code entry and reset-request have no
 * credential to verify first, so the throttle must gate them — and for reset-request that is a
 * genuine new lockout surface, because an attacker spamming reset requests at a victim's
 * address would otherwise deny that victim their own recovery path. **The person an
 * identifier-keyed denial harms is always the victim, never the attacker.**
 *
 * Three things answer that, and all three are in this file:
 *
 *   1. **Separate counters per action** (`action` on the attempt row). Exhausting one action's
 *      allowance cannot consume another's, so a sign-up storm aimed at an address cannot slow
 *      that address's *sign-ins*. `sign_in`'s own thresholds are byte-for-byte what 001 set,
 *      because FR-307a requires the existing behaviour to be unchanged by this feature.
 *   2. **Per-action thresholds** (`THRESHOLDS` below), with reset-request weighted toward the
 *      source dimension — the dimension an attacker actually occupies.
 *   3. **A delay-only mode.** An action may be configured so its delay is always fully
 *      servable in-request, which makes a denial *unrepresentable* rather than merely avoided
 *      by a route that remembers not to raise one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Rolling window over which failures are counted. */
const WINDOW_MS = 60 * 60 * 1000

/**
 * How many attempt rows one count reads.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS BOUND SILENTLY DISABLES ANY THRESHOLD SET ABOVE IT, AND TWO ALREADY WERE.**
 *
 * `countFailures` counts non-successes among the rows it reads, so the count it returns can
 * never exceed this number. A `freeAttempts` above it therefore makes `delayFor` compute a
 * negative excess forever: the dimension is **dead configuration** that reads as a working
 * bound. It was 200 while `message_send.source` was 300 (007) and `question_vote.source` was
 * 600 (009) — so the source dimension, which is the dimension an attacker actually occupies,
 * did nothing at all for either action.
 *
 * Raised above every configured threshold rather than lowering the thresholds, because the
 * numbers were chosen against a threat and the scan bound was chosen against a query cost.
 * `tests/unit/throttle-actions.test.ts` now asserts the invariant, so the next entry above this
 * line fails the build instead of quietly not binding.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const ATTEMPT_SCAN_LIMIT = 1_000

/**
 * Identifier thresholds for sign-in. Escalation starts after 3 consecutive failures and grows
 * to a ceiling that caps sustained guessing at roughly 10 attempts per hour (research.md D9).
 */
export const IDENTIFIER_FREE_ATTEMPTS = 3
const IDENTIFIER_MAX_DELAY_MS = 6 * 60 * 1000

/**
 * Source thresholds sit an order of magnitude higher. A conference venue puts hundreds of
 * legitimate attendees behind one public address — the edge case the spec names explicitly.
 * Treating that address like a single guesser would lock out a whole conference hall.
 */
export const SOURCE_FREE_ATTEMPTS = 30
const SOURCE_MAX_DELAY_MS = 60 * 1000

interface DimensionThreshold {
  readonly freeAttempts: number
  readonly ceilingMs: number
}

interface ActionThreshold {
  readonly identifier: DimensionThreshold
  readonly source: DimensionThreshold
  /**
   * T023 — when false, this action's delay is **clamped to what can be served in-request**, so
   * `serveDelay` always reports nothing outstanding and the caller has no remainder to refuse
   * on.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **This is how "may delay but MUST NOT deny" becomes structural** rather than a rule the
   * reset route has to remember. A future edit to `routes/auth/reset.ts` cannot reintroduce a
   * denial by mistake, because there is no non-zero remainder for it to act on.
   *
   * It matters twice over for reset-request. It stops an attacker denying a victim their
   * recovery path (FR-331), **and** it keeps the throttle from becoming the account-existence
   * oracle FR-327 exists to close — a `429` where an unknown address gets a `202` would
   * distinguish the two exactly as well as a different message would.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly mayDeny: boolean
}

/**
 * T022 — per-action thresholds (FR-307a, research D2).
 *
 * Every entry states what it is defending, because a number without a threat is a number
 * somebody will later "tune".
 */
/**
 * **Exported for `tests/unit/throttle-actions.test.ts` (T030), and for nothing else.**
 *
 * `mayDeny: false` is a *guarantee* rather than a setting — FR-331 for `reset_request`, FR-511a
 * for `message_send` — and a guarantee that only one integration test happens to exercise is a
 * guarantee an edit can silently withdraw. The unit guard reads this table directly, so
 * flipping a flag fails the build rather than a conference.
 */
export const THRESHOLDS: Record<ThrottleAction, ActionThreshold> = {
  /**
   * **Unchanged from 001, deliberately and as a requirement** (FR-307a). Password guessing,
   * bounded to roughly ten attempts an hour per address while a venue full of legitimate
   * attendees behind one address stays usable.
   */
  sign_in: {
    identifier: { freeAttempts: IDENTIFIER_FREE_ATTEMPTS, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: SOURCE_FREE_ATTEMPTS, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * Account-creation spam, and address enumeration through FR-303's deliberate disclosure —
   * a refused sign-up says the address is already registered, so unlimited attempts would be a
   * membership oracle. Rate limiting is what actually defends that (FR-303, FR-307).
   *
   * The source allowance matches sign-in's: conference-day sign-ups arrive in a burst from one
   * venue address, and treating that as an attack would refuse the very journey US1 exists for.
   */
  sign_up: {
    identifier: { freeAttempts: 3, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: SOURCE_FREE_ATTEMPTS, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * Join-code enumeration (FR-314). The identifier here is the **signed-in attendee**, not an
   * address — this action is authenticated — so a denial can only ever inconvenience the person
   * doing the guessing, which is why it may deny.
   *
   * Slightly more generous than sign-in on the identifier: a code is read off a badge or a
   * slide and mistyped honestly more often than a password the browser fills in.
   */
  join_code: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 50, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * Personal-data export (FR-379).
   *
   * Authenticated, so the identifier is the attendee themselves and a denial can only ever
   * inconvenience the person asking. Deliberately tight: an export embeds the avatar and reads
   * every table holding anything about one person, so it is the most expensive request in the
   * product — and nobody has a reason to want several a minute. Somebody who genuinely needs a
   * second copy waits a moment for it.
   */
  export: {
    identifier: { freeAttempts: 3, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 20, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * Token submission — verification and reset completion (FR-387).
   *
   * **Keyed on the submitted token, never on an address**, which is what makes `mayDeny: true`
   * safe here where it is deliberately unsafe for `reset_request` below. A refusal keyed on a
   * token can only fall on somebody who holds that token; there is no third party a denial
   * could harm, so the reasoning that forces `reset_request` to delay-only does not apply.
   *
   * These are not guessing defences — the tokens are 256-bit and the search space is not
   * walkable — they bound the free unauthenticated *write* each submission performs against the
   * token tables. Generous on the identifier because a person clicking a stale link twice is
   * ordinary; tight on the source because nobody legitimately submits many distinct tokens.
   */
  verify_token: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 30, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  reset_submit: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 30, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * Avatar upload (FR-347, FR-348).
   *
   * Authenticated, so the identifier is the uploader and a denial can only inconvenience the
   * person uploading. Tight for the same reason `export` is: this request decodes a full
   * raster, runs an entropy analysis over it to choose the crop, and re-encodes — the most
   * expensive work the API does per request. Nobody changes their photograph several times a
   * minute, and `limitInputPixels` bounds one upload while this bounds the rate.
   */
  avatar_upload: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 30, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * **The one that cannot deny** (FR-331, FR-327, research D2).
   *
   * Weighted toward the source: the identifier allowance is deliberately small because it only
   * ever buys a short in-request delay, and the source allowance is where the real bound sits —
   * the source is the dimension an attacker occupies and a victim does not.
   */
  reset_request: {
    identifier: { freeAttempts: 1, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 20, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: false,
  },

  /**
   * T029 (007) — sending a message (FR-511a).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **`mayDeny: false`, and it is the second entry in this table to say so — for a completely
   * different reason from `reset_request` above** (research R5).
   *
   * `reset_request` cannot deny because it is keyed on the **victim's** identifier: an attacker
   * who triggers a denial denies somebody else their recovery path, so the denial *is* the
   * attack. Nothing like that is true here. This action is authenticated and keyed on the
   * sender's own identity, so a denial could only ever fall on the sender.
   *
   * It is delay-only anyway, because **a delayed message is a working product and a refused one
   * is not.** A networking product's value is a timely reply; an attendee whose message is
   * refused at a conference has been handed a failure they cannot act on, in the one moment the
   * contact mattered. The volume one person can type is self-limiting, and the harm M1 names is
   * not volume within a thread at all — it is *breadth of contact*, which is
   * `conversation_create`'s job below.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * Generous on both dimensions: a lively exchange is several messages a minute, and a
   * conference venue behind one address has hundreds of attendees doing that at once.
   */
  message_send: {
    identifier: { freeAttempts: 30, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 300, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: false,
  },

  /**
   * T029 (007) — opening a conversation with somebody new (FR-504a).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **`mayDeny: true`, and this is the one throttle in the feature that genuinely refuses.**
   *
   * It is legitimate here for the reason it is legitimate on `join_code`, `export` and
   * `avatar_upload`: the identifier is the **acting attendee's own authenticated identity**, so
   * a refusal can only inconvenience the person doing it. There is no third party for a denial
   * to harm, which is precisely what separates this from `reset_request`.
   *
   * And a real cap is what FR-504a asks for. One account opening a thread with every attendee
   * at a conference is the abuse this feature has to bound, and a bound that only *slows* mass
   * contact does not bound it — it just spreads it over the afternoon.
   * ───────────────────────────────────────────────────────────────────────────────────────
   *
   * Tighter than `message_send` by an order of magnitude, deliberately: reaching out to a
   * genuinely new person is a considered act that happens a handful of times an hour, not
   * thirty. Somebody working through a shortlist from Discover stays well inside it.
   */
  conversation_create: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 60, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * T041 (008) — sharing your card with somebody (FR-609, FR-638a).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **`mayDeny: true`, and this entry states its reasoning rather than inheriting it from the
   * neighbour above.**
   *
   * The rule this table actually runs on is *who a denial falls on*. `reset_request` is keyed on
   * a **victim's** address, so a denial there **is** the attack and the action is delay-only.
   * `message_send` is delay-only for a different reason again — a refused message at the moment
   * the contact mattered is a failure the attendee cannot act on.
   *
   * Neither applies here. This action is authenticated and keyed on the **sharer's own
   * identity**, so a refusal can only ever inconvenience the person sharing; there is no third
   * party for a denial to harm. And unlike a message, a card share is not time-critical to a
   * conversation in progress — somebody who has hit the ceiling meets the next person a minute
   * later with everything intact.
   *
   * What it bounds is the shape FR-609 names: **one account working through a conference's
   * whole directory, pushing its card at everybody.** Each share plants a durable entry in a
   * stranger's Network that they did not ask for and cannot delete (FR-618) — so a bound that
   * merely *slowed* mass sharing would not bound it at all, it would spread it over the
   * afternoon. That is the same argument `conversation_create` makes, and it lands harder here
   * because what is left behind is permanent.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * Deliberately close to `conversation_create`'s numbers: giving somebody your card is the same
   * kind of considered, per-person act as opening a conversation with them, and the two are
   * often the same encounter. Generous enough for a busy hallway hour; nowhere near enough to
   * paper a conference.
   */
  card_share: {
    identifier: { freeAttempts: 10, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 60, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * T041 (008) — proposing a meeting (FR-638, FR-638a).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **`mayDeny: true`, on the same reasoning as `card_share` above, and for a harm that is one
   * step larger.**
   *
   * Keyed on the proposer's own authenticated identity, so a denial falls only on them. What it
   * bounds is proposal spam: an appointment **asks for a slot of somebody else's time**, and it
   * arrives in their Network needing an answer. Unanswered proposals accumulate on the invitee's
   * surface, which is a cost imposed on a person who did nothing.
   *
   * The design already removes the worst version of that: a **received** proposal consumes none
   * of the invitee's availability (SC-608a), so no volume of proposals can reduce what anybody
   * else is offered. This bounds the remaining nuisance rather than the griefing, which is why
   * it can be a plain per-actor ceiling.
   *
   * Tighter than `card_share` on the identifier: proposing a specific time to a specific person
   * is a more deliberate act than handing over a card, and nobody legitimately does it often.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  appointment_propose: {
    identifier: { freeAttempts: 6, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 60, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * T025 (009) — asking a question (FR-746, research R8).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The tightest of this feature's three question-side actions, and the one that publishes
   * free text to a whole conference.** This is Q&A's `card_share`: keyed on the asker's own authenticated
   * identity, so a denial can only inconvenience the person asking, and what it bounds is one
   * account filling a session's question list — the first many-to-many surface in a product
   * with public self sign-up and no moderator by construction.
   *
   * Ten is generous against the real behaviour it must not refuse: a curious attendee at a
   * keynote asks one or two questions, not ten, and somebody who genuinely hits the ceiling
   * waits a moment rather than losing anything.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  question_ask: {
    identifier: { freeAttempts: 10, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 100, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * T025 (009) — upvoting (FR-746, research R8).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Looser than asking by an order of magnitude, and the gap is the point.**
   *
   * A vote is a single bit that publishes nothing and names nobody but its caster. A reader
   * working down a long list at a well-attended keynote legitimately casts dozens in one sitting,
   * so a bound near `question_ask`'s would refuse ordinary use. What this exists to stop is a
   * script, not a person — and the composite primary key already makes repetition free of effect
   * (FR-718), so volume here costs the product a statement rather than a row.
   *
   * `mayDeny: true` on the same reasoning as its neighbour: authenticated, keyed on the voter,
   * so a refusal falls only on them.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  question_vote: {
    identifier: { freeAttempts: 60, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 600, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },

  /**
   * T071 (009) — submitting a report (FR-746, research R8).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THIS CLOSES A GAP 007 LEFT, NOT ONE 009 OPENS — AND IT IS TIGHTER THAN EVERY OTHER
   * AUTHENTICATED ACTION, FOR A REASON NONE OF THEM HAS.**
   *
   * Reporting is the only action in this product that **sends mail out of it**. Every other
   * throttle here bounds work the server does for itself; this one bounds messages arriving in
   * an inbox a human is supposed to read, which is the single safety channel the product has and
   * the one thing an attacker gains by flooding. Blocking, by contrast, is unthrottled and
   * harmlessly so: it writes a row and tells nobody.
   *
   * `mayDeny: true` on the same reasoning as every authenticated action here — keyed on the
   * reporter's own identity, so a refusal falls only on them.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Deliberately generous enough that a person in trouble is never refused.** Somebody being
   * harassed may legitimately report two or three accounts in quick succession, and a bound that
   * caught them would be a safety failure dressed as a rate limit. Five is well above any real
   * sequence and far below a flood; the source allowance stays an order of magnitude higher so a
   * conference venue behind one address is never the thing that trips it.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  report_submit: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 50, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: true,
  },
}

export interface AttemptKey {
  readonly identifierHash: string
  readonly sourceHash: string
}

/** Every counted key now carries the action it belongs to (FR-307a). */
export type ActionKey = AttemptKey & { readonly action: ThrottleAction }

/**
 * Keyed hash, so the table can count per identifier while holding no readable address.
 *
 * HMAC rather than a plain digest: a bare SHA-256 of an email is trivially reversible by
 * dictionary, which would make this table a list of addresses that were typed at the service
 * — personal data about people who may not even be attendees (FR-042, Principle VIII).
 */
export const hashAttemptValue = (value: string): string =>
  createHmac('sha256', loadConfig().auth.attemptHashKey)
    .update(value.trim().toLowerCase(), 'utf8')
    .digest('hex')

/**
 * Records an attempt. **Never receives the submitted credential** — there is no parameter for
 * one, which is how FR-031c is guaranteed rather than remembered.
 */
export const recordAttempt = async ({
  identifierHash,
  sourceHash,
  action,
  succeeded,
}: ActionKey & { succeeded: boolean }): Promise<void> => {
  await getDb().insert(signInAttempts).values({ identifierHash, sourceHash, action, succeeded })
}

/**
 * 004 review — **for the actions whose cost is paid on every request, not only on failure.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `succeeded` has a specific meaning to `countFailures`: `false` extends the identifier streak,
 * `true` ends it. Three call sites pass a bare `false` on their **success** path, which reads
 * as a copy-paste bug and is not one — for `export`, `avatar_upload` and verification resend the
 * server does the expensive work whether or not the caller is pleased with the result, so every
 * request has to count or the limit does not bind at all.
 *
 * Spelling that as `recordRequest` rather than `succeeded: false` is the point. Somebody
 * "fixing" the literal to `true` would make those three limits unreachable — the streak would
 * reset on every success — and no test would fail. A named function states the policy where the
 * boolean could only misstate a fact.
 *
 * These actions therefore escalate toward their ceiling under sustained use and eventually
 * answer 429 with retry-after guidance. That is a delay with a stated wait, never a permanent
 * refusal: the next window clears it, and for `export` in particular a personal-data right is
 * deferred by minutes and never denied.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const recordRequest = async (key: ActionKey): Promise<void> => {
  await recordAttempt({ ...key, succeeded: false })
}

interface FailureStreak {
  readonly count: number
  /** When the most recent failure happened. Undefined when there is no streak. */
  readonly lastFailureAt: Date | undefined
}

/**
 * Failures for one key **within one action**, inside the rolling window.
 *
 * `resetOnSuccess` is the difference between the two dimensions, and it is not cosmetic:
 *
 * - **Identifier**: a streak, ended by a success. A legitimate attendee who mistypes three
 *   times and then gets in must not carry those failures forward.
 * - **Source**: an absolute count, *not* ended by a success. Resetting the source on any
 *   success let an attacker holding one valid account spray indefinitely from a single
 *   address — sign in to their own account every thirty guesses and the source counter never
 *   reaches its threshold. Source throttling is the only bound on a spray across thousands of
 *   identifiers (each of which gets three free attempts of its own), so it must not be
 *   resettable by the attacker at will (FR-031a).
 *
 * The `action` filter is 004's addition and is the whole of FR-307a: without it a storm against
 * one action lands in every other action's counter.
 */
const countFailures = async (
  column: typeof signInAttempts.identifierHash | typeof signInAttempts.sourceHash,
  value: string,
  action: ThrottleAction,
  { resetOnSuccess }: { resetOnSuccess: boolean },
): Promise<FailureStreak> => {
  const since = new Date(Date.now() - WINDOW_MS)

  const rows = await getDb()
    .select({ succeeded: signInAttempts.succeeded, occurredAt: signInAttempts.occurredAt })
    .from(signInAttempts)
    .where(
      and(
        eq(signInAttempts.action, action),
        eq(column, value),
        gte(signInAttempts.occurredAt, since),
      ),
    )
    .orderBy(desc(signInAttempts.occurredAt))
    .limit(ATTEMPT_SCAN_LIMIT)

  let count = 0
  let lastFailureAt: Date | undefined

  for (const row of rows) {
    if (row.succeeded) {
      if (resetOnSuccess) break
      continue
    }
    lastFailureAt ??= row.occurredAt
    count += 1
  }

  return { count, lastFailureAt }
}

/** Exponential escalation, clamped. The clamp is what keeps FR-031b true. */
const delayFor = (failures: number, freeAttempts: number, ceilingMs: number): number => {
  const excess = failures - freeAttempts
  if (excess <= 0) return 0
  return Math.min(2 ** (excess - 1) * 1000, ceilingMs)
}

/**
 * How much of the escalated delay is **still outstanding**, given how long the caller has
 * already waited since their last failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This subtraction is what makes the delay a delay.**
 *
 * Without it, `delayFor` returns a non-zero number for as long as the failure streak sits
 * inside the rolling window, and the caller in `sign-in.ts` refuses on anything non-zero. The
 * effect was a **one-hour lockout keyed on the email address** that no amount of waiting could
 * clear — and since anyone can type anyone's address, an attacker could hold an account shut
 * indefinitely by failing four times an hour.
 *
 * That is precisely what FR-031b forbids ("no permanent lockout may exist") and what SC-003a
 * measures as "the number of accounts an attacker can render permanently inaccessible is zero".
 * The header of this file always claimed the correct credential works however many failures
 * preceded it; until this subtraction existed, that claim was false.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const outstandingDelay = (
  streak: FailureStreak,
  { freeAttempts, ceilingMs }: DimensionThreshold,
): number => {
  const required = delayFor(streak.count, freeAttempts, ceilingMs)
  if (required === 0 || !streak.lastFailureAt) return 0

  const waited = Date.now() - streak.lastFailureAt.getTime()
  return Math.max(0, required - waited)
}

/**
 * How long a **failed** attempt must be held before it is answered, in milliseconds.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **For `sign_in` this is only ever consulted after a credential has already been rejected.**
 *
 * That ordering is the whole of FR-031b. When the throttle gated the request *before*
 * verification, an attacker could hold any account they could name permanently unreachable:
 * failures from anyone counted toward the streak, the outstanding delay was measured from the
 * newest failure, and only a *success* could clear it — but the gate refused the owner's
 * correct password before it was ever checked. A closed loop, and precisely the
 * "anyone who knows an attendee's email can deny them access" outcome FR-031b names.
 *
 * With verification first, the correct credential is never refused, however many failures
 * precede it, and SC-003a's "accounts an attacker can render permanently inaccessible" is zero
 * by construction rather than by clamping.
 *
 * **The other three actions have no credential to verify first**, which is why they need
 * `mayDeny` (research D2). See `THRESHOLDS`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The larger of the two dimensions wins, so a well-behaved attendee behind a hostile shared
 * address is still protected, and a single hostile identifier is still throttled on an
 * otherwise quiet network.
 */
export const failureDelayMs = async ({
  identifierHash,
  sourceHash,
  action,
}: ActionKey): Promise<number> => {
  const thresholds = THRESHOLDS[action]

  const [identifier, source] = await Promise.all([
    countFailures(signInAttempts.identifierHash, identifierHash, action, { resetOnSuccess: true }),
    countFailures(signInAttempts.sourceHash, sourceHash, action, { resetOnSuccess: false }),
  ])

  const delayMs = Math.max(
    outstandingDelay(identifier, thresholds.identifier),
    outstandingDelay(source, thresholds.source),
  )

  // T023 — a delay-only action's cost is capped at what `serveDelay` will actually sleep, so
  // there is never a remainder for a caller to turn into a refusal. The clamp lives here rather
  // than at the call site precisely so no call site can forget it.
  if (!thresholds.mayDeny) {
    return Math.min(delayMs, loadConfig().auth.maxServedDelayMs)
  }

  return delayMs
}

/**
 * Serves as much of the delay as is reasonable to hold a request open for, and reports the
 * remainder as retry-after guidance.
 *
 * Returns the number of seconds still outstanding after sleeping, or 0 when the delay has been
 * served in full. A caller that receives a non-zero value should refuse with `too_many_attempts`.
 *
 * **A delay-only action can never produce a non-zero return here**, because `failureDelayMs`
 * has already clamped its result to this same bound.
 */
export const serveDelay = async (delayMs: number): Promise<number> => {
  if (delayMs <= 0) return 0

  // The bound is configuration, not a constant: sleeping for the full six-minute ceiling would
  // exceed every sensible request timeout, so the escalation is served up to this bound and the
  // remainder becomes guidance. The attacker still pays — each failed guess occupies a
  // connection for this long before it is answered.
  const served = Math.min(delayMs, loadConfig().auth.maxServedDelayMs)
  await new Promise((resolve) => setTimeout(resolve, served))

  return Math.ceil((delayMs - served) / 1000)
}

/**
 * 004 review — **flattens a timing difference between two branches of one handler** (FR-327).
 *
 * An identical status and an identical body are not an identical response if one branch takes
 * measurably longer than the other. Where the expensive branch cannot be faked — reset-request
 * cannot issue a token for an account that does not exist — the remaining defence is to make the
 * cheap branch cost the same.
 *
 * Sleeps until `budgetMs` have elapsed since `startedAt`, and returns immediately if the work
 * already took longer. Overrunning is safe for non-disclosure in the direction that matters: the
 * pad is sized above the expensive branch's normal cost, so an overrun means something
 * exceptional happened rather than that an account was found.
 *
 * Takes an `hrtime.bigint()` reading rather than `Date.now()` — a monotonic clock cannot be
 * moved by an NTP step mid-request, which would otherwise pad by an arbitrary amount or not
 * at all.
 */
export const padElapsedTo = async (startedAt: bigint, budgetMs: number): Promise<void> => {
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
  const remaining = budgetMs - elapsedMs
  if (remaining <= 0) return

  await new Promise((resolve) => setTimeout(resolve, remaining))
}

/**
 * Deletes attempt rows past their usefulness.
 *
 * Retention beyond the counting window is pointless and adds risk: these are keyed hashes of
 * every address ever typed at the service, including addresses belonging to people who are not
 * attendees (FR-042, Principle VIII). The margin over `WINDOW_MS` exists only so that a clock
 * skew or a slow sweep cannot delete rows the throttle is still counting.
 *
 * **Two hours, and FR-382 forbids lengthening it.** This is the one personal-data record no
 * deletion cascade reaches — deliberately, because deleting a departing attendee's rows would
 * let an attacker clear their own trail by registering and deleting an account (research D10).
 * The sweep is therefore not a second line of defence here; it is the only one.
 */
export const pruneAttempts = async (): Promise<void> => {
  await getDb()
    .delete(signInAttempts)
    .where(sql`${signInAttempts.occurredAt} < now() - interval '2 hours'`)
}

/**
 * Deletes sign-in sessions that ended long enough ago to be of no further use.
 *
 * Expired and revoked rows are dead weight: they can never authenticate anything, and each one
 * is a record of when a particular attendee was using MyNet.
 */
export const pruneSessions = async (): Promise<void> => {
  await getDb()
    .delete(authSessions)
    .where(
      sql`${authSessions.expiresAt} < now() - interval '30 days'
          or ${authSessions.revokedAt} < now() - interval '30 days'`,
    )
}

export type { ThrottleAction }
