/**
 * T018 (004) — the transactional account mail port (FR-394, FR-395).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS INTERFACE CANNOT CARRY AN ENGAGEMENT NOTIFICATION, AND THAT IS ITS SHAPE'S JOB.**
 *
 * Constitution and CLAUDE.md both keep engagement notifications out of product scope; v2.3.0
 * brought **transactional account mail** in, and nothing else. The boundary between the two is
 * easy to state and easy to erode — one `send(to, subject, body)` method and the exclusion
 * becomes a convention that the next feature can breach without editing this file.
 *
 * So there is no generic send. There are exactly two methods, one per message this product is
 * permitted to send, and each takes only the address and the link. **A caller cannot choose a
 * subject, cannot choose a body, and cannot add a third message without changing this
 * interface** — which is precisely the review FR-395 is asking for. The prototype's
 * notification bell stays forbidden, and so does everything behind it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **No provider is chosen** — register entry 18, and the one open dependency capable of making
 * a shipped surface non-functional rather than merely unproven. FR-318a is what keeps that from
 * blocking the feature: a send failure does not fail account creation, because an unprovisioned
 * provider is the *expected* state rather than an exceptional one.
 */
export interface MailService {
  /**
   * FR-318 — sent after the account is committed.
   *
   * **A rejected promise here must not fail account creation** (FR-318a). The caller is
   * responsible for that, because only the caller knows what it is in the middle of; this
   * interface reports failure honestly rather than swallowing it.
   */
  sendVerification(to: string, link: string): Promise<void>

  /**
   * FR-326 — sent in response to a reset request.
   *
   * **Sent only when an account exists**, while the *response* to the request is identical
   * either way (FR-327). That asymmetry is the whole non-disclosure guarantee, and it lives in
   * the caller: this method is simply not invoked when there is nobody to send to.
   */
  sendPasswordReset(to: string, link: string): Promise<void>

  /**
   * T079 (007) — **the third method, and the deliberate act this interface was shaped to force**
   * (FR-547, research R11).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THE GUARD ABOVE WORKED. THIS IS NOT A BREACH OF IT, AND THE ARGUMENT IS RECORDED RATHER
   * THAN ASSUMED.**
   *
   * The header says there are exactly two methods *so that adding a third requires editing this
   * file*. That is what happened: 007 needed operator abuse mail, could not express it, and had
   * to come here and make the case. Three things make the case, and all three matter:
   *
   *   1. **It goes to the OPERATOR, not to an attendee.** The exclusion this interface enforces
   *      is on *engagement notifications to users of the product*. This message is addressed to
   *      a person who runs the service and is operational rather than engagement.
   *   2. **It carries identifiers and a timestamp — never the message text, and never the
   *      reason string.** Putting reported content in email would copy two attendees' personal
   *      data into an external provider's systems and into an inbox with its own retention, for
   *      a recipient who can query the database directly. The mail says *a report exists, here
   *      is its identifier*.
   *   3. **There is still no generic `send`.** A fourth message would require editing this file
   *      again, which is the whole mechanism. A `send(to, subject, body)` would have dissolved
   *      the guard entirely, and was rejected for that reason.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * **A rejected promise must not fail the report** (FR-549). The block and the row have already
   * landed by the time this is called, and safety must not depend on an external service
   * succeeding — an unprovisioned provider is the expected state (register entry 18), not an
   * exceptional one. The caller wraps it exactly as verification mail is wrapped.
   */
  sendAbuseReport(
    to: string,
    report: {
      readonly reportId: string
      readonly reportedAt: string
      readonly messageIds: readonly string[]
    },
  ): Promise<void>
}
