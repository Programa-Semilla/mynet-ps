/**
 * T027 (009) — audience questions on a session, in domain terms (Principle V, FR-741).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY.**
 *
 * Identity comes from the sign-in session at the request boundary and never from an argument.
 * That absence is what makes the scoping structural rather than a rule every caller has to
 * remember: there is no expression a component author could write that votes as somebody else or
 * withdraws another attendee's question, because there is no parameter in which to name them.
 *
 * The `eventId` these methods do take is the same deliberate exception 002 recorded for the
 * catalog and 005 for the agenda: an event identifier says *which conference*, never *which
 * person*, and the server verifies the registration before any read or write.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`eventId` IS THE FIRST ARGUMENT OF EVERY METHOD, MIRRORING THE ADDRESSES** (research R12).
 *
 * Every route in this feature nests under `/events/:eventId/…`, including the three that could
 * find their question without it. That is not a stylistic choice — `event-scope-audit` examines a
 * route only if it names an event and **reports success otherwise**, so the naming is what keeps
 * these routes inside the guarantee that already exists. This interface mirrors it so a reader
 * moving between the two cannot conclude that one of them is optional.
 *
 * Contrast `CardRepository`, which takes no `eventId` **at all** because a held card is
 * cross-event. The two interfaces disagree deliberately, and each says so.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is a separate interface from `CatalogRepository`, and that separation is a requirement
 * rather than a preference** (FR-710, FR-772).
 *
 * The catalog is seeded conference content and is read-only **in perpetuity**, because a catalog
 * write is organizer administration and Principle III puts that out of scope. A question is
 * *attendee state about conference content* — the attendee owns it outright — so it belongs
 * here, exactly as saved sessions and notes do. If you are reading this because adding
 * `askQuestion` to `CatalogRepository` looked like the natural home, that is the mistake this
 * note and `apps/api/tests/unit/catalog-read-only.test.ts` exist to catch.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * One question on a session, as one particular reader sees it.
 *
 * **Every field but `votedByMe` and `canWithdraw` is the same for everybody**; those two are the
 * reader's own state, and they are the only personalisation in the shape.
 */
export interface QuestionListItem {
  readonly id: string
  readonly body: string
  /** An absolute instant, ISO-8601, as everywhere else in this product (FR-124). */
  readonly askedAt: string
  readonly authorId: string
  /**
   * The author's display name, present for **every** question (FR-734).
   *
   * Including one asked by an attendee who has turned discoverability off — attribution has no
   * opt-out, which is the exception constitution v3.3.0 records. Opening that author's profile
   * still refuses, from the existing profile route, unchanged (FR-736): the name here is
   * attribution, not a route into anything.
   */
  readonly authorDisplayName: string
  /** Computed server-side at read time. Never stored, and never recomputed on the client. */
  readonly votes: number
  /**
   * Whether **the reader** has upvoted this. There is no field naming any other voter, and no
   * method that could return one (FR-721, FR-769).
   */
  readonly votedByMe: boolean
  /**
   * Whether the reader may withdraw this — `author === reader && votes === 0`.
   *
   * Sent by the server rather than derived here, so the control's absence and the server's
   * refusal cannot disagree (FR-713). It is **not** the enforcement: that lives in the withdrawal
   * handler and is re-checked inside the deleting transaction (FR-714, FR-715).
   */
  readonly canWithdraw: boolean
}

/**
 * A session's audience questions, and the upvotes that rank them.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY WRITE RETURNS THE FULL RE-ORDERED LIST, AND THAT IS THE INTERFACE'S CENTRAL
 * DECISION** (research R5).
 *
 * A method resolving to `void` would leave the caller to re-read, which costs a second round
 * trip in which the count can change again — and the second answer is what the attendee would
 * see flicker into place. Returning the list satisfies three requirements at once: the reader's
 * own action appears immediately (FR-730), the order is the server's rather than a client
 * re-sort that could drift from the tiebreak (FR-726), and the list arrives whole so React can
 * keep a moving row's control focused instead of unmounting it (FR-780).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing here is cached** (FR-754), and the refusal is declared at the composition root
 * beside the member rather than achieved by leaving a line out. Every write is refused offline
 * and **never queued** (FR-758).
 */
export interface QuestionsRepository {
  /**
   * Every question on a session, ordered by votes descending then ask time ascending.
   *
   * A session nobody has asked about yields an **empty array**, not an error — a valid answer the
   * caller renders as an invitation to ask the first question (FR-727).
   */
  list(eventId: string, sessionId: string): Promise<QuestionListItem[]>

  /**
   * Ask a question, 1–500 characters after trimming.
   *
   * The limit is enforced server-side and again at the column; the composer disables its post
   * control while the field is empty or whitespace and shows the remaining allowance before the
   * limit is reached, so the attendee never learns of it through a rejected write (FR-704,
   * FR-706).
   */
  ask(eventId: string, sessionId: string, body: string): Promise<QuestionListItem[]>

  /**
   * Withdraw your own question, while nobody has upvoted it (FR-712).
   *
   * Rejects with a refusal carrying `code: 'question_has_votes'` once a vote exists — one of only
   * two refusals in this feature that explain themselves, and safe because it describes the
   * reader's own question to the reader.
   */
  withdraw(eventId: string, questionId: string): Promise<QuestionListItem[]>

  /**
   * Upvote somebody else's question. **Idempotent** (FR-718) — a double-tap is the same request
   * twice, and no repetition can inflate a count.
   *
   * Rejects with `code: 'own_question'` when the caller wrote it (FR-722).
   */
  vote(eventId: string, questionId: string): Promise<QuestionListItem[]>

  /** Take your upvote back. **Idempotent** — succeeds whether or not one existed (FR-719). */
  unvote(eventId: string, questionId: string): Promise<QuestionListItem[]>
}
