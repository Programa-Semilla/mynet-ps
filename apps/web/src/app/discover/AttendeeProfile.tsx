import { OfflineError, type VisibleProfile } from '@mynet/data'
import { useDirectoryRepository } from '@mynet/platform'
import { CalendarClock, MessageSquare, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'

import { Loading } from '../AsyncState.js'
// 008 — the second action in the row this file declared empty in 006. Imported here rather than
// built here, because Network's contact entries offer the same act and the label is the one
// thing in this feature that must not be written twice (FR-603).
import { ScheduleDialog } from '../network/ScheduleDialog.js'
import { ShareCardAction } from '../network/ShareCardAction.js'
import { AvatarFallback } from '../profile/AvatarFallback.js'
import { availabilityLabelFor, intentLabelFor } from '../profile/labels.js'

/**
 * T086–T089 (006) — a co-attendee's profile (FR-431–FR-434).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **BUILT ON 004'S READ, UNCHANGED, AND THAT IS WHAT MAKES FR-431 TRUE** (research D14).
 *
 * The route this reads applies three conditions in one `WHERE` and answers *not registered*,
 * *does not exist*, *not discoverable* and *not verified* with one identical 404. Reusing it as
 * it stands means this view **inherits** that indistinguishability rather than reproducing it —
 * there is no branch here that could learn which cause applied, because nothing in the process
 * ever computed it.
 *
 * So the refusal below says one thing for all four causes, and it must keep saying one thing. A
 * "this attendee has made themselves private" message would be a leak invented on the client
 * about data the server carefully refused to disclose.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A native `<dialog>` with `showModal()`**, for the reasons 005 recorded at length in
 * `SessionPanel.tsx`: a real focus trap, an inert background and Escape dismissal all come from
 * the platform, and the register lists Escape and visible focus as settled requirements the
 * prototype failed to meet.
 *
 * The two things `<dialog>` does not give are added here as they are there — focus restored to
 * the opener explicitly, and Escape routed to the same close path as the button so the address
 * updates identically however the dialog was dismissed.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The action row is a bounded region features append to — by editing this file.**
 *
 * 006 declared it and left it empty, because FR-434 forbids a dead or permanently-disabled
 * control and none of its actions existed yet. 007 added *Message*; 008 added *Share your card*
 * and *Propose a meeting*. Each edited this file and touched neither the header nor the body,
 * which is what the separation buys.
 *
 * It is **not** a registry, and an earlier version of this paragraph claimed it was. `navigation.ts`
 * and `home/registry.ts` are registries — a feature adds a line and its own file, and this one is
 * not reached at all. Here a feature appends JSX. Saying otherwise set an expectation the next
 * feature would have found unmet.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** What Discover hands down to its nested child route. */
export interface DirectoryOutletContext {
  /**
   * Whether the directory has resolved which conference it is showing.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Carried, rather than inferred from `eventId` being null.** A null identifier means two
   * completely different things — *the active conference has not resolved yet* and *the reader
   * has joined no conference* — and the dialog's answer to each is opposite: wait, or refuse.
   *
   * Inferring it produced exactly the wrong answer on a cold load: the dialog refused with
   * "that attendee is not available to you" for the frame before the conference arrived, which
   * is a refusal the reader can read and act on about an attendee who was perfectly visible.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly resolving: boolean
  /** `null` when the reader has joined no conference — the dialog then has nothing to read. */
  readonly eventId: string | null
  /** Returns focus to the card that opened this (FR-433). */
  readonly restoreFocusTo: (attendeeId: string) => void
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: VisibleProfile; avatar: string | null }
  | { status: 'unavailable' }
  | { status: 'offline' }
  | { status: 'failed' }

export const AttendeeProfile = () => {
  const { attendeeId } = useParams<{ attendeeId: string }>()
  const context = useOutletContext<DirectoryOutletContext>()
  const repository = useDirectoryRepository()
  const navigate = useNavigate()

  const dialogRef = useRef<HTMLDialogElement>(null)
  /** Set once closing has begun, so the effect below cannot re-open the dialog mid-teardown. */
  const closingRef = useRef(false)

  const [state, setState] = useState<ProfileState>({ status: 'loading' })

  const { eventId, resolving } = context

  useEffect(() => {
    // Still working out which conference this is. The dialog waits rather than refusing — a
    // refusal here is one the reader can read and act on about somebody perfectly visible.
    if (resolving) return

    if (!eventId || !attendeeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'unavailable' })
      return
    }

    let cancelled = false

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **The avatar is read separately, and its failure is not the profile's failure.**
     *
     * The listing embeds a 96px card rendition; this view wants the 512px one, which comes from
     * 004's avatar route under the same three conditions. A profile that refused to render
     * because a photograph could not be fetched would be a worse answer than a profile with the
     * non-photographic fallback in it — which is the ordinary state of most attendees anyway.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    repository
      .get(eventId, attendeeId)
      .then(async (profile) => {
        if (cancelled) return
        // `null` covers all four causes indistinguishably. There is nothing here that could
        // tell them apart, and that is the design rather than a limitation.
        if (!profile) {
          setState({ status: 'unavailable' })
          return
        }

        const avatar = profile.hasAvatar
          ? await repository.readAvatar(eventId, attendeeId).catch(() => null)
          : null

        if (!cancelled) setState({ status: 'ready', profile, avatar })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: error instanceof OfflineError ? 'offline' : 'failed' })
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, attendeeId, resolving])

  /**
   * The single close path.
   *
   * **The order of these three steps is load-bearing**, and `SessionPanel.tsx` records why a
   * browser taught it to us: while a dialog is modal everything behind it is *inert*, and an
   * inert element cannot take focus. Restoring focus before closing succeeds silently and leaves
   * a keyboard reader at the top of the document — the exact failure FR-433 exists to prevent.
   */
  const close = useCallback(() => {
    closingRef.current = true

    // Step 1 — leave the top layer, so the directory behind stops being inert.
    dialogRef.current?.close()

    // Step 2 — return focus to the card that opened this (FR-433).
    if (attendeeId) context.restoreFocusTo(attendeeId)

    // Step 3 — the address returns to the directory, which is what unmounts this.
    void navigate('..', { relative: 'path' })
  }, [navigate, context, attendeeId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open || closingRef.current) return

    // `showModal`, never `show`: only the modal form gives the focus trap and the inert
    // background. `show` would render an overlay a Tab could walk straight out of.
    dialog.showModal()
  })

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="attendee-profile-title"
      onCancel={(event) => {
        // Escape reaches the same close path as the button. Prevented so the platform does not
        // close the dialog underneath us while the address still names an attendee — the next
        // render would re-open it.
        event.preventDefault()
        close()
      }}
      /*
        T089 — centred overlay, wider on tablet, **full width on mobile**.

        `max-w-full` is not redundant with `w-full`: the user-agent stylesheet gives `dialog` a
        `max-width: calc(100% - 6px - 2em)`, which at 320px caps this at 282px and produces a
        card floating on a phone with gutters, not the full-width overlay the mobile layout
        declares. A max-width always beats a width. Measured in a browser — jsdom applies no
        user-agent stylesheet, so no component test can see it.
      */
      className="m-auto max-h-[90dvh] w-full max-w-full overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-0 tablet:max-w-lg backdrop:bg-surface-inverse/50"
    >
      <div className="px-4 py-4 tablet:px-6 tablet:py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="attendee-profile-title"
            className="font-display text-xl font-semibold text-text-primary"
          >
            {state.status === 'ready' ? state.profile.displayName : 'Attendee'}
          </h2>

          <button
            type="button"
            onClick={close}
            aria-label="Close profile"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <ProfileBody state={state} />
      </div>
    </dialog>
  )
}

const ProfileBody = ({ state }: { state: ProfileState }): ReactNode => {
  /**
   * 008 — whether the scheduling dialog is open over this profile, and the control that opened
   * it so focus returns there (FR-655).
   *
   * Declared before the early returns below, because hooks must not be conditional. The state is
   * meaningless in every status but `ready`, and unreachable from them — there is no control to
   * press.
   */
  const [scheduling, setScheduling] = useState(false)
  const scheduleOpener = useRef<HTMLButtonElement>(null)

  if (state.status === 'loading') return <Loading label="Loading this profile…" />

  if (state.status === 'offline') {
    return (
      <p role="alert" className="text-sm text-text-body">
        This profile needs a connection, and there is not one right now. Nothing is stored on this
        device to show instead.
      </p>
    )
  }

  if (state.status === 'failed') {
    return (
      <p role="alert" className="text-sm text-text-body">
        This profile could not be loaded. This is a problem on our side, not with your account.
      </p>
    )
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **One wording for all four causes** (FR-431). No conference in common, no such attendee,
   * discoverability off, address unverified — the server answers all four identically, and
   * anything more specific here would be information this client does not have and the server
   * deliberately withheld.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  if (state.status === 'unavailable') {
    return (
      <p role="alert" className="text-sm text-text-body">
        That attendee is not available to you.
      </p>
    )
  }

  const { profile, avatar } = state
  const intent = intentLabelFor(profile.networkingIntent)
  const availability = availabilityLabelFor(profile.availability)

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        {/*
          T088 — the 512px rendition through 004's existing avatar route, with the
          non-photographic fallback.

          **"No avatar" and "not visible to you" are indistinguishable**, and they are so on the
          server: the avatar route re-checks visibility before choosing between a 204 and a 404,
          so both arrive here as `null` and both render the same initials. A client that
          distinguished them would undo the property the server went to trouble to hold.
        */}
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-24 w-24 shrink-0 rounded-full border border-border-subtle object-cover"
          />
        ) : (
          <AvatarFallback displayName={profile.displayName} size="large" />
        )}

        <div className="min-w-0">
          {(profile.role || profile.company) && (
            <p className="text-sm font-medium text-text-primary">
              {[profile.role, profile.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {availability && (
            <p className="mt-1 text-sm text-text-body">
              <span className="font-medium">Availability:</span> {availability}
            </p>
          )}
          {intent && (
            <p className="mt-1 text-sm text-text-body">
              <span className="font-medium">Networking:</span> {intent}
            </p>
          )}
        </div>
      </div>

      {profile.headline && <p className="mb-4 text-sm text-text-body">{profile.headline}</p>}

      {/* FR-432 — the full interest set, not the truncated one the card shows. */}
      {profile.interests.length > 0 && (
        <section aria-labelledby="attendee-profile-interests" className="mb-2">
          <h3
            id="attendee-profile-interests"
            className="mb-2 font-display text-base font-medium text-text-primary"
          >
            Interests
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {profile.interests.map((interest) => (
              <li
                key={interest}
                className="rounded-sm bg-cream-200 px-2 py-0.5 text-xs text-text-body"
              >
                {interest}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        ═════════════════════════════════════════════════════════════════════════════════════
        T045 (007) — **the action row 006 left empty now has its first action** (FR-434, FR-568).

        006 declared this boundary and rendered nothing in it, because a disabled "Message" button
        would have been an affordance for a capability that did not exist: the reader presses it
        and learns the product is broken rather than that the feature is not built. The action
        appears now that the phase owning it has landed, which is what that arrangement was for —
        and it attaches *here*, so 008's card-sharing and appointments extend the same row without
        touching the body above it.

        **A `Link`, not a button that opens a dialog.** The thread is an addressable surface
        (FR-569), and the address it navigates to — `new/<attendeeId>` — is the one that
        deliberately creates nothing (FR-503a): an attendee who follows it and leaves without
        sending leaves no trace, and this person cannot tell it happened.

        SC-501 counts the actions from here to a sent first message: open the profile, choose
        Message, type, send. This link is action two of three.
        ═════════════════════════════════════════════════════════════════════════════════════
      */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
        <Link
          to={`/messages/new/${profile.attendeeId}`}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
        >
          <MessageSquare aria-hidden="true" className="size-4" />
          Message {profile.displayName}
        </Link>

        {/*
          ═══════════════════════════════════════════════════════════════════════════════════
          T061 (008) — **the second action in the row 006 declared and left empty** (FR-601).

          It attaches here and edits nothing above it, which is what that arrangement was for:
          006 built the boundary, 007 put the first action in it, and this appends beside it.

          **A button rather than a `Link`, unlike its neighbour, and the difference is the
          point.** Messaging navigates to an address that deliberately creates nothing until
          something is said (FR-503a); sharing a card *is* the act — one request, immediately
          durable, and **irrevocable** (FR-618). An address for it would suggest a place you can
          go and come back from.

          SC-601 counts the actions from Discover to a contact: open the profile, share, done.
          This is action two of two, which is what keeps the journey inside three deliberate
          acts.
          ═══════════════════════════════════════════════════════════════════════════════════
        */}
        <ShareCardAction attendeeId={profile.attendeeId} displayName={profile.displayName} />

        {/*
          ═══════════════════════════════════════════════════════════════════════════════════
          008 — **the third action, and the one that keeps proposing independent of exchanging**
          (SC-604, User Story 3: "From a contact or a profile").

          **The justification written here until 016 is now false, and it is replaced rather than
          patched.** It argued that sharing was one-directional (FR-602), so sharing your card
          with somebody you just met gained you nothing, they did not become your contact, and
          Network — the only other surface with a scheduling action — never listed them, leaving
          *discover → share → schedule* to dead-end at step three. Constitution **v5.0.0 (C1)**
          retracts that: one act now writes both rows (FR-1021, FR-1022), the contact does appear
          in Network, and that dead end is gone. A reader who trusted the old sentence could
          reasonably delete this control on the strength of it.

          What survives is the spec's Assumption itself — *scheduling does not require holding a
          card* — and removing this control would still make it false, by a different route. The
          only remaining way to reach a scheduling action would run through an exchange that is
          immediate, mutual and **irrevocable** (FR-1026), and which the other person is never
          asked about (FR-1023). Proposing is the deliberately *answerable* act in this feature:
          it is accepted or declined, on the invitee's own terms. Gating the answerable act
          behind the one that cannot be undone inverts that, and it would mean handing over your
          contact details in order to ask for half an hour.

          No registration check is needed and none is possible to get wrong here: this view is
          reached at `/discover/<attendeeId>` under the active conference and reads the profile
          through the event-scoped route, so the subject is registered for it by construction.
          That is the same reasoning that lets `Contacts` gate on `atActiveEvent` — the
          difference is that here the answer is always yes.
          ═══════════════════════════════════════════════════════════════════════════════════
        */}
        <button
          type="button"
          ref={scheduleOpener}
          onClick={() => setScheduling(true)}
          aria-label={`Propose a meeting with ${profile.displayName}`}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-sm border border-accent-strong px-4 py-2 text-sm font-medium text-accent-strong"
        >
          <CalendarClock aria-hidden="true" className="size-4" />
          Propose a meeting
        </button>
      </div>

      {scheduling && (
        <ScheduleDialog
          attendeeId={profile.attendeeId}
          displayName={profile.displayName}
          onClose={() => setScheduling(false)}
          onProposed={() => setScheduling(false)}
          returnFocusTo={scheduleOpener}
        />
      )}
    </>
  )
}
