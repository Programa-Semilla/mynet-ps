/**
 * T020 (007) — private 1:1 conversations, in domain terms (constitution Principle V, FR-566).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS THE ACTING ATTENDEE'S IDENTIFIER, AND NONE EVER MAY** (FR-525).
 *
 * The rule every repository in this package states in its own file — see `agenda.ts`,
 * `profile.ts`, `directory.ts` — and it binds harder here than anywhere before it, because
 * this is the first domain whose content is *another person's words*. Identity comes from the
 * sign-in session at the request boundary. There is no expression a component author could
 * write that names somebody else's conversation, because there is no parameter in which to
 * name them.
 *
 * `openWith` **does** name a *recipient*, and that is the same narrowing exception 004 recorded
 * for `GET /events/:eventId/attendees/:attendeeId` and 006 restated for `DirectoryRepository.get`:
 * the identifier selects a target, never the actor, on a route whose actor is fixed by the
 * session.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THERE IS NO `eventId` ANYWHERE IN THIS FILE, AND THE ABSENCE IS THE REQUIREMENT**
 * (FR-507, standing decision 7).
 *
 * Every prior per-attendee domain in this product takes a conference identifier, because every
 * prior domain is conference content or attendee state about it. Conversations are
 * *relationships*, and relationships persist across events: a contact made at one conference
 * must not vanish at the next. Adding a conference parameter here would be the one edit that
 * silently reintroduces the failure FR-507 exists to prevent.
 *
 * Server-side the predicate is **participation**, not event access — see
 * `apps/api/src/plugins/participation.ts`. There is no `EventScope` to be had, so a branded
 * `ConversationScope` replaces it, and `tests/unit/participation-audit.test.ts` fails the build
 * for any route that forgets it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Nothing in this domain is cached** (FR-563). Declared at the composition root, where the
 * wiring happens, rather than merely omitted — see `apps/web/src/app/services.ts`.
 */

/**
 * The longest a message may be, **after trimming** (FR-517, research R12).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A runtime value in a file of type declarations, deliberately.** The composer needs the
 * number to show a counter as it is approached, and the alternative — restating `2000` in
 * `Composer.tsx` — is how a client comes to disagree with the server about what it will accept.
 * The server enforces it independently, in the route schema and again as a `CHECK` on the column,
 * because client-side presentation of a limit is never the enforcement of it (Principle VIII).
 *
 * This is the *domain* fact; the two server-side enforcements are its implementation.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const MESSAGE_MAX_LENGTH = 2_000

/**
 * What a conversation currently permits, derived server-side and never stored.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * There is **no `status` column** behind this (data-model.md, State transitions). `open` means
 * two participant rows exist, `one_sided` means one does — the counterpart deleted their
 * account — and a conversation with none is removed outright (FR-575). A stored status can
 * disagree with the rows it summarises, and on the day it does, the one that gets read is the
 * one deciding whether a departed attendee's thread still accepts messages.
 *
 * `blocked` means **this attendee blocks the counterpart**. The reverse — being blocked — is
 * deliberately not representable here, and never arrives from the server: FR-537 forbids
 * disclosing that a block exists to the person it refuses. A sender learns their message did
 * not send, never why.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type ConversationState = 'open' | 'one_sided' | 'blocked'

/**
 * The other person in a conversation, as the list renders them.
 *
 * Only ever reached through a `ConversationSummary`, and **`null` there when they have deleted
 * their account** (FR-573). There is no name, no avatar and no identifier to hand back in that
 * case, because nothing was retained — the surviving thread is rendered from `state` rather
 * than from a placeholder person.
 *
 * `avatar` is a `data:` URL or `null`, converted at the transport boundary for the reason
 * `DirectoryEntry.avatar` records at length: presentation code receives something it can put in
 * `src` without learning that HTTP exists.
 */
export interface Counterpart {
  readonly attendeeId: string
  readonly displayName: string
  readonly avatar: string | null
}

/** The preview line the conversation list shows under a counterpart's name. */
export interface ConversationPreview {
  readonly body: string
  readonly sentAt: string
  /** Whether the acting attendee wrote it. See `Message.mine` for why this is a boolean. */
  readonly mine: boolean
}

/**
 * One row of the conversation list (FR-508).
 *
 * Ordered by most recent message first, over the whole set — the list is **not paginated**,
 * because an attendee has tens of these and FR-508's ordering is over all of them.
 */
export interface ConversationSummary {
  readonly conversationId: string
  /** `null` when the other participant deleted their account (FR-573). */
  readonly counterpart: Counterpart | null
  /** `null` only for a one-sided conversation whose surviving messages are all gone. */
  readonly lastMessage: ConversationPreview | null
  /**
   * **A boolean, not a count** (FR-531). Nothing in the product needs more, and a count is a
   * more precise disclosure of reading behaviour than any requirement asks for.
   *
   * Derived from the attendee's **own** read position, never from who spoke last (FR-527).
   */
  readonly unread: boolean
  readonly state: ConversationState
}

/**
 * One message in a thread.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO AUTHOR IDENTIFIER IS PROJECTED — ONLY `mine`.**
 *
 * The counterpart is already established by the conversation, so an identifier per message
 * would add nothing and widen the surface. There is also **no `readAt`, no delivery status, no
 * `editedAt` and no reactions**: FR-516 makes a sent message immutable, and M5 puts read
 * receipts, delivery ticks, typing indicators and presence out of scope entirely.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface Message {
  readonly messageId: string
  readonly body: string
  readonly sentAt: string
  readonly mine: boolean
}

/** How much history to ask for, and from where. */
export interface MessagePageQuery {
  /**
   * Opaque to every caller. Encodes the previous page's last `(sentAt, id)` pair, and nothing
   * outside the server may parse or construct one.
   *
   * **This cursor guarantees no duplicates *and* no omissions** — unlike 006's directory
   * cursor, whose guarantee is deliberately asymmetric. A message's `sentAt` is immutable
   * (FR-516) and its ordering total, so nothing can change rank under the cursor and nothing
   * can be skipped (research R6).
   */
  readonly cursor?: string

  /**
   * Whether the response should carry the counterpart, whose avatar bytes dominate its size.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Defaults to included. A caller that already has the counterpart — the open thread's
   * three-second poll, which has had it since the first read and whose face cannot change while
   * the thread is mounted — passes `false` and saves ~3–5.5 KB of base64 per tick, per attendee,
   * on a conference venue's cellular connection.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  readonly counterpart?: boolean
  /** Page size. **Bounded server-side**, so a caller cannot ask for a whole thread. */
  readonly limit?: number
}

/**
 * One page of history, **newest first**. The caller reverses for display, because a thread
 * opens at the bottom (research R6).
 */
export interface MessagePage {
  readonly messages: readonly Message[]
  /**
   * Who the conversation is with, or **`null` when they have deleted their account** (FR-573).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * Carried on the page so that the thread's header, the composer's availability and the block
   * and report dialogs are all satisfied by one request. Reading the conversation list to find
   * the row instead would transfer every counterpart's name and face to render one header —
   * the cost this contract avoided when it gave Home's unread dot its own address.
   *
   * `null` carries nothing at all: no name, no avatar, no identifier. The closed treatment is
   * rendered from `state`, never from a placeholder person.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly counterpart: Counterpart | null
  /** `null` when there is no older page. Hand it back unchanged to read further back. */
  readonly nextCursor: string | null
  /** Carried on the page so the composer's availability needs no second request. */
  readonly state: ConversationState
}

/** What a send resolves to. Enough to render the message the attendee just wrote, and no more. */
export interface SentMessage {
  readonly messageId: string
  readonly sentAt: string
}

/**
 * What opening a conversation resolves to.
 *
 * The conversation identifier is returned **whether or not this call created it**. FR-510
 * requires that a pair never has two conversations, and the server enforces it by catching the
 * unique violation and appending rather than checking first — so a caller cannot know, and has
 * no reason to, which of the two happened.
 */
export interface OpenedConversation {
  readonly conversationId: string
  readonly messageId: string
  readonly sentAt: string
}

/**
 * The attendee's conversations: which ones exist, which have something waiting, and how a new
 * one begins.
 */
export interface ConversationRepository {
  /**
   * Every conversation this attendee participates in, most recent first (FR-508).
   *
   * An attendee who has none yields an **empty array, not an error** — a valid answer the
   * caller renders as the explicit empty state that invites them into Discover (FR-518).
   */
  list(): Promise<ConversationSummary[]>

  /**
   * Whether anything at all is unread, for Home's indicator (FR-531).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Its own method rather than a derivation over `list`**, and that is standing decision 9
   * rather than a micro-optimisation: a Home card owns its own loading, empty and failure
   * states and must not transfer the whole conversation list to render a dot. It also keeps
   * the card independent of Messages — a failing conversation list must leave the indicator
   * working, and vice versa.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  hasUnread(): Promise<boolean>

  /**
   * Open a conversation with a co-attendee **by sending its first message** (FR-503a).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **There is no method that creates an empty conversation, and there never will be.** A
   * conversation does not exist until something is said in it, so opening a thread from a
   * profile writes nothing — no conversation, no participation, no record of the attempt.
   *
   * `attendeeId` is the **recipient**. See the header for why that is the narrowing exception
   * rather than a breach of the no-actor-identifier rule.
   * ───────────────────────────────────────────────────────────────────────────────────────
   *
   * Refused as a `RequestRefusedError` when the recipient blocks the caller — **carrying no
   * reason**, because FR-537 forbids disclosing that a block exists — and when no shared event
   * makes them reachable, which is deliberately indistinguishable from no such attendee
   * (FR-504).
   */
  openWith(attendeeId: string, body: string): Promise<OpenedConversation>

  /**
   * Advance the caller's **own** read position through a message (FR-528).
   *
   * Idempotent and **monotonic**: naming an older message than the current position is accepted
   * and changes nothing. Without that, an out-of-order arrival could silently mark a
   * conversation unread again.
   *
   * **There is no method, and no field on any type in this file, by which one attendee learns
   * another's read position** (FR-530). "Seen" is not a feature of this product.
   */
  markRead(conversationId: string, throughMessageId: string): Promise<void>
}

/** What was actually said, and how to say something. */
export interface MessageRepository {
  /**
   * A page of history for a conversation the attendee participates in.
   *
   * A conversation that does not exist and one the caller is not in are **the same refusal**
   * (FR-524) — a distinguishable answer would confirm the conversation exists, and a message
   * identifier is guessable.
   */
  list(conversationId: string, query?: MessagePageQuery): Promise<MessagePage>

  /**
   * Send into an existing conversation.
   *
   * `body` is 1–2,000 characters after trimming. The composer disables send below the lower
   * bound (FR-512) and shows a counter approaching the upper one (FR-517), so a refusal here is
   * a backstop rather than the normal path — client-side presentation of a limit is never the
   * enforcement of it.
   *
   * **Refused offline and never queued** (FR-565), like every write in this product. A message
   * the attendee believes was sent, delivered at an unpredictable later moment against a
   * conversation that may since have been blocked or closed, is worse than a refusal they can
   * act on.
   */
  send(conversationId: string, body: string): Promise<SentMessage>
}
