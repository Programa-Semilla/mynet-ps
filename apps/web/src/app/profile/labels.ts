import type { Availability, NetworkingIntent } from '@mynet/data'

/**
 * 004 — the words behind the stored values (FR-339).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The column stores `open_to_meetings`; the attendee reads "Open to meetings". Keeping the two
 * apart is what lets the wording change without a migration, and what stops a display string
 * becoming the thing 006 filters a directory on.
 *
 * Declared as a total `Record`, so adding an option to `NETWORKING_INTENTS` without a label
 * fails to compile rather than rendering a raw enum value at somebody.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const INTENT_LABELS: Record<NetworkingIntent, string> = {
  open_to_meetings: 'Open to meetings',
  open_to_messages: 'Open to messages',
  not_networking: 'Not looking to network right now',
}

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  busy: 'Busy',
}

/**
 * T011 (006) — **the two option sets as values, so a `<select>`'s string can be narrowed by a
 * check rather than by an assertion** (FR-496, SC-414).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A `<select>` hands back `string`, and the profile editor used to reach the stored union with
 * `(draft.networkingIntent || null) as OwnProfile['networkingIntent']`. That compiled whatever
 * the option list actually contained — so an option value mistyped in the markup would have
 * been sent to the server, refused by a `CHECK` constraint, and reported to the attendee as a
 * failure nobody could explain from the client.
 *
 * `find` returns the union member or `undefined`, which is a narrowing the compiler performs
 * rather than one it is told to accept. The `satisfies` clause keeps each tuple a subset of its
 * union, and the total `Record`s above keep it a *complete* subset: adding a member without a
 * label fails to compile, and a label without a member fails here.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const INTENTS = [
  'open_to_meetings',
  'open_to_messages',
  'not_networking',
] as const satisfies readonly NetworkingIntent[]

const AVAILABILITIES = ['available', 'busy'] as const satisfies readonly Availability[]

/** The stored value for a chosen option, or `null` for "unset" — never an unchecked assertion. */
export const asNetworkingIntent = (value: string): NetworkingIntent | null =>
  INTENTS.find((intent) => intent === value) ?? null

export const asAvailability = (value: string): Availability | null =>
  AVAILABILITIES.find((availability) => availability === value) ?? null

/**
 * T050, T086 (006) — **the label for a value that arrived over the wire, without an assertion.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The directory and the profile view render other attendees' networking intent, and both receive
 * it as `string | null` — the contract type is a plain string, because the client's domain type
 * is not the server's enum. Reaching the label with
 * `INTENT_LABELS[value as keyof typeof INTENT_LABELS]` compiles and returns `undefined` for
 * anything unexpected, which React renders as nothing at all: the field silently disappears from
 * the card and nobody finds out.
 *
 * That is the same class of unchecked cast FR-497 spent seventeen removals on, so it does not get
 * reintroduced here. `asNetworkingIntent` narrows by membership, and `null` is a value both
 * callers already handle — an attendee who has not set one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const intentLabelFor = (value: string | null): string | null => {
  const intent = value === null ? null : asNetworkingIntent(value)
  return intent === null ? null : INTENT_LABELS[intent]
}

export const availabilityLabelFor = (value: string | null): string | null => {
  const availability = value === null ? null : asAvailability(value)
  return availability === null ? null : AVAILABILITY_LABELS[availability]
}
