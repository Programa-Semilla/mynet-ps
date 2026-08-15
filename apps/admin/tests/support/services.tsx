import type {
  AdminConference,
  AdminIdentity,
  AdminProgramme,
  AdminReportDetail,
  AdminReportSummary,
  AdminSession,
} from '@mynet/data'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

import { AdminSessionProvider } from '../../src/app/session.js'
import type { AdminServices } from '../../src/app/services.js'

/**
 * The component-test seam for the administrative client.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE WHOLE BOUNDARY IS ONE OBJECT, AND SUBSTITUTING IT IS ONE LINE.**
 *
 * That is `apps/web`'s `tests/support/services.tsx` reasoning, and it holds here for a smaller
 * surface: three repositories, no device capabilities and no cache. Nothing below `AdminApp`
 * knows that HTTP exists, so no test here mocks a module, stubs `fetch`, or reaches into a
 * component — and if that ever became awkward, the abstraction would have failed.
 *
 * `apps/admin` takes **no** `@mynet/platform` dependency (research R9), so there is no device
 * registry to fake. The attendee client's equivalent file has to construct seven no-op
 * capabilities; this one has none, which is Principle V satisfied by subtraction rather than a
 * gap in the harness.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const unexpected = (name: string) => () => {
  // Loud rather than silent: a screen calling something this test did not stub is a screen doing
  // something the test does not know about, and returning an empty result would hide it.
  throw new Error(`${name} was called but this test did not provide it`)
}

/**
 * Overrides are **partial per repository**, not per registry.
 *
 * `Partial<AdminServices>` would demand a whole repository for every stub, so a test that only
 * needs `reports.list` would have to restate the three methods it does not use — and each
 * restatement is a place the double drifts from the interface. Mapping over the members instead
 * keeps a stub to exactly the methods the screen under test actually calls, which is what makes
 * `unexpected` above meaningful.
 */
type ServiceOverrides = {
  readonly [K in keyof AdminServices]?: Partial<AdminServices[K]>
}

export const stubServices = (overrides: ServiceOverrides = {}): AdminServices => ({
  session: {
    signIn: unexpected('session.signIn'),
    signOut: unexpected('session.signOut'),
    me: unexpected('session.me'),
    replaceCredential: unexpected('session.replaceCredential'),
    ...overrides.session,
  },
  reports: {
    list: unexpected('reports.list'),
    detail: unexpected('reports.detail'),
    resolve: unexpected('reports.resolve'),
    removeQuestion: unexpected('reports.removeQuestion'),
    ...overrides.reports,
  },
  conferences: {
    list: unexpected('conferences.list'),
    promote: unexpected('conferences.promote'),
    demote: unexpected('conferences.demote'),
    deactivateOperator: unexpected('conferences.deactivateOperator'),
    ...overrides.conferences,
  },
  // 014 — the fourth repository. Every member throws by default, for the reason `unexpected`
  // records: a screen calling something a test did not stub is a screen doing something the test
  // does not know about, and this one has seventeen members.
  catalog: {
    programme: unexpected('catalog.programme'),
    createTrack: unexpected('catalog.createTrack'),
    updateTrack: unexpected('catalog.updateTrack'),
    deleteTrack: unexpected('catalog.deleteTrack'),
    createRoom: unexpected('catalog.createRoom'),
    updateRoom: unexpected('catalog.updateRoom'),
    deleteRoom: unexpected('catalog.deleteRoom'),
    createSpeaker: unexpected('catalog.createSpeaker'),
    updateSpeaker: unexpected('catalog.updateSpeaker'),
    deleteSpeaker: unexpected('catalog.deleteSpeaker'),
    createSession: unexpected('catalog.createSession'),
    updateSession: unexpected('catalog.updateSession'),
    deleteSession: unexpected('catalog.deleteSession'),
    cancelSession: unexpected('catalog.cancelSession'),
    reinstateSession: unexpected('catalog.reinstateSession'),
    patchConference: unexpected('catalog.patchConference'),
    createConference: unexpected('catalog.createConference'),
    // 014 tranche 2 (T146) — the enrolment roster. Unstubbed like every other member, which
    // is what proved `patchConference` unreachable for a whole tranche: a screen calling a
    // method a test did not provide must fail that test, never quietly render nothing.
    listEnrolments: unexpected('catalog.listEnrolments'),
    ...overrides.catalog,
  },
  // 014 tranche 2 — the fifth repository. Every member throws by default, for the reason
  // `unexpected` records — and it is what makes a screen that quietly calls a vocabulary
  // method a test failure rather than a silent success (R20's `patchConference` finding).
  vocabulary: {
    sectors: unexpected('vocabulary.sectors'),
    subsectors: unexpected('vocabulary.subsectors'),
    interests: unexpected('vocabulary.interests'),
    createSector: unexpected('vocabulary.createSector'),
    renameSector: unexpected('vocabulary.renameSector'),
    retireSector: unexpected('vocabulary.retireSector'),
    unretireSector: unexpected('vocabulary.unretireSector'),
    deleteSector: unexpected('vocabulary.deleteSector'),
    createSubsector: unexpected('vocabulary.createSubsector'),
    renameSubsector: unexpected('vocabulary.renameSubsector'),
    retireSubsector: unexpected('vocabulary.retireSubsector'),
    unretireSubsector: unexpected('vocabulary.unretireSubsector'),
    deleteSubsector: unexpected('vocabulary.deleteSubsector'),
    createInterest: unexpected('vocabulary.createInterest'),
    renameInterest: unexpected('vocabulary.renameInterest'),
    retireInterest: unexpected('vocabulary.retireInterest'),
    unretireInterest: unexpected('vocabulary.unretireInterest'),
    deleteInterest: unexpected('vocabulary.deleteInterest'),
    ...overrides.vocabulary,
  },
})

/** A programme fixture with sensible defaults, so a test states only what it cares about (014). */
export const programme = (
  over: Omit<Partial<AdminProgramme>, 'conference'> & {
    // Deep-partial for the conference alone (014 tranche 2): a modality test should state the
    // modality and nothing else, not restate nine fields it does not care about.
    readonly conference?: Partial<AdminProgramme['conference']>
  } = {},
): AdminProgramme => ({
  conference: {
    id: 'event-1',
    name: 'A Conference',
    location: 'A Venue',
    startsOn: '2027-03-01',
    endsOn: '2027-03-03',
    timezone: 'UTC',
    joinCode: 'JOINCODE',
    timezoneEditable: true,
    // 014 tranche 2 — in-person is the back-filled value every pre-existing programme already
    // satisfies (FR-1048), so it is the fixture default; a test about links overrides it.
    modality: 'in-person',
    format: null,
    ...over.conference,
  },
  tracks: over.tracks ?? [{ id: 'track-1', name: 'Design', colorToken: 'track-design' }],
  rooms: over.rooms ?? [{ id: 'room-1', name: 'Hall A' }],
  speakers: over.speakers ?? [],
  sessions: over.sessions ?? [],
})

/** One session on the programme. Not cancelled and untouched, unless a test says otherwise. */
export const adminSession = (over: Partial<AdminSession> = {}): AdminSession => ({
  id: 'session-1',
  title: 'Opening Keynote',
  summary: null,
  startsAt: '2027-03-01T09:00:00.000Z',
  endsAt: '2027-03-01T10:00:00.000Z',
  trackId: 'track-1',
  roomId: 'room-1',
  accessLink: null,
  speakerIds: [],
  cancelledAt: null,
  // 014 tranche 2 — mandatory with no bounds and no held places, matching the back-fill every
  // pre-existing session received (FR-1060). `placesHeld` sits BESIDE the engagement counts,
  // never inside them (research R15).
  kind: 'mandatory',
  capacity: null,
  enrolmentClosingOffsetHours: null,
  engagement: { saved: 0, notes: 0, questions: 0, votes: 0 },
  placesHeld: 0,
  ...over,
})

/** A signed-in principal of the given tier, with the credential already replaced. */
export const identity = (tier: 'platform' | 'organizer'): AdminIdentity => ({
  displayName: tier === 'platform' ? 'A Platform Operator' : 'A Conference Organizer',
  tier,
  credentialIsInitial: false,
})

export const reportSummary = (over: Partial<AdminReportSummary> = {}): AdminReportSummary => ({
  id: '00000000-0000-4000-8000-000000000001',
  reporterName: 'The Reporter',
  reportedName: 'The Reported',
  reportedAt: '2026-08-11T09:00:00.000Z',
  kind: 'questions',
  resolution: null,
  ...over,
})

export const reportDetail = (over: Partial<AdminReportDetail> = {}): AdminReportDetail => ({
  ...reportSummary(),
  reason: 'What the reporter said.',
  contentAvailable: true,
  content: [{ id: '00000000-0000-4000-8000-0000000000aa', body: 'The reported question.' }],
  ...over,
})

export const conference = (over: Partial<AdminConference> = {}): AdminConference => ({
  id: '00000000-0000-4000-8000-000000000010',
  name: 'A Conference',
  organizers: [],
  unassigned: true,
  ...over,
})

/**
 * Renders a subtree inside the session provider, with the session already resolved.
 *
 * `session.me` is stubbed to the given identity rather than the state being injected, because the
 * provider reading it is the thing under test in `sign-in.test.tsx` and faking the state would
 * make that test assert its own fixture.
 */
export const withSession = (
  children: ReactNode,
  services: AdminServices,
  initialEntry = '/',
): ReactNode => (
  <MemoryRouter initialEntries={[initialEntry]}>
    <AdminSessionProvider services={services}>{children}</AdminSessionProvider>
  </MemoryRouter>
)
