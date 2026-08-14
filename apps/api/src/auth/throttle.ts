import { createHmac } from 'node:crypto'

import { and, desc, eq, lt, sql } from 'drizzle-orm'

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

/**
 * Rolling window over which failures are counted.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T022 (010) — A POSTGRESQL INTERVAL, NOT A JAVASCRIPT DURATION** (FR-811).
 *
 * This was `const WINDOW_MS = 60 * 60 * 1000`, subtracted from `Date.now()` in Node and sent to
 * the database as a parameter. The rows it bounds are stamped by **PostgreSQL** — `occurred_at`
 * defaults to `now()` — so that was two machines' opinions about the present, in two containers,
 * with nothing keeping their clocks together.
 *
 * Drift is silent in both directions and weakens the bound in both: a container clock ahead of
 * the database narrows the window and discards rows the throttle should be counting; behind it,
 * `outstandingDelay` measures a longer wait than actually elapsed and subtracts a delay that was
 * never served.
 *
 * Expressed here so the window is evaluated by the machine that stamped the rows.
 * `tests/unit/throttle-clock.test.ts` asserts that no wall clock but the database's is consulted
 * anywhere in this file.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const WINDOW = sql`interval '1 hour'`

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
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T019 (010) — RAISED AGAIN, FROM 1,000, AND THIS TIME THE BOUND WAS ACTUALLY BINDING.**
 *
 * 010's two read actions are the largest allowances in the table by an order of magnitude, and
 * they have to be: the message-thread poll runs every three seconds, so an hour of ordinary use
 * is ~1,200 requests. An allowance under that would delay every attendee having a normal
 * conversation. `thread_read.source` at 6,000 is the largest, so the scan bound follows it.
 *
 * **The cost is real and is stated rather than absorbed.** Every count now reads up to 6,500 rows
 * instead of 1,000, twice per throttled request, on a two-vCPU machine that also runs PostgreSQL.
 * Both index definitions lead with `action`, so this is an index-range scan rather than a table
 * scan — but at a busy venue the source key for `thread_read` genuinely holds thousands of rows
 * an hour, and this is the one action where the worst case is the ordinary case.
 *
 * **The end-state is not a bigger number.** `countFailures` materialises rows and counts them in
 * JavaScript, which is why a bound is needed at all; a windowed `count(*)` in SQL would be exact
 * and cheap and would delete this constant. Research R5 records that rewrite as the better
 * end-state and declines it in the same change that first deploys the product.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const ATTEMPT_SCAN_LIMIT = 6_500

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

/**
 * T019 (010) — the ceiling for the two **read** actions (FR-802, FR-803, research R7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FIVE SECONDS RATHER THAN SIX MINUTES, AND THIS IS THE LOAD-BEARING CHOICE IN THE WHOLE
 * ADDITION.**
 *
 * Every pre-existing action escalates toward `IDENTIFIER_MAX_DELAY_MS`. Those are writes and
 * sign-in attempts: holding one open is a cost paid by a guesser, and six minutes is a price
 * worth charging them.
 *
 * A six-minute delay on a **read** is not a slowdown, it is a freeze. The directory never
 * arrives; the thread stops updating; the attendee sees a product that has hung, and no part of
 * the interface can tell them otherwise because nothing failed. Five seconds degrades a poll to a
 * slower poll — which is the only shape a bound that "may delay but never deny" can honestly
 * take. A refusal the attendee cannot distinguish from a hang is a refusal.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const READ_MAX_DELAY_MS = 5_000

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
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T044 (016) — RE-CHECKED UNDER MUTUAL EXCHANGE, AND THE FIRST ANSWER WAS WRONG ABOUT WHOSE
   * DATA THE SECOND ROW IS.**
   *
   * Constitution v5.0.0 (C1) makes one call write **two** rows rather than one. This entry
   * originally concluded that the numbers could stand, on the ground that *"the second row is the
   * reciprocal one, and it lands in the **sharer's own** account — a contact they acquired by
   * their own act, which they chose, and which harms nobody."* **That sentence is retracted, and
   * it is retracted because it confuses where a row lands with whose data it is.**
   *
   * The reciprocal row is `(sharer_id = recipient, recipient_id = caller)`. It sits in the
   * caller's contacts, and its **subject is the recipient**. What it confers is a read of that
   * person's **live** profile through `heldCardSelect` — which applies **no** discoverability
   * condition, **no** verification condition and **no** registration join, because those three
   * absences are the standing-consent feature (FR-612–FR-614) — and the single-card route serves
   * their **avatar bytes**. It cannot be recalled (FR-618), it survives the conference, and the
   * subject cannot enumerate who holds it.
   *
   * So the count of unsolicited durable consequences per call went from **one to two**, and the
   * new one is the more sensitive of the pair.
   *
   * **FR-1053's ground holds for the INSTANT and not for the DURATION, which is the whole of the
   * correction.** C1 licenses the exchange because *"the exchange moves **when** a co-attendee
   * sees those fields, not **whether**"* — true at the moment of sharing, when the recipient is
   * discoverable and the caller could already read all of it. But discoverability is **revocable
   * and event-scoped**, and a held card is **neither**. Looping this route over a directory
   * therefore converts a revocable publication into a permanent one, which is a change of kind
   * rather than of timing, and it is precisely the harm this counter is the only bound on.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **SO THE IDENTIFIER ALLOWANCE COMES DOWN — 10 → 5 — AND THE ARITHMETIC IS STATED HERE
   * RATHER THAN LEFT FOR SOMEBODY TO REDERIVE WHILE RAISING IT.**
   *
   * `delayFor` ramps at `2^(excess-1)` seconds to a six-minute ceiling, so the head of the curve
   * is what `freeAttempts` governs and the tail is what the ceiling governs:
   *
   *   * At 10 free: ten immediate, then nine ramped shares costing ~8.5 minutes in total, then
   *     one every six minutes — roughly **27 in the first hour**.
   *   * At 5 free: five immediate, the same nine ramped, then the same six-minute steps —
   *     roughly **22 in the first hour**.
   *
   * **Five is a real reduction in the burst and NOT a reduction in the sustained rate**, and
   * saying so is the point: past the ramp the rate is ten an hour whatever `freeAttempts` is,
   * because the ceiling alone sets it. A hallway hour of genuine encounters — five shares with no
   * delay at all, a sixth costing one second, a seventh two — is untouched; a directory sweep
   * pays over two minutes per person from the thirteenth onward.
   *
   * **The ramp is designed to make abuse expensive, not impossible, and what is being acquired is
   * now permanent.** That residual is deliberate and is stated rather than implied: a determined
   * account with a verified address can still accumulate a few hundred live-resolving profile
   * reads a day. Closing it absolutely needs an **absolute cap on *successful* exchanges per
   * window** — a mechanism this table does not have, since every entry here delays and then
   * refuses the remainder — and adding one is an owner decision on ratified text (`v5.0.0` C1),
   * recorded as finding S1 rather than taken here.
   *
   * **Do not cite the retracted sentence to raise this ceiling.** The number that would justify a
   * raise is a change in what a held card *confers*, not a change in how many rows a call writes.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  card_share: {
    identifier: { freeAttempts: 5, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
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

  /**
   * T040 (012) — administrative sign-in (FR-916, research R4).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **`mayDeny: false`, REACHED BY `reset_request`'S OWN ARGUMENT RATHER THAN A DIFFERENT ONE.**
   *
   * Four entries in this table may never deny and **each gets there a different way**, which is
   * why every one of them argues it rather than citing a neighbour. `reset_request` because it is
   * keyed on a victim's address; `message_send` because a refused message when a conference
   * contact mattered is a failure the attendee cannot act on; `directory_read` and `thread_read`
   * because refusing them refuses the product's central journey. This entry is the **first to
   * repeat an existing argument**, and it repeats `reset_request`'s exactly.
   *
   * The rule this table runs on is *who a denial falls on*. Every `mayDeny: true` action above
   * is authenticated and keyed on the acting attendee's own identity, so a refusal can only
   * inconvenience the person doing the thing. `reset_request` is `mayDeny: false` because it is
   * keyed on a **victim's** address: an identifier-keyed denial there only ever harms the person
   * being attacked.
   *
   * This is that case again. Administrative sign-in is unauthenticated and keyed on a submitted
   * address, so anyone can drive the counter for an address they do not own — and the address
   * they would choose is the platform operator's, who is the only principal that can read the
   * report queue or promote anybody.
   *
   * **Note that the attendee `sign_in` action IS `mayDeny: true`, and the difference is
   * population rather than principle.** A locked-out attendee is one of thousands and recovers
   * by waiting; a locked-out operator may be the only person able to act on the product, with
   * nobody to appeal to. The blast radius of the same mechanism is different enough to change
   * the setting, and that reasoning is written here rather than left to be inferred from the
   * neighbouring entry.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * Tight free allowances despite never denying, because delay is the whole control here: an
   * operator signing in types one password, and six attempts is far beyond a typo while the
   * escalating delay makes credential-guessing pointless. The source allowance stays an order of
   * magnitude higher for the reason every entry gives — one office behind one address must not
   * trip it.
   */
  admin_sign_in: {
    identifier: { freeAttempts: 6, ceilingMs: IDENTIFIER_MAX_DELAY_MS },
    source: { freeAttempts: 60, ceilingMs: SOURCE_MAX_DELAY_MS },
    mayDeny: false,
  },

  /**
   * T019 (010) — **the attendee directory listing** (FR-801, FR-802, research R7).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE FIRST READ IN THIS TABLE, AND THE THIRD ENTRY THAT MAY NEVER DENY — FOR A THIRD
   * DISTINCT REASON.**
   *
   * `reset_request` cannot deny because it is keyed on a **victim's** address, so the denial is
   * the attack. `message_send` cannot deny because a refused message at the moment a conference
   * contact mattered is a failure the attendee cannot act on. Neither argument is this one.
   *
   * This may not deny because **it is the product's central journey**: a refusal here refuses
   * Discover to somebody standing in a venue trying to find the person they were told to meet.
   * The harm being bounded is bulk collection of an attendee list, and bulk collection is bounded
   * perfectly well by making it expensive — an automated reader paying five seconds a page is
   * paying a price a browsing human never notices.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   *
   * **120 an hour** is a heavy human session and roughly a tenth of what a harvester wants.
   * Paging a 1,000-attendee conference at a hundred rows a request costs about ten requests, plus
   * one for every search or filter change — a person exploring hard spends a few dozen.
   *
   * The source allowance is ten times that, as every entry above it is, because a conference
   * venue puts hundreds of legitimate attendees behind one public address.
   */
  directory_read: {
    identifier: { freeAttempts: 120, ceilingMs: READ_MAX_DELAY_MS },
    source: { freeAttempts: 1_200, ceilingMs: READ_MAX_DELAY_MS },
    mayDeny: false,
  },

  /**
   * T019 (010) — **a page of message history** (FR-803, research R7).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **THE LARGEST ALLOWANCE IN THIS TABLE, AND IT HAS TO BE.**
   *
   * This is the one read a client issues **without anybody acting**: `useConversation` polls
   * every three seconds while a thread is open and the tab is visible. An hour of one ordinary
   * conversation is therefore ~1,200 requests. **An allowance below that would delay every
   * attendee having a normal exchange** — the bound would be a product defect wearing a
   * defence's clothes. 1,500 clears legitimate use with room, and still bounds a client that has
   * removed its own interval.
   *
   * `mayDeny: false` matters more here than anywhere else in the table, and not only for the
   * reason `directory_read` gives. The client's poll backs off exponentially **on failure**, so a
   * single 429 would not refuse one read — it would push the client into a backoff that makes the
   * conversation appear to have stopped, long after the throttle had cleared.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THE SOURCE DIMENSION IS THE WEAK POINT OF THIS ENTRY, AND IT IS RECORDED RATHER THAN
   * DISCOVERED LATER.**
   *
   * A venue puts every attendee behind one address. Twenty people with a thread open is 24,000
   * requests an hour from one source — four times this allowance — so at a well-attended
   * conference the **source** counter saturates and every poll takes the full five seconds, for
   * attendees doing nothing wrong. The thread still works and nothing is refused, which is why
   * this is a degradation rather than a defect; but it is a degradation UAT will never surface,
   * because UAT has a handful of users.
   *
   * Raising it is not free either: the source allowance is what bounds a script polling from one
   * machine, and `ATTEMPT_SCAN_LIMIT` has to stay above whatever it becomes. Left at the
   * specification's number deliberately, and flagged for the reviewer rather than quietly tuned.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  thread_read: {
    identifier: { freeAttempts: 1_500, ceilingMs: READ_MAX_DELAY_MS },
    source: { freeAttempts: 6_000, ceilingMs: READ_MAX_DELAY_MS },
    mayDeny: false,
  },
}

/**
 * T019 (010) — **the routes that carry a read bound, enumerated in one place** (FR-803a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"AN ENUMERATION THAT A NEW POLL CAN SILENTLY SIT OUTSIDE IS NOT A BOUND."**
 *
 * That is FR-803a verbatim, and it is why this list exists beside the threshold table rather
 * than living implicitly in whichever handlers happen to call the throttle. A list on its own
 * would be correct on the day it was written and wrong the first time somebody added a poll —
 * and nothing about adding a poll makes anybody open this file.
 *
 * `tests/unit/throttle-route-audit.test.ts` is what closes that. It walks the real route table
 * and requires **every authenticated GET route** to be either in this list or in an explicit
 * exemption list with a written reason. A new read route fails the build until somebody decides
 * which it is — the same fail-by-existence discipline `deletion-coverage` and `export-coverage`
 * apply to tables.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Adding an entry here is half the work: the action also needs a `THRESHOLDS` entry, and the
 * route has to actually call the throttle. The audit checks all three.
 */
export const THROTTLED_READ_ROUTES: readonly {
  readonly action: ThrottleAction
  readonly method: string
  readonly path: string
}[] = [
  { action: 'directory_read', method: 'GET', path: '/events/:eventId/attendees' },
  { action: 'thread_read', method: 'GET', path: '/conversations/:conversationId/messages' },
]

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

/** The row one request is judged against. Opaque to callers; ordering is its only meaning. */
export type AttemptId = bigint

/**
 * T017 (010) — **records this request BEFORE it is judged, and returns the row it wrote**
 * (FR-804, FR-805, research R5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ORDERING IS THE WHOLE OF FR-804, AND IT REPLACES `settleAttempt`/`beginAttempt`.**
 *
 * The old shape was count → sleep → record. Requests arriving together all read the same
 * pre-burst count, all found themselves inside the allowance, and all passed — because not one of
 * them had been written down when the others looked. The bound held against a caller who waited
 * for each answer and not at all against one who did not, which is the only caller it existed
 * for. A hundred concurrent requests against a three-attempt allowance were a hundred free
 * attempts.
 *
 * Writing first makes an in-flight request a **committed row with `succeeded = false`**, so every
 * request behind it counts it. No lock, no serialisation, one extra statement — R5 rejected the
 * alternatives explicitly: folding count and insert into a single statement rewrites the query
 * four features rest on, and an advisory lock per key serialises a hot path on two vCPUs.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY REQUEST IS RECORDED, INCLUDING ONES THAT SUCCEED — WHICH IS WHY THIS IS NOT NAMED
 * `recordFailure`.**
 *
 * `succeeded` has a specific meaning to `countFailures`: `false` extends the identifier streak,
 * `true` ends it. The row starts `false` because at the moment it is written **nothing is yet
 * known** about how the request will turn out, and a request whose outcome is unknown must count
 * — otherwise the allowance is spent by anybody willing not to wait for the answer.
 *
 * Actions whose success should end the streak call `settleAttempt` afterwards. Actions whose cost
 * is paid on every request regardless — `export`, `avatar_upload`, verification resend, and every
 * per-actor cap added since 007 — simply do not, which is the same policy `beginAttempt` used to
 * carry as a name. Spelling it as "begin, and optionally settle" rather than as a boolean is the
 * point: somebody "fixing" a literal cannot silently make three limits unreachable.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Never receives the submitted credential** — there is no parameter for one, which is how
 * FR-031c is guaranteed rather than remembered.
 */
export const beginAttempt = async ({
  identifierHash,
  sourceHash,
  action,
}: ActionKey): Promise<AttemptId> => {
  const [row] = await getDb()
    .insert(signInAttempts)
    .values({ identifierHash, sourceHash, action, succeeded: false })
    .returning({ id: signInAttempts.id })

  // `RETURNING` on a single-row insert cannot come back empty; the assertion is here because the
  // id is what every judgement below is ordered against, and a silent `undefined` would make the
  // exclusion boundary vanish rather than fail.
  if (!row) throw new Error('Could not record a throttle attempt.')
  return row.id
}

/**
 * T017 (010) — settles the outcome of a row `beginAttempt` created.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **CALLED ONLY ON SUCCESS, AND ONLY BY ACTIONS WHOSE SUCCESS ENDS A STREAK.**
 *
 * A failure needs no call at all: the row already says `succeeded = false`, which is what makes
 * the failure path one statement rather than two and what keeps a crashed handler counting
 * against the caller rather than for them.
 *
 * Without this, the rework would be a silent lockout. Every request writes `false` first, so an
 * action that never settled would count its own successes as failures and escalate against
 * attendees doing nothing wrong — the identifier dimension is a streak precisely so that somebody
 * who mistypes three times and then gets in does not carry those failures forward.
 *
 * **The window between the two writes is deliberate and is the burst bound working.** A concurrent
 * request that reads this row before it settles counts it as a failure. That is the conservative
 * direction: it can only ever slow the caller down, never admit one it should have delayed. A
 * process that dies in that window leaves one spurious failure behind, which the two-hour sweep
 * clears (FR-382).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const settleAttempt = async (id: AttemptId, succeeded: boolean): Promise<void> => {
  // A no-op for the failure case rather than a redundant `UPDATE … SET succeeded = false`, so the
  // failure path costs exactly one statement.
  if (!succeeded) return
  await getDb().update(signInAttempts).set({ succeeded }).where(eq(signInAttempts.id, id))
}

interface FailureStreak {
  readonly count: number
  /**
   * T022 (010) — **how long ago the most recent failure happened, in milliseconds, as measured
   * by the database** (FR-811). Undefined when there is no streak.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **AN ELAPSED DURATION RATHER THAN AN INSTANT, AND THAT IS THE FIX RATHER THAN A DETAIL.**
   *
   * This was `lastFailureAt: Date`, subtracted from `Date.now()` in `outstandingDelay`. That
   * subtraction — the one thing standing between a delay and a lockout — compared a **PostgreSQL**
   * timestamp against **Node's** clock, in two containers with nothing keeping them together.
   *
   * The first attempt at fixing it carried the database's `now()` alongside the row and
   * subtracted the two in JavaScript. That was still wrong in a way worth recording: `sql<Date>`
   * is an assertion to the type checker and not a conversion, so `now()` arrived as a **string**
   * and `.getTime()` threw on every throttled request. Twenty-four integration tests caught it
   * immediately — every one of them by way of a 500 rather than a wrong delay, which is the
   * loud failure mode and the lucky one.
   *
   * Asking the database for the *difference* removes both problems at once: there is one clock
   * because only one machine ever reads a clock, and there is no date to parse because the value
   * that crosses the boundary is a number.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly lastFailureAgeMs: number | undefined
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
  before: AttemptId | undefined,
): Promise<FailureStreak> => {
  const rows = await getDb()
    .select({
      succeeded: signInAttempts.succeeded,
      // T022 (010) — the age of this row in milliseconds, computed by the machine that stamped
      // it (FR-811). `::float8` rather than the numeric `extract` returns, because postgres.js
      // hands `numeric` back as a **string** to preserve precision — the same class of mistake
      // that made `sql<Date>\`now()\`` throw, and the reason this is cast rather than trusted.
      ageMs: sql<number>`(extract(epoch from (now() - ${signInAttempts.occurredAt})) * 1000)::float8`,
    })
    .from(signInAttempts)
    .where(
      and(
        eq(signInAttempts.action, action),
        eq(column, value),
        sql`${signInAttempts.occurredAt} >= now() - ${WINDOW}`,
        // ─────────────────────────────────────────────────────────────────────────────────
        // **THE EXCLUSION THAT KEEPS FR-805 TRUE, AND IT IS THE SUBTLEST LINE IN THE FILE.**
        //
        // T017 moved the write ahead of the judgement. Counting every row would therefore
        // include the caller's own, shifting every allowance one attempt earlier — an
        // off-by-one applied to all sixteen actions at once, invisible in review, and exactly
        // what FR-805 forbids ("MUST NOT alter the observable allowance of any existing
        // action").
        //
        // So a request judges itself against the arrivals **strictly ahead of it**. Ordering by
        // the sequence rather than the timestamp is deliberate: concurrent inserts routinely
        // share a `now()`, and a timestamp comparison would count a sibling as a predecessor or
        // not depending on microseconds.
        //
        // `sign-in.ts` passes nothing, and that is not an oversight — it has recorded before
        // evaluating since 001, so counting its own row is the behaviour FR-307a requires to be
        // unchanged. See the call in that file.
        // ─────────────────────────────────────────────────────────────────────────────────
        before === undefined ? undefined : lt(signInAttempts.id, before),
      ),
    )
    // `id` breaks ties: `occurred_at` alone is not a total order once requests arrive together,
    // and the identifier dimension stops at the first success it meets while scanning backwards.
    .orderBy(desc(signInAttempts.occurredAt), desc(signInAttempts.id))
    .limit(ATTEMPT_SCAN_LIMIT)

  let count = 0
  let lastFailureAgeMs: number | undefined

  for (const row of rows) {
    if (row.succeeded) {
      if (resetOnSuccess) break
      continue
    }
    // Rows arrive newest first, so the first failure met is the most recent one.
    lastFailureAgeMs ??= row.ageMs
    count += 1
  }

  return { count, lastFailureAgeMs }
}

/**
 * Exponential escalation, clamped. The clamp is what keeps FR-031b true.
 *
 * **Exported for `tests/unit/throttle-thresholds.test.ts` and for nothing else** (010 T019).
 * SC-808 asks for a *progressive* delay, and progression is a property of this curve rather than
 * of any one action. It cannot be observed through `failureDelayMs` for a delay-only action,
 * because that clamps its result to what is servable — which is the mechanism that makes a
 * denial unrepresentable, and which the integration harness sets to 20ms so the suite does not
 * spend minutes asleep. Asserting the curve directly is what is left, and it is the honest place.
 */
export const delayFor = (failures: number, freeAttempts: number, ceilingMs: number): number => {
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
  if (required === 0 || streak.lastFailureAgeMs === undefined) return 0

  // T022 (010) — the wait is measured by PostgreSQL, which is also what stamped the row (FR-811).
  // Subtracting a Node timestamp here made this depend on the drift between two containers, and
  // drift in the forgiving direction quietly subtracted a delay that was never served.
  return Math.max(0, required - streak.lastFailureAgeMs)
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
export const failureDelayMs = async (
  { identifierHash, sourceHash, action }: ActionKey,
  /**
   * T017 (010) — the row this request wrote, from `beginAttempt`.
   *
   * Rows strictly older than it are counted; its own is not. **Omitting it counts everything,
   * including the caller's own row** — which is `sign-in.ts`'s behaviour since 001 and must stay
   * that way (FR-307a, FR-805). Every other call site passes it. See `countFailures`.
   */
  before?: AttemptId,
): Promise<number> => {
  const thresholds = THRESHOLDS[action]

  const [identifier, source] = await Promise.all([
    countFailures(
      signInAttempts.identifierHash,
      identifierHash,
      action,
      { resetOnSuccess: true },
      before,
    ),
    countFailures(signInAttempts.sourceHash, sourceHash, action, { resetOnSuccess: false }, before),
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
