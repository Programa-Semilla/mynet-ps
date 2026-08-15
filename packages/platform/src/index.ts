/**
 * Device capability interfaces and the injected registry (constitution Principle V).
 *
 * Feature code imports from here and never from a browser API directly —
 * `mynet/no-direct-platform-access` counts the violations, and SC-008 requires zero.
 */
export type { CachedEntry, LocalCache } from './interfaces/local-cache.js'

export type {
  CalendarService,
  CameraService,
  ConnectivityService,
  ContactShareService,
  DeviceServices,
  // 007 — the domain shape a device registration takes across the port. Never the browser's own
  // `PushSubscription`, which would leak a platform type into every consumer.
  DeviceSubscription,
  // 016 — the eighth capability: whether this application is installed, and whether the platform
  // offers any way to install it. Argued in `interfaces/index.ts` rather than reached for
  // directly, and added to Principle V's enumerated list by constitution v5.1.0 — where, on
  // `VisibilityService`'s precedent below, the listing IS the ratification act.
  InstallService,
  InstallState,
  NotificationService,
  SecureStorage,
  // 007 — the seventh capability. Its addition is argued in `interfaces/index.ts` rather than
  // performed quietly, because the constitution named six when it was added.
  VisibilityService,
} from './interfaces/index.js'

export { PlatformProvider, PlatformContext } from './registry.js'
export type { ConferenceContent, PlatformServices, PlatformProviderProps } from './registry.js'

export {
  useActiveEventRepository,
  // 008 — the meetings you have arranged. Per-event and cached, which is the deliberate opposite
  // of `useCardRepository` below — see `hooks.ts` for why the two are separate hooks.
  useAppointmentRepository,
  useAttendeeRepository,
  useAuthGateway,
  // 007 — refusing contact.
  useBlockRepository,
  useCalendar,
  useCamera,
  // 008 — the cards you hold. Cross-event and deliberately uncached (FR-648).
  useCardRepository,
  useCatalogRepository,
  useConnectivity,
  useContactShare,
  // 007 — conversations, and what was said in them. Two hooks, following the interfaces: Home's
  // unread card needs the first and must never acquire the second.
  useConversationRepository,
  // 006 — the Discover directory.
  useDirectoryRepository,
  // 007 — whether the attendee is looking at this tab, for the open thread's poll (research R4).
  useDocumentVisible,
  useEventsRepository,
  useFreshness,
  useIdentityRepository,
  // 016 — the eighth capability: whether this application is installed and how (v5.1.0).
  useInstallState,
  useMessageRepository,
  useNotifications,
  useProfileRepository,
  // 007 — where this device is reachable for delivery.
  usePushSubscriptionRepository,
  // 009 — a session's audience questions. Per-event and deliberately uncached (FR-754), and its
  // own hook rather than part of the agenda's: notes are private to their author and this list is
  // public to the conference, which are opposites worth keeping apart at the call site.
  useQuestionsRepository,
  // 007 — reporting conduct out of the product. Write-only (FR-548).
  // T196 (014 tranche 2) — was `useSavedSessionRepository`; the set carries held places too.
  useCommitmentRepository,
  useReportRepository,
  useSecureStorage,
  useSessionNotesRepository,
  // 014 tranche 2 — the choosable vocabulary: cross-event reference data, deliberately uncached.
  useVocabularyRepository,
} from './hooks.js'
