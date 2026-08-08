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

const noopDevices: PlatformServices['devices'] = {
  notifications: {
    isSupported: () => false,
    requestPermission: async () => 'unsupported',
    show: async () => {},
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
}

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
