/**
 * T021 (007) — refusing contact, and reporting conduct (FR-534–FR-549).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS THE ACTING ATTENDEE'S IDENTIFIER** (FR-525). The blocker and the
 * reporter are always the signed-in attendee, decided at the request boundary. The identifiers
 * these methods do take name the **target** — the same narrowing exception `messages.ts`,
 * `directory.ts` and 004 before them recorded.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Cross-event, both domains, and neither is a default** (standing decision 7). A block
 * refuses *contact*, and contact is cross-event — a block that lapsed on switching conference
 * would not be a block. A report concerns conduct, not a conference.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Nothing here is cached** (FR-563), declared at the composition root. A block must take
 * effect on the very next request (SC-506); age is the wrong clock for it, for exactly the
 * reason 006 refused to cache the directory.
 */

/**
 * Somebody this attendee has blocked, as the management list renders them (FR-541).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is the one place in the feature that discloses a profile detail outside a
 * conversation**, and the disclosure is bounded rather than incidental: the caller already
 * knows exactly who these people are, having blocked them by hand, and a list of opaque
 * identifiers would be unusable for the single action it exists to support.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Served to the block's owner only. There is no route, and no field anywhere, by which a
 * blocked attendee learns they were blocked (FR-537).
 */
export interface BlockedAttendee {
  readonly attendeeId: string
  readonly displayName: string
  /** A `data:` URL or `null`, converted at the transport boundary as everywhere else. */
  readonly avatar: string | null
  readonly blockedAt: string
}

/** What a report says. Assembled by the report dialog, and never read back (see below). */
export interface AbuseReportDraft {
  /** The attendee being reported. */
  readonly attendeeId: string
  /**
   * Why, in the reporter's own words. Non-empty — the dialog disables its confirmation while
   * this is blank (FR-546), so the server's refusal is a backstop.
   *
   * **Never leaves the database.** The operator mail carries identifiers and a timestamp only
   * (research R11).
   */
  readonly reason: string
  /** The messages being reported, if any. May be empty. */
  readonly messageIds: readonly string[]
  /**
   * 009 (FR-781, FR-783) — the audience questions being reported, if any. May be empty.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Optional, so every existing caller is unchanged.** 007's thread reports carry messages and
   * no questions; Q&A reports carry questions and no messages. Both are the same act against the
   * same route, which is what makes reporting from a question possible **without opening a
   * conversation first** — the whole point of FR-781.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly questionIds?: readonly string[]
}

/**
 * Refusing contact. Every method is **idempotent**, so a double-tap on a confirmation cannot
 * produce an error the attendee has to interpret.
 */
export interface BlockRepository {
  /**
   * Everyone this attendee has blocked (FR-541).
   *
   * An empty array is not an error — it is the "you have not blocked anyone" state FR-541a
   * declares, and the caller renders it as such.
   */
  list(): Promise<BlockedAttendee[]>

  /**
   * Block an attendee.
   *
   * **Deletes nothing** (FR-538). The blocker keeps every message either of them sent; blocking
   * refuses future contact and rewrites no history. Unblocking restores sending with nothing
   * lost.
   *
   * Takes effect immediately (SC-506): the next send by the blocked attendee is refused whether
   * or not they have the thread open.
   */
  block(attendeeId: string): Promise<void>

  /**
   * Unblock. **Directional** (FR-540) — this releases only the caller's block. If the other
   * attendee also blocks the caller, that row is untouched, and the caller is not told it
   * exists.
   */
  unblock(attendeeId: string): Promise<void>
}

/**
 * Reporting conduct out of the product.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WRITE ONLY. THERE IS NO READ METHOD, AND ITS ABSENCE IS THE REQUIREMENT** (FR-548,
 * SC-508).
 *
 * Not "no read method yet" and not "a read method a later feature will add" — none, ever.
 * Principle III puts organizer administration out of scope, and a screen that reads reports is
 * organizer administration whoever it is shown to. There is no `GET /reports`, no report
 * identifier returned to quote, no status to poll, and no privileged role that could see one.
 * A reviewer looking for the missing half of this feature should find nothing, and finding
 * nothing is the pass condition.
 *
 * `apps/api/tests/unit/no-report-read-surface.test.ts` is what stops the absence eroding: an
 * absence with no test is a gap somebody eventually fills in good faith.
 *
 * The durable record of a report is **the operator's mail**, not the row — which is why the row
 * cascades from both attendees and is swept after 90 days (research R3).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface ReportRepository {
  /**
   * File a report. **Three things happen server-side, in this order, and the order is the
   * requirement**: the reported attendee is blocked (FR-544), the row is written, and operator
   * mail is dispatched (FR-547). The attendee's protection lands first.
   *
   * **Resolves even when mail dispatch fails** (FR-549). Safety must not depend on an external
   * service succeeding, and an unprovisioned mail provider is the expected state rather than an
   * exceptional one.
   *
   * Resolves to `void` deliberately: there is nothing the product can honestly say about what
   * happens next. Returning a case identifier would promise a review surface FR-548 forbids
   * building.
   */
  submit(report: AbuseReportDraft): Promise<void>
}
