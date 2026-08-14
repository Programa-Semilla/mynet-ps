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

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 008 — FR-609 and FR-638. **Two more actions, and unlike 007's pair they AGREE about
  // denial** — both `mayDeny: true`, which is the opposite of `message_send` and of
  // `reset_request`.
  //
  // Both are authenticated and keyed on the acting attendee's own identity, so a denial can
  // only ever fall on the person doing the thing. That is the same reasoning `join_code`,
  // `export`, `avatar_upload` and `conversation_create` are configured under, and it is what
  // separates all five from `reset_request`, whose key is a **victim's** address.
  //
  // Separate counters for the reason every entry above is separate: sharing cards at a
  // conference must not consume the allowance that bounds how many meetings one account can
  // propose, and neither may slow anybody's sign-in.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'card_share',
  'appointment_propose',

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 009 — FR-746. **Two actions, both keyed on the acting attendee, and both `mayDeny: true`.**
  //
  // Same reasoning as 008's pair and as `join_code`, `export`, `avatar_upload` and
  // `conversation_create`: these are authenticated, so the identifier is the person doing the
  // thing and a denial can only ever fall on them. That is what separates all of them from
  // `reset_request`, whose key is a **victim's** address.
  //
  // Separate counters for the reason every entry above is separate: an attendee working down a
  // long question list with the upvote control must not consume the allowance that bounds how
  // much free text one account can publish to a whole conference — and neither may slow
  // anybody's sign-in. The two are an order of magnitude apart on purpose; see `THRESHOLDS`.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'question_ask',
  'question_vote',

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 009 — FR-746, and **this one closes a gap 007 left rather than one 009 opens.**
  //
  // Reporting has been unthrottled since it shipped. It is the only action in this product that
  // **dispatches operator mail**, so unlimited reports are unlimited mail to an address a human
  // is supposed to read — a spam vector aimed at the one safety channel the product has, in a
  // product with public self sign-up and no moderator by construction.
  //
  // Blocking is unthrottled by comparison and harmlessly so: it writes a row and tells nobody.
  // Tightest of the three actions 009 adds, because each request leaves the product.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'report_submit',

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 012 — FR-916. **The first entry in this list to arrive at `mayDeny: false` by the SAME
  // reasoning as an existing one rather than a new one** — `reset_request`'s, exactly.
  //
  // Administrative sign-in is unauthenticated and keyed on a **submitted address**, which is
  // the property that separates `reset_request` from every `mayDeny: true` action here: the
  // person a denial falls on is not the person making the requests. An attacker who can lock
  // out an address they do not own has locked out the platform operator — and the operator is
  // the only principal who can read the abuse-report queue or promote anybody.
  //
  // The attendee `sign_in` action IS `mayDeny: true`, and the difference is the population. A
  // denied attendee is one of thousands and recovers by waiting; a denied operator may be the
  // only person who can act on the product at all, and there is nobody to appeal to. So this
  // action **may delay but can never deny**, exactly as FR-331 requires of `reset_request`.
  //
  // Separate from `sign_in` for the reason every entry here is separate: administrative
  // sign-in attempts must not slow any attendee's sign-in, and attendee traffic must not
  // consume the operator's allowance.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'admin_sign_in',

  // 010 — FR-801 and FR-803. **The first READS in this list, and the first two entries that may
  // never deny for a reason neither `reset_request` nor `message_send` gives.**
  //
  // Every action above is a write or a credential submission. These are reads a client issues in
  // volume: the attendee directory, which pages a whole conference, and the message-thread poll,
  // which fires every three seconds while a thread is open. Left unbounded, the frequency of both
  // is entirely client-controlled — and a join code is printed on badges, so "signed in" is not a
  // meaningful barrier to anybody who wants the attendee list.
  //
  // **`mayDeny: false` on both**, because a refusal on either is indistinguishable from the
  // product being broken: Discover never arrives, or a conversation appears to stop updating. The
  // bound makes bulk collection expensive rather than impossible, which is the same trade
  // `reset_request` makes and the only one available when the thing being bounded is also the
  // product's central journey.
  //
  // Separate counters for the reason every entry above is separate: a reader with a thread open
  // must not have their directory browsing slowed by their own poll, which would be a surprising
  // coupling between two unrelated surfaces (research R7).
  //
  // **NO MIGRATION.** `action` is a `text` column carrying a TypeScript union, so adding a member
  // changes types and nothing else — which is what makes FR-890's "no schema change" survivable
  // for a feature that adds two throttled actions.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'directory_read',
  'thread_read',

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 014 — FR-1039. **Five actions, all authenticated against an ADMINISTRATIVE session, and
  // all `mayDeny: true`.**
  //
  // The rule this list runs on is *who a denial falls on*, and every one of these is keyed on
  // the acting operator's own identity — so a refusal can only inconvenience the person
  // authoring. That is the same reasoning `join_code`, `export`, `card_share` and the rest are
  // configured under, and it is what separates all of them from `reset_request` and
  // `admin_sign_in`, whose keys are a submitted address somebody else may own.
  //
  // **Named individually rather than covered by one `authoring` bucket**, which FR-1039
  // requires in those words. Two of them matter for reasons the other three do not have, and a
  // shared counter would let either be spent by the others: `conference_create` is the only
  // product-wide act an organizer holds and nothing else bounds how many conferences they may
  // make (v4.2.0 N3 accepts that as bounded by trust), and `session_cancel` bounds an act that
  // reaches attendees' phones — an unthrottled cancel loop is a push amplifier pointed at every
  // attendee who saved anything.
  //
  // **`session_notify` is a sixth, added by the deep review, and it exists because the sentence
  // above used to say `session_cancel` was the *only* act that reaches a phone.** It is not: a
  // start-time or room change is material too (v4.2.0 N1), and that path is charged
  // `session_write` at twelve times the allowance. Materiality is only knowable after the write,
  // so the **interruption** is bounded on its own rather than the edit being charged the tighter
  // bound — a title edit must not cost what a cancellation costs. Exhausting it skips the push
  // and leaves the act and the in-app marker untouched.
  //
  // **`conference_write` is a seventh, and it is the second finding of the same shape as
  // `session_notify`'s.** `PATCH /admin/conferences/:eventId` was charged `catalog_write` — the
  // bucket named, in its own comment, for "writing tracks, rooms and speakers". It is not one of
  // those: it moves the conference's date range, which is the only write in the feature that can
  // refuse by naming forty sessions, and it is the gate on FR-1015's timezone freeze. Sharing a
  // counter meant a setup burst of rooms and speakers could spend the allowance for editing the
  // conference itself, and `throttle-route-audit.test.ts` now binds each route to its action so a
  // future route cannot rejoin the wrong bucket silently.
  //
  // **NO MIGRATION.** `action` is a `text` column carrying a TypeScript union, so adding
  // members changes types and nothing else — the same note 010 records above.
  // ───────────────────────────────────────────────────────────────────────────────────────
  'conference_create',
  'conference_write',
  'session_write',
  'session_cancel',
  'session_delete',
  'catalog_write',
  'session_notify',
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
