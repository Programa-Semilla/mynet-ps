/**
 * Attendee-facing error shapes.
 *
 * FR-059: an attendee-facing error explains what happened and what to do next, and never
 * exposes internal detail, stack traces, or database errors.
 * FR-060: the server records enough to diagnose the failure, with no credentials, session
 * tokens, or message content in the record.
 *
 * Those two pull in opposite directions, so the split is explicit: `publicMessage` goes to
 * the attendee, everything else goes to the log.
 */

export type ErrorCode =
  /** FR-030 — one generic refusal for both "no such identifier" and "wrong credential". */
  | 'invalid_credentials'
  /** FR-031d — throttled, revealing nothing about whether the identifier exists. */
  | 'too_many_attempts'
  /** FR-028c — the session expired through inactivity. Distinguishable from never having signed in. */
  | 'session_expired'
  /** FR-028c — no session at all. */
  | 'not_authenticated'
  | 'not_found'
  | 'validation_failed'
  | 'internal_error'
  /**
   * FR-303 (004) — the address already has an account.
   *
   * **This deliberately discloses registration status**, and the disclosure is a decision taken
   * at the specification review rather than an oversight. Non-disclosure is unachievable
   * alongside FR-306: a new address signs the person in and an existing one does not, so the
   * two outcomes are distinguishable whatever the wording says — a non-disclosure requirement
   * here would have been satisfied on paper and defeated in practice. Enumeration is defended
   * by rate limiting, which is what actually defends it.
   *
   * **The password-reset path keeps its non-disclosure guarantee** (FR-327), where the outcome
   * genuinely is identical either way. Do not copy this reasoning there.
   */
  | 'address_registered'
  /** FR-321, FR-328 (004) — a verification or reset link that is expired, used, or unknown. */
  | 'link_expired'
  /** FR-347 (004) — an image over the stated size limit. */
  | 'image_too_large'
  /** FR-347 (004) — not a decodable image of an accepted type, determined by inspection. */
  | 'image_unreadable'
  /**
   * FR-536, FR-537 (007) — a send that will not be delivered, **with no reason given**.
   *
   * See `contactRefused` below. This code deliberately says nothing about blocks, and the string
   * `block` appears nowhere in the code, the message, or the contract description.
   */
  | 'refused'
  /**
   * FR-574 (007) — the conversation no longer accepts messages because the other participant
   * deleted their account.
   *
   * **Deliberately distinguishable from `refused`.** This is a fact about a conversation the
   * caller can already see and already has every message of; disclosing it discloses nothing
   * about another attendee that the caller cannot observe anyway.
   */
  | 'conversation_closed'
  /**
   * FR-714 (009) — the question now has an upvote, so it can no longer be withdrawn.
   *
   * **Deliberately explained, unlike `refused`**, and it passes the test every explained refusal
   * in this product has to pass: *the follow-up question is about the reader, not about anybody
   * else.* It describes the reader's **own question** to the reader, and the vote count is
   * already on their screen. Nothing about another attendee is disclosed — not who voted, not
   * how many, not when.
   */
  | 'question_has_votes'
  /**
   * FR-722 (009) — the caller is the question's author, so there is no vote of theirs to cast.
   *
   * Explained for the same reason as `question_has_votes`: it describes the reader's own
   * authorship, which they already know. The interface hides the control on the reader's own
   * question (FR-713's shape applied to voting), so reaching this means the control was bypassed.
   */
  | 'own_question'
  /**
   * FR-992 (013) — the administrative credential set by the bootstrap has not been replaced.
   *
   * One of only two 011 refusals that explain themselves. See `credentialNotReplaced` below.
   */
  | 'credential_not_replaced'
  /**
   * FR-945 (013) — another operator has already resolved this report.
   *
   * Produced from a **unique-constraint violation**, not from a read-then-write check. See
   * `reportAlreadyResolved` below and `schema/report-resolutions.ts`.
   */
  | 'report_already_resolved'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly publicMessage: string
  readonly details: Record<string, unknown> | undefined

  constructor(
    code: ErrorCode,
    statusCode: number,
    publicMessage: string,
    details?: Record<string, unknown>,
  ) {
    super(publicMessage)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.publicMessage = publicMessage
    this.details = details
  }
}

/**
 * FR-030 — a **single** refusal for every sign-in failure cause.
 *
 * One factory, so there is no second code path that could accidentally return a different
 * status, body, or wording for "unknown identifier" versus "wrong credential". Producing them
 * from one place is what makes them indistinguishable by construction rather than by careful
 * review of two call sites.
 */
export const invalidCredentials = (): AppError =>
  new AppError(
    'invalid_credentials',
    401,
    'That email and password combination did not match. Check both and try again.',
  )

/**
 * 004 — the noun is a parameter because this is no longer a sign-in-only refusal (FR-059).
 *
 * 001 had one caller and could name it in the string. The per-action counters (FR-307a) gave it
 * seven, and telling somebody who mistyped a join code that they have made too many *sign-in*
 * attempts sends them to solve a problem they do not have. The counters were separated; the
 * wording has to follow them.
 *
 * The `code` and `statusCode` are identical for every action on purpose — the refusal's shape is
 * what a throttling probe can observe, and only the attendee-facing sentence varies.
 */
export const tooManyAttempts = (retryAfterSeconds: number, what = 'sign-in attempts'): AppError =>
  new AppError(
    'too_many_attempts',
    429,
    `Too many ${what}. Try again in ${retryAfterSeconds} seconds.`,
    { retryAfterSeconds },
  )

export const sessionExpired = (): AppError =>
  new AppError(
    'session_expired',
    401,
    'You were signed out after a period of inactivity. Sign in again to continue.',
  )

export const notAuthenticated = (): AppError =>
  new AppError('not_authenticated', 401, 'Sign in to continue.')

/**
 * FR-036 — refuse without disclosing whether the record exists.
 *
 * Deliberately identical whether the row is absent or belongs to someone else. A 403 for
 * "exists but not yours" and a 404 for "does not exist" would let an attacker enumerate other
 * attendees' records by watching which status came back.
 */
export const notFound = (): AppError => new AppError('not_found', 404, 'That is not available.')

/**
 * FR-303 (004) — the address already has an account.
 *
 * The wording offers both exits, because being told "already registered" and left there is a
 * dead end for the two people who see it: the person who forgot they had an account, and the
 * person whose address somebody else used.
 */
export const addressRegistered = (): AppError =>
  new AppError(
    'address_registered',
    409,
    'That email address already has an account. Sign in instead, or reset your password if you have forgotten it.',
  )

/**
 * FR-321, FR-328 (004) — one refusal for a link that no longer works.
 *
 * **Unknown, expired and already-used are deliberately the same**, produced from one factory
 * for the same reason `invalidCredentials` is: two call sites returning "the same" 410 would
 * drift, and a link that reported *which* of the three had happened would let anyone holding a
 * used link learn that it had once been valid.
 */
export const linkExpired = (): AppError =>
  new AppError(
    'link_expired',
    410,
    'That link is no longer valid. Links can be used once, and they expire — request a new one.',
  )

/** FR-347 (004) — refused **before any bytes are stored**, with the limit stated. */
export const imageTooLarge = (maxBytes: number): AppError =>
  new AppError(
    'image_too_large',
    413,
    `That image is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    { maxBytes },
  )

/**
 * FR-347 (004) — not a decodable image of an accepted type.
 *
 * Determined by **inspecting the bytes**, never by the declared content type or the filename,
 * both of which the caller chooses (research D8).
 */
export const imageUnreadable = (): AppError =>
  new AppError(
    'image_unreadable',
    415,
    'That file could not be read as an image. JPEG, PNG, WebP, AVIF and GIF are accepted.',
  )

/**
 * FR-536, FR-537 (007) — **the one refusal for "this message will not be delivered", and it
 * carries no reason.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SILENCE IS THE REQUIREMENT, NOT A LACK OF EFFORT ON THE WORDING.**
 *
 * FR-537 forbids disclosing to a blocked attendee that a block exists. So this says the message
 * did not send and stops — no cause, no "the recipient is unavailable", no hint that anything
 * about the *other person* decided it. A sender who could tell a block from a fault would know
 * they had been blocked, which is exactly the disclosure the requirement closes.
 *
 * **Produced from one factory for the reason `invalidCredentials` is** (FR-030's precedent):
 * two call sites returning "the same" 409 drift, and on the day they do, the difference between
 * them is a signal an attacker reads. There is exactly one 409 shape on this route pair, and
 * both the block path and any future conflict take it.
 *
 * It is deliberately the shape a generic conflict would take, and the contract says so. The
 * blocker's own client already knows — `state: 'blocked'` arrives on the conversation, which is
 * *their* record about *their* choice — so nothing here has to explain anything to the one party
 * entitled to know.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **008 — THE SENTENCE IS A PARAMETER; THE `code` IS NOT.**
 *
 * The reasonless-ness lives in `code: 'refused'` and in the 409 being the shape any conflict on
 * the route would take — not in the wording. 008 refuses a blocked **card share** and a blocked
 * **meeting proposal** through this same factory, and inheriting "that message could not be
 * sent" made the body a false statement about what was attempted, in a response the committed
 * contract also documents.
 *
 * Every caller still produces one indistinguishable shape *per route*, which is what FR-608 and
 * FR-637 actually require: a caller must not be able to tell a block from any other conflict on
 * the route they used. There is no route on which two different sentences can both appear.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const contactRefused = (what = 'That message could not be sent.'): AppError =>
  new AppError('refused', 409, what)

/**
 * FR-574 (007) — the counterpart has deleted their account, so nothing can be sent here again.
 *
 * **Explained, unlike `contactRefused`, and the difference is deliberate** (contract). A caller
 * looking at a one-sided conversation can already see that half of it is gone; being told why
 * the composer is unavailable discloses nothing further, and leaving them to guess would make a
 * permanent state look like a transient failure they should retry.
 *
 * 403 rather than 404: the conversation exists and is the caller's to read. FR-524's
 * indistinguishability is about conversations the caller is *not* in, and this one they are.
 */
export const conversationClosed = (): AppError =>
  new AppError(
    'conversation_closed',
    403,
    'This conversation is closed. The other person has deleted their account, so no new messages can be sent.',
  )

/**
 * FR-714 (009) — withdrawal refused because somebody has upvoted the question.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE OF ONLY TWO REFUSALS IN 009 THAT EXPLAIN THEMSELVES, AND THE WORDING IS THE POINT.**
 *
 * 403 rather than 404: the question exists and is the caller's own. FR-743's indistinguishability
 * is about questions the caller has no business seeing, and this is one they wrote.
 *
 * It says what happened and why it is permanent-ish without describing anybody else — no count,
 * no voter, no timing. "Somebody has upvoted it" is the minimum that makes the refusal
 * actionable; anything more would be a fact about another attendee, which is what
 * `contactRefused` above exists to withhold.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const questionHasVotes = (): AppError =>
  new AppError(
    'question_has_votes',
    403,
    'This question cannot be withdrawn now that somebody has upvoted it. It belongs to the room as well as to you.',
  )

/**
 * FR-722 (009) — the caller is trying to upvote their own question.
 *
 * Explained on the same reasoning as `questionHasVotes`: it is a fact about the reader, held by
 * the reader. The interface omits the control on the reader's own question, so a caller reaching
 * this bypassed the form — the same relationship the note limit and the report reason each have
 * with their own 400.
 */
/**
 * FR-992 (013) — the operator has not yet replaced the credential that was set for them.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE OF ONLY TWO REFUSALS IN 011 THAT EXPLAIN THEMSELVES**, and it passes the test every
 * explained refusal in this product has to pass: **the follow-up question is about the reader.**
 *
 * It describes the reader's own credential to the reader, and it is actionable in one step —
 * the credential-replacement route is the single address this state may reach. Everything else
 * administrative refuses with the indistinguishable 401 or 404, because everything else would
 * be disclosing something about the product to somebody who has not proved they belong in it.
 *
 * 403 rather than 404: the caller holds a valid administrative session and the surface exists.
 * FR-917's indistinguishability is about callers who have proved nothing, and this one has.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const credentialNotReplaced = (): AppError =>
  new AppError(
    'credential_not_replaced',
    403,
    'Replace your initial password before continuing. It was set for you, so it is not yours yet.',
  )

/**
 * FR-945 (013) — a report another operator has already resolved.
 *
 * Explained, for the same reason as `credentialNotReplaced`: it is a fact about the reader's own
 * work — somebody has already dealt with this — and it discloses nothing about any attendee. The
 * 409 comes from a **unique constraint violation** rather than a read-then-write check, which is
 * what makes it a guarantee rather than a narrowed race (see `schema/report-resolutions.ts`).
 */
export const reportAlreadyResolved = (): AppError =>
  new AppError(
    'report_already_resolved',
    409,
    'Another operator has already resolved this report. Reload the queue to see what they decided.',
  )

export const ownQuestion = (): AppError =>
  new AppError(
    'own_question',
    403,
    'You cannot upvote your own question. Asking it is already your vote for it.',
  )
