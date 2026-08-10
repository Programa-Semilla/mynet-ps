import { bigserial, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * T023 — throttling and attack detection (FR-031a, FR-031c).
 *
 * **No foreign key to `attendees`, deliberately.** An attempt must be recorded even when the
 * identifier belongs to nobody — an attacker enumerating addresses is invisible otherwise, and
 * those are the attempts that matter most (data-model.md).
 *
 * **Hashes, not values.** Storing raw email addresses that were merely *typed at* the service
 * would accumulate personal data about people who may not even be attendees. A keyed hash
 * preserves the ability to count per identifier while holding no readable address. The same
 * applies to the request source. This is FR-042 and Principle VIII applied to a table that
 * exists purely for defence.
 *
 * **No credential material, ever** (FR-031c). There is no column here that could hold one, so
 * this is not a rule anyone has to remember.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **RETENTION (004): this table is the one personal-data record NO CASCADE CAN REACH, and
 * that is by design rather than by omission** (FR-370, FR-382, research D10).
 *
 * It has no foreign key, so deleting an attendee does not touch it — and deleting a departing
 * attendee's rows *deliberately does not happen*, because it would hand an attacker a way to
 * clear their own trail by registering an account and deleting it.
 *
 * It expires instead, on the hourly sweep in `maintenance.ts`, after **two hours** — the
 * throttle's one-hour counting window plus margin. **FR-382 forbids lengthening that window.**
 * An earlier draft of the 004 specification assumed 90 days and assumed nothing swept; both
 * were wrong about code that has run since 001, and implementing it as written would have
 * retained keyed hashes of every address ever typed at this service — including addresses
 * belonging to people who are not attendees — forty times longer, for no purpose any
 * requirement names.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * T007 (004) — the throttled actions, each counted separately (FR-307a, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SEPARATE COUNTERS ARE WHAT STOP THIS FEATURE REINTRODUCING THE LOCKOUT 001 ELIMINATED.**
 *
 * 001 built this defence for one action, and its no-lockout guarantee rests on verifying the
 * credential *before* consulting the throttle — so a correct password is never refused,
 * however many failures precede it. Three of the four actions below have no credential to
 * verify first, so the throttle must gate them, and that mechanism does not transfer.
 *
 * Sharing one counter across all four would be the lockout in a new place: a sign-up storm
 * aimed at an address would inflate that address's failure streak and slow its rightful
 * owner's **sign-ins**. The source dimension would be worse still, because a source count
 * deliberately does not reset on success.
 *
 * So every count filters on this column. Exhausting one action's allowance cannot consume
 * another's, and **the existing sign-in behaviour is unchanged by this feature** — which is
 * itself a requirement (FR-307a), not merely a nice property.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const THROTTLE_ACTIONS = [
  'sign_in',
  'sign_up',
  'join_code',
  'reset_request',
  // 004 — FR-379. Added as a fifth rather than folded into an existing counter, for the reason
  // the other four exist: an export storm must not slow anybody's sign-in, and no column change
  // is needed to add one, which is what makes a separate counter the cheap option rather than
  // the careful one.
  'export',

  // 004 — FR-387. The requirement names four unauthenticated routes that MUST each be rate
  // limited: sign-up, verification, reset request, and **reset completion**. Sign-up and reset
  // request are counted above; these two are the other half, and each gets its own counter for
  // the same reason as the rest.
  //
  // Both are keyed on the *submitted token*, never on an address — which is what makes
  // `mayDeny: true` safe here where it is not for `reset_request`. A denial keyed on a token
  // can only ever fall on somebody holding that token, so there is no victim to harm by
  // refusing; the identifier-keyed denial FR-331 forbids is not reachable from this key.
  'verify_token',
  'reset_submit',

  // 004 — FR-347/FR-348. Authenticated, so the identifier is the uploader themselves. This is
  // the most CPU- and memory-expensive request the product serves: it decodes a full raster,
  // runs an entropy analysis to pick the crop, and re-encodes. `limitInputPixels` bounds one
  // upload; this bounds how many of them one account can ask for.
  'avatar_upload',

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 007 — FR-511a and FR-504a. **Two actions rather than one, and they disagree about denial**
  // (research R5). Both are authenticated and keyed on the acting attendee, so a denial can
  // only ever fall on the actor; what differs is whether a denial is the right answer at all.
  //
  // Separate counters for the reason every entry above is separate: a send storm must not
  // consume the allowance that bounds how many strangers one account can contact, and the
  // reverse — the abuse FR-504a actually names — must not be paid for out of a busy
  // conversation's send budget.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'message_send',
  'conversation_create',
] as const

export type ThrottleAction = (typeof THROTTLE_ACTIONS)[number]

export const signInAttempts = pgTable(
  'sign_in_attempts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),

    /** Keyed hash of the normalised email. Never the address itself. */
    identifierHash: text('identifier_hash').notNull(),

    /**
     * Keyed hash of the request source. Source thresholds are set an order of magnitude above
     * identifier thresholds, because a conference venue puts hundreds of legitimate attendees
     * behind one public address — the edge case the spec names explicitly (research.md D9).
     */
    sourceHash: text('source_hash').notNull(),

    /**
     * T007 (004) — which action this attempt was (FR-307a). See `THROTTLE_ACTIONS` above.
     *
     * **No default, deliberately.** The migration adds it with a temporary `'sign_in'` default
     * so existing rows stay valid — which is what they are, every one of them predating the
     * other three actions — and **drops that default in the same migration**. A column that
     * keeps a silent default is how an unattributed attempt ships unnoticed, and here an
     * unattributed attempt is one counted against the wrong action.
     */
    action: text('action').$type<ThrottleAction>().notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    succeeded: boolean('succeeded').notNull(),
  },
  (table) => [
    /**
     * Counted over a rolling window, separately by each dimension (FR-031a) **and separately
     * by action** (FR-307a).
     *
     * `action` leads both indexes because every count now filters on it first: an index led by
     * the hash would still be a scan over three actions' rows to answer a question about one.
     * The names are unchanged so the migration alters the existing indexes rather than
     * accumulating a second pair beside them.
     */
    index('sign_in_attempts_identifier_idx').on(
      table.action,
      table.identifierHash,
      table.occurredAt,
    ),
    index('sign_in_attempts_source_idx').on(table.action, table.sourceHash, table.occurredAt),
  ],
)

export type SignInAttempt = typeof signInAttempts.$inferSelect
export type NewSignInAttempt = typeof signInAttempts.$inferInsert
