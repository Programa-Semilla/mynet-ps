/**
 * T038 — the six device capability interfaces (constitution Principle V, FR-043).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The names are fixed by the constitution and are **not** open to restyling:
 * `NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`,
 * `SecureStorage`, `ConnectivityService`. Not pluralised, not suffixed with `Provider`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Application code calls these, never a browser API. `mynet/no-direct-platform-access`
 * counts the violations, and SC-008 requires that count to be zero.
 *
 * The point is not indirection for its own sake. It is that a later native move becomes a
 * packaging change rather than a rewrite, and that every one of these is substitutable in a
 * test without touching feature code (FR-047, User Story 5).
 */

/**
 * Notification delivery.
 *
 * **Out of product scope until a recorded decision brings it in** (constitution, Technology
 * and Architecture Constraints; T107). The interface exists so that feature code has
 * something to call; the implementation MUST NOT be wired to real delivery. `requestPermission`
 * returning 'unsupported' is a defined result, not a stub that failed.
 */
export interface NotificationService {
  isSupported(): boolean
  requestPermission(): Promise<'granted' | 'denied' | 'unsupported'>
  /** Resolves when the notification has been handed off, or immediately when unsupported. */
  show(notification: { title: string; body: string; tag?: string }): Promise<void>
}

/**
 * Calendar integration.
 *
 * **Also out of scope until a recorded decision** (T107). Appointments exist in MyNet's own
 * data; exporting them to a device calendar is a separate capability nobody has asked for yet.
 */
export interface CalendarService {
  isSupported(): boolean
  addEvent(event: {
    title: string
    startsAt: Date
    endsAt: Date
    location?: string
    notes?: string
  }): Promise<void>
}

/** Camera access — for scanning a badge or capturing an avatar in a later slice. */
export interface CameraService {
  isSupported(): boolean
  capturePhoto(): Promise<Blob | null>
}

/**
 * Sharing a digital business card (a MyNet domain concept — see CLAUDE.md terminology).
 *
 * What a card exchange *records* is constitution Open Question 8 and is not decided here.
 * This interface covers only the act of sharing.
 */
export interface ContactShareService {
  isSupported(): boolean
  /** Resolves true when shared, false when the attendee dismissed the share sheet. */
  shareCard(card: {
    name: string
    title?: string
    company?: string
    url?: string
  }): Promise<boolean>
}

/**
 * Client-side secret storage.
 *
 * **MUST NOT be used as a general cache** (constitution, Persistence). In this slice nothing
 * uses it: the sign-in token lives in an HttpOnly cookie precisely so that no client code —
 * including this interface — can reach it.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  /** Clears everything this application stored. Used at sign-out (FR-056). */
  clear(): Promise<void>
}

/**
 * Online/offline state (FR-054).
 *
 * `subscribe` returns an unsubscribe function rather than exposing an event-emitter, so a
 * consumer cannot leak a listener by forgetting which removal call matches which addition.
 */
export interface ConnectivityService {
  isOnline(): boolean
  subscribe(listener: (online: boolean) => void): () => void
}

/** Every device capability, in one shape (research.md D10). */
export interface DeviceServices {
  readonly notifications: NotificationService
  readonly calendar: CalendarService
  readonly camera: CameraService
  readonly contactShare: ContactShareService
  readonly secureStorage: SecureStorage
  readonly connectivity: ConnectivityService
}
