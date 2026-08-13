import { OfflineError } from '@mynet/data'
import { Link } from 'react-router'

/**
 * T039b (008) — **the failure-state contract for this whole feature, established once**
 * (FR-657).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A CONNECTIVITY FAILURE MUST BE DISTINGUISHABLE FROM A FAULT ON OUR SIDE, AND THE ONLY WAY
 * THAT SURVIVES THREE SURFACES IS TO SAY IT IN ONE PLACE.**
 *
 * FR-657 applies to the contacts list (T060), the appointments view (T106) and Home's summary
 * card (T113). Three components each writing their own wording is three chances for one of them
 * to render "something went wrong" at somebody sitting in a conference basement with no signal —
 * which sends them to check their account instead of walking upstairs.
 *
 * 006 established the two-shape split for the directory and 007 repeated it. This is the same
 * contract expressed as shared components rather than as a convention three files remember, and
 * `classify` below is the half that matters: the *decision* about which shape to render is made
 * once, from the error type, rather than by three separate `instanceof` checks that could drift.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The two shapes differ in what they promise, not merely in colour.**
 *
 * - **Offline** is a `status` region in warning tones. It says a connection is needed and — where
 *   true — that nothing is stored to show instead. It is not an alert: being offline is a
 *   condition, not an error, and announcing it assertively interrupts for something the attendee
 *   probably already knows.
 * - **Failed** is an `alert` in danger tones. It says the fault is ours, explicitly *not* the
 *   reader's account or connection, because the most expensive wrong conclusion here is somebody
 *   deciding their account is broken.
 *
 * Both always offer a retry: a failure the attendee can do nothing about is a dead end, and
 * FR-059 requires an error to say what to do next.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Which shape an error takes. One decision, made from the error type.
 *
 * `OfflineError` is raised by `HttpClient` when the transport could not reach MyNet at all — the
 * same signal the offline banner runs on, so the two cannot disagree about whether the attendee
 * is connected.
 */
export const classify = (error: unknown): 'offline' | 'failed' =>
  error instanceof OfflineError ? 'offline' : 'failed'

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
    {children}
  </div>
)

/**
 * Offline.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE EXPLANATION IS A PROP, BECAUSE THE TWO SURFACES USING THIS ARE OFFLINE FOR OPPOSITE
 * REASONS.**
 *
 * This originally hard-coded the contacts wording — *"nothing is stored on this device… a contact
 * shows the person as they are today"* — and was then rendered by the appointments pane too,
 * where **both halves are false**: appointments are deliberately cached (FR-647), so something
 * *is* stored, and the sentence explained a refusal that does not apply.
 *
 * The two cases are genuinely different and the copy has to say so:
 *
 *   - **Contacts** keep nothing, by decision (FR-648). Both halves matter — a connection is
 *     needed, *and* there is nothing stored — because without the second the reader cannot tell
 *     "wait a moment" from "there is nothing here until you reconnect".
 *   - **Appointments** are cached, so reaching this state means the *first* load has not happened
 *     yet on this device. Home's card already worded it that way; the panes now agree.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const NetworkOffline = ({
  what,
  because,
  onRetry,
}: {
  /** What could not be loaded, in the attendee's terms. "Your contacts", "Your meetings". */
  readonly what: string
  /** Why there is nothing to show instead. See the header — the two callers differ. */
  readonly because: string
  readonly onRetry: () => void
}) => (
  <div
    role="status"
    className="rounded-md border border-warning-500 bg-warning-100 px-4 py-3 text-sm text-warning-700"
  >
    <p className="mb-2">
      {what} needs a connection, and there is not one right now. {because}
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-11 rounded-sm border border-warning-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)

/**
 * A fault on our side, worded so it is not mistaken for the offline state above (FR-657) and not
 * mistaken for a problem with the reader's account.
 */
export const NetworkFailed = ({
  what,
  onRetry,
}: {
  readonly what: string
  readonly onRetry: () => void
}) => (
  <div
    role="alert"
    className="rounded-md border border-danger-500 bg-danger-100 px-4 py-3 text-sm text-danger-700"
  >
    <p className="mb-2">
      {what} could not be loaded. This is a problem on our side, not with your account or your
      connection.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-11 rounded-sm border border-danger-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)

/**
 * T060 — the contacts empty state (FR-617).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IT OFFERS A ROUTE TO DISCOVER, BECAUSE THAT IS THE ONLY WAY A CONTACT COMES TO EXIST.**
 *
 * A contact is somebody whose card you hold (constitution v3.2.0, N1), and cards are shared from
 * a profile in Discover. So "you have not met anybody yet" has exactly one next step, and an
 * empty state that merely described the emptiness would leave the reader to find it.
 *
 * This is also the **first** thing a new account sees in Network — nothing here is seeded, by
 * design — which is what makes it worth more than a grey sentence.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T042 (016) — THE SECOND SENTENCE USED TO ASK THE READER TO WAIT** (FR-1021, FR-1052).
 *
 * It read *"theirs will arrive here when they share back"*, which was the one-directional model
 * constitution **v5.0.0 (C1)** retracts. Under mutual exchange there is nothing to wait for:
 * one act writes both rows (FR-1022), so the contact appears on the reader's next visit here
 * and the instruction was telling them to expect a step that no longer exists.
 *
 * The next step it offers is unchanged — Discover — because that is still the only place a
 * relationship starts. What changed is that the step **completes** the relationship rather than
 * opening half of one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const NoContacts = () => (
  <Panel>
    <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
      Your contacts will appear here
    </h2>
    <p className="mb-4 text-sm text-text-body">
      Sharing a card is an exchange: share yours with someone and you each hold the other&apos;s.
      Find people at your conference in Discover, share your card, and they will appear here.
    </p>
    <Link
      to="/discover"
      className="inline-flex min-h-11 items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
    >
      Find people to meet
    </Link>
  </Panel>
)

/**
 * T106 — the appointments empty state.
 *
 * Scoped to the active conference, and says so: an attendee with meetings at another conference
 * would otherwise read this as having none at all. Appointments are per-event (standing decision
 * 7), and this sentence is where that becomes visible rather than merely true.
 */
export const NoAppointments = ({ eventName }: { readonly eventName: string | null }) => (
  <Panel>
    <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
      No meetings arranged yet
    </h2>
    <p className="text-sm text-text-body">
      {eventName
        ? `You have no meetings at ${eventName}. Open a contact to propose a time — they choose whether it happens.`
        : 'You have no meetings arranged. Open a contact to propose a time — they choose whether it happens.'}
    </p>
  </Panel>
)

/**
 * The reader has joined no conference.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Only the appointments half needs this, and the asymmetry is the feature in one sentence.**
 *
 * Contacts are cross-event: somebody who has joined nothing today can still hold cards from a
 * conference last year, and they must still see them (FR-614). Appointments are per-event, so
 * with no active conference there is no set of meetings to show — not an empty one, none.
 *
 * Rendering it as an empty list would be the same lie 006's `NoConference` exists to avoid:
 * telling somebody with a perfectly healthy account that they have nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const NoConferenceForMeetings = () => (
  <Panel>
    <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
      Join a conference to arrange meetings
    </h2>
    <p className="mb-4 text-sm text-text-body">
      A meeting is a time and a place at one conference, so there is nowhere to arrange one until
      you have joined. Your contacts stay with you either way — they are listed under Contacts.
    </p>
    <Link
      to="/join"
      className="inline-flex min-h-11 items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
    >
      Join a conference
    </Link>
  </Panel>
)
