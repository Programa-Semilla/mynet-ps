/**
 * T031 (008) — meetings, in domain terms (Principle V, FR-623–FR-639a, FR-650).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **PROPOSED, THEN ACCEPTED OR DECLINED — AND THE ASYMMETRY WITH CARDS IS DELIBERATE**
 * (constitution v3.2.0, N2; v5.0.0 C1).
 *
 * A card needs no answer — since C1 it is a **mutual exchange completed by one act**, with the
 * other party neither asked nor able to decline (FR-1021, FR-1023). An appointment **claims a
 * slot of somebody else's time**, which a message and a card do not, so it is proposed rather
 * than created. That single sentence is why this interface has `accept` and `decline` and
 * `cards.ts` has nothing of the kind.
 *
 * **The contrast survived C1; only its other half moved.** This paragraph used to open *"a card
 * is one-directional and needs no answer"*, and C1 retracts the first clause without touching the
 * second — which is the point, because the asymmetry was never about direction. It is about
 * whether an act consumes something the other person must be allowed to refuse.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **PER-EVENT, and every method says so by taking an `eventId`** (standing decision 7). An
 * appointment is a time and a place at a specific conference. That is the exact opposite of
 * `cards.ts`, whose methods take no `eventId` at all, and the contrast is the clearest statement
 * of the two scoping rules this feature works under.
 *
 * The server nests these routes beneath `/events/:eventId` for the same reason, which puts them
 * inside `requireEventAccess` and the route audit that already exists (research R2).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **NO METHOD ACCEPTS THE ACTING ATTENDEE'S IDENTIFIER** (FR-640). The proposer, the invitee who
 * answers, and the party who cancels are all the signed-in attendee, decided at the request
 * boundary. The identifier `slots` and `propose` take names the **other** person.
 *
 * **Cached under the existing per-conference key** (FR-647) — unlike cards, and the difference is
 * argued at the composition root. These are the attendee's *own* commitments at *one* conference,
 * which is exactly the shape `(attendeeId, eventId, resource)` was built for. Every **write** here
 * is still refused offline and never queued (FR-649).
 */

/**
 * A slot the reader may propose (FR-625, FR-626).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE OFFERED SET IS A FUNCTION OF THE READER'S OWN COMMITMENTS AND NOTHING ELSE.**
 *
 * Slots overlapping the reader's saved sessions, their sent pending proposals, and their
 * confirmed appointments are excluded. **Nothing about the invitee enters the computation** — not
 * their saved sessions, not their appointments, not their availability flag (FR-626). SC-605
 * measures exactly that: for a fixed reader, the offered set must be byte-identical regardless of
 * what the invitee has saved or booked, because anything else leaks their Agenda *by omission*.
 *
 * A **received** proposal contributes nothing either, and that is load-bearing rather than an
 * oversight (SC-608a). If it did, anyone could consume a stranger's entire day by proposing into
 * it, and the throttle would bound that without preventing it. Double-booking is caught at
 * acceptance instead (FR-633a) — later, and on the invitee's own terms.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Absolute instants, ISO-8601 (FR-124). The surface renders them in **venue time** (FR-624),
 * following 002's rule that times are stored as instants and localised at display.
 */
export interface MeetingSlot {
  readonly slotId: string
  readonly startsAt: string
  readonly endsAt: string
}

/** What a proposal says. Assembled by the scheduling dialog. */
export interface ProposeInput {
  /** Who the meeting is with. Never the proposer, who comes from the session. */
  readonly attendeeId: string
  readonly slotId: string
  /**
   * What the meeting is about — short, and never blank (FR-628).
   *
   * The dialog keeps its confirm control **disabled** while this is empty or whitespace-only,
   * so a rejected write is a backstop rather than the mechanism (FR-629).
   */
  readonly topic: string
}

/**
 * Which side of a meeting the reader is on.
 *
 * It decides which actions exist, not merely how the entry reads: only the invitee may accept or
 * decline (FR-635), while either party may cancel a confirmed appointment (FR-632).
 */
export type AppointmentRole = 'proposer' | 'invitee'

/**
 * The state of a meeting, as a **reader** sees it.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`lapsed` IS DERIVED FROM THE SLOT INSTANT AND IS STORED NOWHERE** (FR-634, research R8).
 *
 * The four stored statuses are `pending | confirmed | declined | cancelled`. A pending proposal
 * whose slot has passed reports as `lapsed` and can no longer be accepted — computed at read
 * time, on every read, from the slot's own instant.
 *
 * Storing it would require a scheduled sweep to maintain, and `RETENTION_SWEEPS` is the only
 * background machinery in this product: it exists for personal data no cascade can reach, which
 * this is not. Deriving keeps 008 free of background work entirely, which is a property worth
 * protecting rather than a convenience.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export type AppointmentStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'lapsed'

/** A meeting, in either role. */
export interface Appointment {
  readonly appointmentId: string
  readonly role: AppointmentRole
  /**
   * The other party.
   *
   * Always present, unlike 007's `counterpart`. When either participant deletes their account the
   * appointment is removed for both (FR-652), so there is no one-sided survivor to render — the
   * deliberate opposite of a conversation, which holds the survivor's own words.
   *
   * **No avatar, deliberately.** Nothing renders one, and this list is read on Home's first
   * viewport by every attendee on every load — 007 gave its unread indicator a separate address
   * so that "Home's card must not transfer every counterpart's name and face to render a dot",
   * and carrying unused image bytes here would be the same cost through a different door.
   */
  readonly counterpart: {
    readonly attendeeId: string
    readonly displayName: string
  }
  readonly slot: MeetingSlot
  readonly topic: string
  readonly status: AppointmentStatus
  readonly createdAt: string
  readonly answeredAt: string | null
}

/**
 * Proposing a meeting, and answering one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every method takes an `eventId`** — see the file header. There is no cross-event read here
 * and there must not be one: an appointment is a time at a specific conference, and a list
 * spanning conferences would be a list of times with no venue.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface AppointmentRepository {
  /**
   * Slots the reader may offer (FR-625, FR-626).
   *
   * **Takes no invitee, and that absence is the guarantee.** The offered set is a function of the
   * reader's own commitments; there is no parameter here in which the other person could be
   * named, so no later edit can pass one to the server and no identifier reaches an access log.
   * The surface titles itself from what it already knows.
   *
   * An **empty array is a legitimate answer**, not an error: it is the no-slots state, which the
   * dialog renders as an explanation and a close action with no selection offered (FR-627).
   */
  slots(eventId: string): Promise<MeetingSlot[]>

  /**
   * Propose a meeting (FR-628).
   *
   * Refused with no reason at all when either party has blocked the other (FR-637), and refused
   * indistinguishably from non-existence when the invitee is not registered for this conference —
   * which is also why the surface offers no scheduling action at all for a contact absent from
   * the active event (FR-639a).
   */
  propose(eventId: string, input: ProposeInput): Promise<Appointment>

  /**
   * Every meeting the reader is party to at this conference, **in both roles** (FR-631).
   *
   * `lapsed` is derived here rather than stored — see `AppointmentStatus`.
   */
  list(eventId: string): Promise<Appointment[]>

  /**
   * Accept a proposal. **Invitee only** (FR-635); a proposer attempting it is refused.
   *
   * Refused with a **409 that carries a reason** when the invitee has since acquired a
   * conflicting commitment (FR-633a). That is deliberately unlike the reasonless 409 a block
   * produces: this one describes **the reader's own schedule to the reader**, so it discloses
   * nothing about anybody else.
   */
  accept(eventId: string, appointmentId: string): Promise<Appointment>

  /**
   * Decline a proposal. **Invitee only** (FR-635).
   *
   * Frees the slot **for the proposer**, who was the only party it was ever unavailable to
   * (FR-633).
   */
  decline(eventId: string, appointmentId: string): Promise<Appointment>

  /**
   * Cancel a confirmed appointment. **Either party may** (FR-632), and it frees the slot **for
   * both** (FR-633) — the asymmetry with `decline` is the point: a declined proposal was never
   * on the invitee's calendar to free.
   */
  cancel(eventId: string, appointmentId: string): Promise<Appointment>
}
