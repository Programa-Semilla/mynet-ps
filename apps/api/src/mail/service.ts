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
}
