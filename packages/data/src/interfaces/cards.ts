/**
 * T030 (008) — digital business cards, in domain terms (Principle V, FR-601–FR-618, FR-650).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A CONTACT IS SOMEBODY WHOSE CARD YOU HOLD** (constitution v3.2.0, N1).
 *
 * There is no connect verb here, no request, and no acceptance step, because none appears in
 * `requirements.md` or in the approved prototype. Sharing is the only relationship-forming act
 * in the product, and it is **one-directional**: `share` gives the recipient your card and gives
 * you nothing. You hold theirs when, and only when, they share back.
 *
 * **Contacts are never derived from conversations**, and that is a prohibition rather than an
 * omission. 007's open send makes a conversation unilateral — anyone sharing an event may start
 * one — so deriving contacts from them would let a stranger insert themselves into another
 * attendee's Network by sending a single message.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO METHOD ACCEPTS THE ACTING ATTENDEE'S IDENTIFIER** (FR-640). The sharer and the holder are
 * always the signed-in attendee, decided at the request boundary. The identifiers these methods
 * *do* take name the **other** person — the same narrowing exception `messages.ts`, `safety.ts`
 * and `directory.ts` each recorded before this one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **CROSS-EVENT, and it is the whole point of the domain** (standing decision 7). A held card
 * outlives the conference it was shared at, the conference ending, and the sharer turning
 * discoverability off (FR-612, FR-614). **No method takes an `eventId`**, and that absence is
 * load-bearing: there is no parameter in which a caller could accidentally scope their contacts
 * to the conference they happen to be looking at.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Nothing here is cached** (FR-648), declared per member at the composition root. Resolving a
 * held card reads **another person's live profile**, which is the argument that made Discover
 * uncached in 006: the caching decorator revokes on age alone, and age is the wrong clock for
 * somebody else's personal data.
 */

/**
 * A card the attendee **holds** — one entry in the contacts list (FR-610, FR-615, FR-617).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PROFILE HALF RESOLVES LIVE, AND IS NEVER A STORED COPY** (FR-611).
 *
 * Name, company, role, headline, interests and avatar come from the sharer's *current* profile
 * at read time. So an edit they make is visible to everybody holding their card, with the holder
 * doing nothing (SC-603) — and there is exactly one source of truth for one human being.
 *
 * A snapshot taken at share time was considered and is wrong twice over: it would duplicate
 * another person's personal data into a table they cannot edit, and it would show a job somebody
 * left years ago to everyone who met them once.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * `eventName` and `sharedAt` are the **exchange** rather than the person — where you met and
 * when (FR-615). They are the only fields here that do not move when the sharer edits anything.
 */
export interface HeldCard {
  /** The sharer. This is the attendee whose profile the rest of these fields resolve from. */
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  readonly interests: readonly string[]
  /** A `data:` URL or `null`, converted at the transport boundary as everywhere else. */
  readonly avatar: string | null
  /**
   * Where the exchange happened (FR-615).
   *
   * **A historical fact, never a filter.** The contacts list is not scoped to the active event,
   * and no caller may make it so — see the file header.
   */
  readonly eventId: string
  readonly eventName: string
  /** When the card first moved. **Never refreshed by a repeat share** (FR-604). */
  readonly sharedAt: string
  /**
   * Whether this contact is registered for the conference the reader is currently in.
   *
   * Not a visibility condition — the contact resolves regardless (FR-614). It exists so the
   * surface can **omit the scheduling action entirely** for somebody who is not at this
   * conference, rather than offering it and refusing afterwards (FR-639a). Absence is the
   * honest form of "you cannot meet them here".
   */
  readonly atActiveEvent: boolean
}

/**
 * A card the attendee has **given away** (FR-618's read side).
 *
 * Deliberately thinner than `HeldCard`: this is a record of something you did, not a person you
 * may now read. It carries the recipient's display name so the list is legible, and nothing
 * further — sharing your card does not entitle you to the recipient's profile, which is what
 * "one-directional" means in practice.
 */
export interface SharedCard {
  readonly attendeeId: string
  readonly displayName: string
  readonly eventId: string
  readonly eventName: string
  readonly sharedAt: string
}

/**
 * Giving your card, and reading the cards you hold.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO REVOKE METHOD, AND ITS ABSENCE IS THE REQUIREMENT** (FR-618, FR-650).
 *
 * Not "no revoke yet" and not "a revoke a later feature will add" — none, ever. A card is a
 * thing you gave somebody, and you cannot un-give what another person already has; a product
 * that pretended otherwise would be lying about what it had done with the data. Blocking is the
 * mechanism for ending contact (FR-608), and it is read-side, reversible, and does not destroy
 * the other person's record.
 *
 * `apps/api/tests/unit/card-audit.test.ts` fails the build if a `DELETE` under `/cards` is ever
 * registered, and `network-absences.test.ts` asserts the same from the schema side. An absence
 * with no test is a gap somebody eventually fills in good faith.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface CardRepository {
  /**
   * Give **your** card to another attendee (FR-601, FR-602).
   *
   * **Idempotent** (FR-604): sharing twice does not create a second record and **does not
   * refresh** the original instant. That second half matters — a refreshing timestamp would turn
   * re-sharing into a way to signal somebody repeatedly, which is notification-shaped behaviour
   * in a feature that dispatches nothing (FR-643).
   *
   * Returns the record of the exchange, never the recipient's profile. Sharing gives; it does
   * not take.
   *
   * Refused when the two share no current conference, when the recipient does not exist, when
   * they are not discoverable, and when the identifier is malformed — **all four
   * indistinguishably** (FR-607), inheriting the property 006 established. Refused with no
   * reason at all when either party has blocked the other (FR-608).
   */
  share(attendeeId: string): Promise<SharedCard>

  /**
   * The contacts list — every card the attendee holds (FR-610, FR-617).
   *
   * **Never filtered by the active event** (FR-614), never filtered by the sharer's
   * discoverability (FR-612), and never filtered by their verification state (FR-613). Those
   * three absences are the standing consent constitution v3.2.0 (N2) established: sharing a card
   * is a decision to be remembered by that person, and it outlives both the conference and the
   * discoverability toggle.
   *
   * Pairs with a block in either direction are excluded, read-side — so lifting a block restores
   * the contact with no write anywhere (FR-608, FR-637a).
   *
   * An attendee holding nothing yields an **empty array**, not an error: that is the "you have
   * not met anybody yet" state, which the caller renders with a route into Discover (FR-617).
   */
  listHeld(): Promise<HeldCard[]>

  /**
   * One held card.
   *
   * Refused with a **404 indistinguishable from the card not existing** when the reader does not
   * hold it (FR-616, FR-642). A 403 would confirm that two specific people exchanged cards, to
   * somebody holding nothing but an attendee identifier.
   */
  getHeld(attendeeId: string): Promise<HeldCard>

  /** Cards the attendee has given away. Read-only; see the interface header. */
  listShared(): Promise<SharedCard[]>
}
