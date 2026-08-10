import type { PlatformServices } from '@mynet/platform'
import { PlatformProvider } from '@mynet/platform'
import type { ReactNode } from 'react'

import { AuthProvider } from '../../src/auth/useAuth.js'

/**
 * A substituted registry, for component tests (FR-047, research D10).
 *
 * The whole point of the composition root is that a test replaces every implementation in one
 * object rather than mocking a module or stubbing `fetch`. If this ever became awkward, the
 * abstraction would have failed — so tests reach for this and never for `vi.mock`.
 */

export const noopDevices: PlatformServices['devices'] = {
  notifications: {
    isSupported: () => false,
    requestPermission: async () => 'unsupported',
    show: async () => {},
    // 007 — the three members M4 added. Present because the registry is substituted **whole**
    // (FR-047): a method added to the interface and forgotten here fails to compile.
    //
    // `null` throughout, which is the state of a browser that cannot subscribe — and by FR-552
    // the state every other surface must behave identically in.
    subscribe: async () => null,
    unsubscribe: async () => {},
    currentSubscription: async () => null,
  },
  calendar: { isSupported: () => false, addEvent: async () => {} },
  camera: { isSupported: () => false, capturePhoto: async () => null },
  contactShare: { isSupported: () => false, shareCard: async () => false },
  secureStorage: {
    get: async () => null,
    set: async () => {},
    remove: async () => {},
    clear: async () => {},
  },
  connectivity: { isOnline: () => true, subscribe: () => () => {}, reportReachability: () => {} },
  // 007 — the seventh capability. Visible by default: a component test renders into a jsdom
  // document nobody is looking at, and reporting "hidden" would silently disable every behaviour
  // gated on visibility — the open thread's poll, today — leaving the failure as an absence of
  // requests rather than an error anybody sees.
  visibility: { isVisible: () => true, subscribe: () => () => {} },
}

/**
 * The device registry with some capabilities replaced.
 *
 * 007 — exported because the notification tests are the first that need a *capability* double
 * rather than a repository one, and `testServices`' second parameter takes the whole `devices`
 * object. Spreading `noopDevices` by hand in each test would mean a capability added later is
 * silently absent from exactly the tests that care most about capabilities.
 */
export const devicesWith = (
  overrides: Partial<PlatformServices['devices']>,
): PlatformServices['devices'] => ({ ...noopDevices, ...overrides })

export const SUMMIT = {
  id: 'event-summit',
  name: 'Product & Design Summit',
  location: 'Barcelona, Spain',
  startsOn: '2026-09-14',
  endsOn: '2026-09-17',
  timezone: 'Europe/Madrid',
} as const

/** A profile nobody has written yet — the ordinary state of a new account (FR-341). */
export const EMPTY_PROFILE = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  company: null,
  role: null,
  headline: null,
  networkingIntent: null,
  availability: null,
  interests: [],
  discoverable: true,
  emailVerified: false,
  hasAvatar: false,
} as const

type DeepPartial<T> = { [K in keyof T]?: T[K] }

export const testServices = (
  overrides: DeepPartial<PlatformServices['repositories']> = {},
  rest: Partial<PlatformServices> = {},
): PlatformServices => ({
  devices: noopDevices,
  repositories: {
    attendee: {
      getCurrent: async () => ({
        id: 'attendee-ada',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
      }),
    },
    events: { listRegistered: async () => [SUMMIT] },
    activeEvent: { getActive: async () => SUMMIT, setActive: async () => SUMMIT },
    catalog: { listSessions: async () => [], listTracks: async () => [] },
    // 005 — an attendee who has saved nothing and written nothing, which is what both seeded
    // demo attendees actually start as. A test that wants otherwise says so explicitly.
    savedSessions: {
      listSaved: async () => [],
      save: async () => {},
      unsave: async () => {},
    },
    sessionNotes: {
      listNotes: async () => [],
      writeNote: async () => ({ sessionId: '', body: '', updatedAt: '' }),
      deleteNote: async () => {},
    },
    // 004 — an attendee who has authored nothing, which is what a newly created account is and
    // what the third seeded attendee stays as. A test that wants a populated profile says so.
    //
    // Every method resolves rather than throwing: a component test asserting a disabled
    // confirmation must not be able to pass because the repository blew up first.
    identity: {
      signUp: async () => {},
      joinConference: async () => ({ event: SUMMIT, alreadyRegistered: false }),
      withdrawFromConference: async () => {},
      verifyEmail: async () => {},
      resendVerification: async () => {},
      requestPasswordReset: async () => {},
      resetPassword: async () => {},
      exportPersonalData: async () => ({}),
      deleteAccount: async () => {},
    },
    profile: {
      getOwn: async () => EMPTY_PROFILE,
      saveOwn: async (draft) => ({ ...EMPTY_PROFILE, ...(draft as object) }),
      setDiscoverable: async (discoverable) => ({
        discoverable,
        emailVerified: false,
        // FR-359 — unverified means invisible whatever the flag says. The default double
        // deliberately reproduces that, so a test that assumes turning it on makes you visible
        // fails here rather than in production.
        effectivelyVisible: false,
      }),
      readOwnAvatar: async () => null,
      uploadAvatar: async () => {},
      removeAvatar: async () => {},
    },
    // 006 — a conference where nobody else is discoverable, which is what an empty page is and
    // what every seeded conference looks like before a second attendee turns discoverability
    // on. An empty directory is a valid answer, not a failure, so the default resolves.
    directory: {
      list: async () => ({ attendees: [], nextCursor: null }),
      get: async () => null,
      readAvatar: async () => null,
    },
    // 007 — an attendee who has spoken to nobody, blocked nobody and registered no device,
    // which is what every account is until it is not. Every method resolves rather than
    // throwing, for the reason 004's defaults record: a component test asserting a disabled
    // send button must not be able to pass because the repository blew up first.
    conversations: {
      list: async () => [],
      // **False, deliberately.** Home's unread indicator renders nothing at zero (FR-531), so
      // the quiet default is also the one that keeps unrelated Home tests honest about what
      // they are asserting.
      hasUnread: async () => false,
      openWith: async () => ({
        conversationId: 'conversation-1',
        messageId: 'message-1',
        sentAt: '2026-09-14T09:00:00.000Z',
      }),
      markRead: async () => {},
    },
    messages: {
      list: async () => ({
        messages: [],
        nextCursor: null,
        state: 'open' as const,
        // 007 — carried on the page (contract), so the thread's header, the composer's
        // availability and the safety dialogs are satisfied by one request. `null` is the
        // departed-counterpart case; the default here is simply "not loaded anybody".
        counterpart: null,
      }),
      send: async () => ({ messageId: 'message-1', sentAt: '2026-09-14T09:00:00.000Z' }),
    },
    blocks: { list: async () => [], block: async () => {}, unblock: async () => {} },
    reports: { submit: async () => {} },
    pushSubscriptions: { register: async () => {}, unregister: async () => {} },
    // ─────────────────────────────────────────────────────────────────────────────────────
    // 008 — an attendee who holds nobody's card and has arranged no meetings, which is what
    // every account is until somebody hands them one. **Nothing here is seeded**, deliberately,
    // so this default is also what a reviewer sees on first run — which is why the two empty
    // states are the ones most worth having tests for.
    //
    // Every method resolves rather than throwing, for the reason 004's defaults record: a
    // component test asserting a *disabled* confirmation must not be able to pass because the
    // repository blew up first.
    // ─────────────────────────────────────────────────────────────────────────────────────
    cards: {
      share: async () => ({
        attendeeId: 'attendee-grace',
        displayName: 'Grace Hopper',
        eventId: SUMMIT.id,
        eventName: SUMMIT.name,
        sharedAt: '2026-09-14T09:00:00.000Z',
      }),
      listHeld: async () => [],
      getHeld: async () => {
        throw new Error('no card held')
      },
      listShared: async () => [],
    },
    appointments: {
      // An empty slot list is a **legitimate** answer, not a failure (FR-627) — but it is not
      // the useful default, because it renders the no-slots state rather than the grid. A test
      // wanting to exercise the dialog says so explicitly.
      slots: async () => [],
      propose: async () => {
        throw new Error('no appointment proposed')
      },
      list: async () => [],
      accept: async () => {
        throw new Error('no appointment accepted')
      },
      decline: async () => {
        throw new Error('no appointment declined')
      },
      cancel: async () => {
        throw new Error('no appointment cancelled')
      },
    },
    ...overrides,
  },
  // 005 — content is live in a component test unless a test says otherwise, so no staleness
  // stamp is rendered. `null` is the honest default: nothing here is served from a cache.
  freshness: { lastRetrieved: () => null },
  auth: { signIn: async () => {}, signOut: async () => {} },
  ...rest,
})

/**
 * The registry, plus the authenticated context the real application always has above it.
 *
 * `AuthProvider` is included because a card that greets the signed-in attendee is not an
 * unusual card — it is the lead one — and a harness without it would make every such card throw
 * for a reason that has nothing to do with what is being tested.
 */
export const WithServices = ({
  children,
  services,
}: {
  children: ReactNode
  services?: PlatformServices
}) => (
  <PlatformProvider services={services ?? testServices()}>
    <AuthProvider>{children}</AuthProvider>
  </PlatformProvider>
)

/** Builds a session fixture with sensible defaults, so a test states only what it cares about. */
export const aSession = (overrides: Partial<TestSession> = {}): TestSession => ({
  id: 'session-1',
  title: 'Tokens Beyond Colour',
  summary: null,
  // 10:30 in Madrid on day one.
  startsAt: '2026-09-14T08:30:00.000Z',
  endsAt: '2026-09-14T09:30:00.000Z',
  track: { id: 'track-1', name: 'Design Systems', colorToken: 'track-design' },
  room: { id: 'room-1', name: 'Miró Room' },
  speakers: [{ id: 'speaker-1', name: 'Ingrid Halvorsen', title: null, company: 'Fjord Labs' }],
  ...overrides,
})

export interface TestSession {
  id: string
  title: string
  summary: string | null
  startsAt: string
  endsAt: string
  track: { id: string; name: string; colorToken: string }
  room: { id: string; name: string }
  speakers: Array<{ id: string; name: string; title: string | null; company: string | null }>
}
