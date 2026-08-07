import type { PlatformServices } from '@mynet/platform'
import { PlatformProvider } from '@mynet/platform'
import type { ReactNode } from 'react'

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
    ...overrides,
  },
  auth: { signIn: async () => {}, signOut: async () => {} },
  ...rest,
})

export const WithServices = ({
  children,
  services,
}: {
  children: ReactNode
  services?: PlatformServices
}) => <PlatformProvider services={services ?? testServices()}>{children}</PlatformProvider>

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
