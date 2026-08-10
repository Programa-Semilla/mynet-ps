import type {
  ConversationRepository,
  ConversationSummary,
  Counterpart,
  MessagePage,
  MessagePageQuery,
  MessageRepository,
  OpenedConversation,
  SentMessage,
} from '../interfaces/messages.js'
import type { HttpClient } from './client.js'

/**
 * T024 (007) — the HTTP conversation and message repositories.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT ONE ADDRESS HERE BEGINS `/events/`, AND THAT ABSENCE IS THE MOST IMPORTANT THING ON
 * THIS PAGE** (FR-507, plan Structure Decision 1).
 *
 * Every other repository in this directory addresses a conference, and acquires the server's
 * `requireEventAccess` guard by doing so. Conversations are cross-event, so there is no
 * conference in the path to guard — which also means `tests/unit/event-scope-audit.test.ts`
 * would **pass these routes without inspecting anything** (research R9). The server replaces
 * that protection with a branded `ConversationScope` and its own audit; nothing on this side of
 * the wire can substitute for it, and nothing here should look as though it does.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Refusals are indistinguishable, and these classes deliberately do nothing to tell them
 * apart.** A conversation that does not exist and one the caller does not participate in both
 * arrive as the same 404 (FR-524); a blocked send and a generic conflict both arrive as the
 * same reasonless 409 (FR-537). A client that appeared to know which had happened would be
 * inventing information it does not have — and in the block case, disclosing something the
 * specification forbids disclosing.
 *
 * **No method takes the acting attendee's identifier.** Identity travels as the HttpOnly
 * sign-in cookie `HttpClient` attaches to every request, so there is nothing here to get wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The avatar shape the API embeds, before it becomes a data URL. See `toDataUrl`. */
interface AvatarBody {
  readonly contentType: string
  readonly base64: string
}

/** A page of history, as it arrives. Identical but for the avatar encoding. */
interface MessagePageBody extends Omit<MessagePage, 'counterpart'> {
  readonly counterpart:
    (Omit<Counterpart, 'avatar'> & { readonly avatar: AvatarBody | null }) | null
}

/** The conversation list, as it arrives. Identical but for the avatar encoding. */
interface ConversationListBody {
  readonly conversations: readonly (Omit<ConversationSummary, 'counterpart'> & {
    readonly counterpart:
      (Omit<Counterpart, 'avatar'> & { readonly avatar: AvatarBody | null }) | null
  })[]
}

/** Encoded once, so no call site can forget and no identifier can escape into the path. */
const conversationPath = (conversationId: string, rest = ''): string =>
  `/conversations/${encodeURIComponent(conversationId)}${rest}`

export class HttpConversationRepository implements ConversationRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * The whole list in one request, avatars included — the same shape decision 006 made for the
   * directory and for the same reason: a per-row avatar fetch turns one request into N+1 and
   * renders the landing view as a column of placeholders resolving one by one.
   *
   * `counterpart: null` survives the conversion untouched. There is nothing to convert, which
   * is the point: a departed attendee has no name and no face to send (FR-573).
   */
  async list(): Promise<ConversationSummary[]> {
    const body = await this.#http.request<ConversationListBody>('/conversations')

    return body.conversations.map((conversation) => ({
      ...conversation,
      counterpart:
        conversation.counterpart === null
          ? null
          : { ...conversation.counterpart, avatar: toDataUrl(conversation.counterpart.avatar) },
    }))
  }

  /**
   * Home's indicator, as its own address.
   *
   * **Ordered before `/conversations/:conversationId` on the server**, because `unread` would
   * otherwise be read as an identifier. Noted here because the address looks like a
   * conversation and is not one.
   */
  async hasUnread(): Promise<boolean> {
    const body = await this.#http.request<{ hasUnread: boolean }>('/conversations/unread')
    return body.hasUnread
  }

  /**
   * `POST /conversations` — the only address that creates one, and it does so by sending the
   * first message in the same transaction (FR-503a).
   *
   * The server answers **201 when it created the conversation and 200 when it appended to one
   * that already existed** (FR-510), with the same body either way. This method deliberately
   * does not surface the difference: the caller navigates to the returned conversation in both
   * cases, and a flag it could branch on would invite a message that leaks whether the pair had
   * spoken before.
   */
  async openWith(attendeeId: string, body: string): Promise<OpenedConversation> {
    return this.#http.request<OpenedConversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ attendeeId, body }),
    })
  }

  /** `PUT` on the read position, which is what makes advancing it idempotent by address. */
  async markRead(conversationId: string, throughMessageId: string): Promise<void> {
    await this.#http.request<void>(conversationPath(conversationId, '/read'), {
      method: 'PUT',
      body: JSON.stringify({ throughMessageId }),
    })
  }
}

export class HttpMessageRepository implements MessageRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * The page, with the counterpart's avatar converted to a data URL at the transport boundary —
   * the same conversion `list` above performs, and for the same reason `DirectoryEntry.avatar`
   * records: presentation code receives something it can put in `src` without learning that HTTP
   * exists.
   */
  async list(conversationId: string, query: MessagePageQuery = {}): Promise<MessagePage> {
    const body = await this.#http.request<MessagePageBody>(
      conversationPath(conversationId, `/messages${queryString(query)}`),
    )

    return {
      ...body,
      // `null` survives untouched. There is nothing to convert, which is the point: a departed
      // attendee has no face to send (FR-573).
      counterpart:
        body.counterpart === null
          ? null
          : { ...body.counterpart, avatar: toDataUrl(body.counterpart.avatar) },
    }
  }

  /**
   * Resolves to the stored message's identifier and instant.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **That return value is what keeps the thread non-optimistic**, on the same reasoning 005
   * recorded for note autosave: a message may be rendered as sent only from a resolved write.
   * A method resolving to `void` would leave the caller nothing to distinguish "the server
   * accepted this" from "the request was dispatched", and rendering from the keystroke instead
   * would incur the optimistic-update decision the constitution requires be recorded
   * separately — which this feature does not take (FR-565).
   *
   * The `sentAt` is the server's, not the device's. A phone with a wrong clock must not be able
   * to place its own message out of order in a thread.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  async send(conversationId: string, body: string): Promise<SentMessage> {
    return this.#http.request<SentMessage>(conversationPath(conversationId, '/messages'), {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
  }
}

/** `data:` URL for an embedded rendition, or `null` when the attendee has no avatar. */
const toDataUrl = (avatar: AvatarBody | null): string | null =>
  avatar ? `data:${avatar.contentType};base64,${avatar.base64}` : null

/**
 * The query string for a page of history.
 *
 * Omits an absent cursor rather than sending it empty, so "the first page" has exactly one
 * address — which is what lets `HttpClient`'s in-flight coalescing share the poll's request
 * with a concurrent render's, instead of issuing two identical reads. Same reasoning as the
 * directory's `queryString`.
 */
const queryString = (query: MessagePageQuery): string => {
  const params = new URLSearchParams()

  const cursor = query.cursor?.trim()
  if (cursor) params.set('cursor', cursor)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  // Only ever sent when *suppressing* the counterpart, so the default address — the one the first
  // read and any concurrent render share — stays exactly as it was and coalescing is unaffected.
  if (query.counterpart === false) params.set('counterpart', 'false')

  const encoded = params.toString()
  return encoded.length === 0 ? '' : `?${encoded}`
}
