import type {
  ConversationSummary,
  Counterpart,
  Message,
  MessagePage,
  MessagePageQuery,
  OpenedConversation,
  SentMessage,
} from '@mynet/data'
import type { PlatformServices } from '@mynet/platform'
import { render } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { DESTINATIONS } from '../../src/app/navigation.js'
import { testServices, WithServices } from './services.js'

/**
 * A rendered Messages destination, for the 007 component tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The routes are built from `DESTINATIONS`, not restated here** — the reasoning
 * `support/discover.tsx` and `support/agenda.tsx` both record. A harness that hand-wrote its own
 * `<Route>` tree could silently stop matching the application: the destination could declare a
 * child address these tests never render, or render one the router does not, and FR-233's "a
 * destination owns its element and its nested addresses" would stop being under test.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The other person in a thread, as the message page carries them.
 *
 * Exported so a test that renders a **one-sided** conversation can pass `null` explicitly rather
 * than omitting the field — the departed-counterpart case is a real state (FR-573), and a fixture
 * that made it the default would hide it.
 */
export const A_COUNTERPART: Counterpart = {
  attendeeId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Sofía Muñoz',
  avatar: null,
}

export const aMessage = (overrides: Partial<Message> = {}): Message => ({
  messageId: '22222222-2222-4222-8222-222222222222',
  body: 'Enjoyed your talk — could we compare notes?',
  sentAt: '2026-09-14T09:00:00.000Z',
  mine: false,
  ...overrides,
})

export const aConversation = (
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary => ({
  conversationId: '33333333-3333-4333-8333-333333333333',
  counterpart: A_COUNTERPART,
  lastMessage: { body: 'See you there.', sentAt: '2026-09-14T09:00:00.000Z', mine: false },
  unread: false,
  state: 'open',
  ...overrides,
})

/**
 * Conversation and message repositories over in-memory state, recording what they were asked.
 *
 * Real enough that the screen's behaviour is the screen's rather than the double's: a send
 * actually reaches it, so a composer that submits an empty body is caught rather than
 * accommodated (FR-512).
 */
export const messagesDouble = ({
  conversations = [],
  pages = [{ messages: [], nextCursor: null, state: 'open', counterpart: A_COUNTERPART }],
  listFails,
  threadFails,
  advanceOnPoll = false,
}: {
  conversations?: ConversationSummary[]
  pages?: MessagePage[]
  /**
   * Serve a **successive** page to each cursor-less read, rather than always the first.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Opt-in, because the default is load-bearing for everything else: a cursor-less read is "give
   * me the newest page", and the paging tests rely on repeating it returning the same thing.
   *
   * It exists because the thread's **poll** is a cursor-less read, so without this a test cannot
   * express "and then a message arrived" — every tick returned the page the thread opened with,
   * which is why the FR-585 announcement had no test for as long as it did.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  advanceOnPoll?: boolean
  /**
   * Failures configured **before** the first render, which is the only way to observe a failed
   * initial read: a setter called afterwards arrives once the effect has already resolved. The
   * setters below remain, for a test that needs the state to change mid-life.
   */
  listFails?: Error
  threadFails?: Error
} = {}) => {
  const sent: { conversationId: string; body: string }[] = []
  const opened: { attendeeId: string; body: string }[] = []
  const readTo: { conversationId: string; messageId: string }[] = []
  const pageQueries: MessagePageQuery[] = []

  let listFailure: Error | null = listFails ?? null
  let threadFailure: Error | null = threadFails ?? null
  let sendFailure: Error | null = null
  let holdList = false
  let holdThread = false
  /** How many cursor-less reads have been served — the poll's tick count. See `advanceOnPoll`. */
  let cursorlessReads = 0

  return {
    sent,
    opened,
    readTo,
    pageQueries,
    failList: (error: Error | null) => {
      listFailure = error
    },
    failThread: (error: Error | null) => {
      threadFailure = error
    },
    failSend: (error: Error | null) => {
      sendFailure = error
    },
    holdList: () => {
      holdList = true
    },
    holdThread: () => {
      holdThread = true
    },
    conversations: {
      list: async (): Promise<ConversationSummary[]> => {
        if (listFailure) throw listFailure
        if (holdList) return new Promise<ConversationSummary[]>(() => {})
        return conversations
      },
      hasUnread: async (): Promise<boolean> => conversations.some((c) => c.unread),
      openWith: async (attendeeId: string, body: string): Promise<OpenedConversation> => {
        if (sendFailure) throw sendFailure
        opened.push({ attendeeId, body })
        return {
          conversationId: '33333333-3333-4333-8333-333333333333',
          messageId: '44444444-4444-4444-8444-444444444444',
          sentAt: '2026-09-14T10:00:00.000Z',
        }
      },
      markRead: async (conversationId: string, messageId: string): Promise<void> => {
        readTo.push({ conversationId, messageId })
      },
    },
    messages: {
      list: async (_conversationId: string, query: MessagePageQuery = {}): Promise<MessagePage> => {
        pageQueries.push(query)
        if (threadFailure) throw threadFailure
        if (holdThread) return new Promise<MessagePage>(() => {})
        const index = query.cursor
          ? pageQueries.length - 1
          : advanceOnPoll
            ? Math.min(cursorlessReads++, pages.length - 1)
            : 0
        return (
          pages[index] ?? {
            messages: [],
            nextCursor: null,
            state: 'open',
            counterpart: A_COUNTERPART,
          }
        )
      },
      send: async (conversationId: string, body: string): Promise<SentMessage> => {
        if (sendFailure) throw sendFailure
        sent.push({ conversationId, body })
        return {
          messageId: '55555555-5555-4555-8555-555555555555',
          sentAt: '2026-09-14T10:05:00.000Z',
        }
      },
    },
  }
}

export interface MessagesHarness {
  readonly conversations?: ConversationSummary[]
  readonly pages?: MessagePage[]
  /** Fails the conversation list from the very first read. See `messagesDouble`. */
  readonly listFails?: Error
  /** Fails the thread from the very first read. */
  readonly threadFails?: Error
  /** See `messagesDouble` — successive pages per poll tick, for testing arrival. */
  readonly advanceOnPoll?: boolean
  readonly overrides?: Partial<PlatformServices['repositories']>
  readonly services?: Partial<PlatformServices>
  /** `/messages`, `/messages/<conversationId>`, or `/messages/new/<attendeeId>`. */
  readonly at?: string
}

export const renderMessages = ({
  conversations = [],
  pages,
  listFails,
  threadFails,
  advanceOnPoll,
  overrides = {},
  services: extraServices = {},
  at = '/messages',
}: MessagesHarness = {}) => {
  const double = messagesDouble({
    conversations,
    ...(advanceOnPoll === undefined ? {} : { advanceOnPoll }),
    ...(pages ? { pages } : {}),
    ...(listFails ? { listFails } : {}),
    ...(threadFails ? { threadFails } : {}),
  })

  const services = testServices(
    { conversations: double.conversations, messages: double.messages, ...overrides },
    extraServices,
  )

  const view = render(
    <WithServices services={services}>
      <ActiveEventProvider>
        <MemoryRouter initialEntries={[at]}>
          <MessagesRoutes />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

  return { messages: double, services, unmount: view.unmount }
}

const MESSAGES = DESTINATIONS.find((destination) => destination.path === '/messages')

const MessagesRoutes = () => {
  if (!MESSAGES?.element) {
    throw new Error(
      'The Messages destination declares no element. `navigation.ts` is what the router reads, ' +
        'so if this is missing the destination renders a placeholder in the real application too.',
    )
  }

  return (
    <Routes>
      <Route
        path="/messages"
        // Wrapped as `routes.tsx` wraps it: the destination is code-split (T031), so React needs
        // somewhere to suspend while its chunk arrives.
        element={<Suspense fallback={<p role="status">Loading…</p>}>{MESSAGES.element}</Suspense>}
      >
        {MESSAGES.children?.map((child) => (
          <Route
            key={child.path}
            path={child.path}
            element={<Suspense fallback={<p role="status">Loading…</p>}>{child.element}</Suspense>}
          />
        ))}
      </Route>
    </Routes>
  )
}
