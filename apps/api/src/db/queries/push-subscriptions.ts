import { sql } from 'drizzle-orm'

import type { StoredSubscription } from '../../notifications/service.js'
import { getDb } from '../client.js'

/**
 * T111 (007) — where an attendee's devices are reachable (FR-555–FR-558).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO FUNCTION HERE TAKES A CALLER-SUPPLIED ATTENDEE IDENTIFIER** (FR-525). The attendee comes
 * from the sign-in session at the request boundary, and the one function that reads *somebody
 * else's* devices — `subscriptionsFor`, on the send path — is handed a recipient the server
 * resolved from a conversation the sender demonstrably participates in.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Register a device, or **re-point an existing endpoint at this attendee** (FR-555).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE UPSERT IS ON `endpoint`, NOT ON `(attendee_id, endpoint)`, AND THE DIFFERENCE IS A
 * CROSS-ACCOUNT LEAK.**
 *
 * The obvious key is the pair, and it is wrong. The same browser profile signed into two accounts
 * in turn produces the **same endpoint** — it is a property of the browser installation, not of
 * the session. Keyed on the pair, the first account's row survives, and the push service happily
 * delivers *one attendee's messages using another attendee's registration*: a shared laptop at a
 * conference receiving somebody else's correspondence, looking for all the world like a caching
 * bug.
 *
 * Keyed on the endpoint alone, re-registering **reassigns** it. The device belongs to whoever
 * holds it now, which is the only answer that is true.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The keys are re-written on conflict as well as the owner: a browser that renews a subscription
 * may keep the endpoint and rotate the keys, and a stale key encrypts a payload the device cannot
 * open — a delivery that succeeds and arrives as nothing.
 */
export const registerSubscription = async (
  attendeeId: string,
  subscription: StoredSubscription,
): Promise<{ created: boolean }> => {
  const rows = await getDb().execute<{ created: boolean }>(sql`
    INSERT INTO push_subscriptions (attendee_id, endpoint, p256dh_key, auth_key)
    VALUES (
      ${attendeeId}::uuid,
      ${subscription.endpoint},
      ${subscription.p256dhKey},
      ${subscription.authKey}
    )
    ON CONFLICT (endpoint) DO UPDATE SET
      attendee_id = excluded.attendee_id,
      p256dh_key = excluded.p256dh_key,
      auth_key = excluded.auth_key,
      -- Reset: a re-registered endpoint has no delivery history under its new owner, and the
      -- last_delivered_at column is how a stale registration is recognised later.
      last_delivered_at = NULL
    RETURNING (xmax = 0) AS created
  `)

  // `xmax = 0` is true only for a genuine insert, which is how the route answers 201 against 200
  // without a second read. A re-registration is not an error and not a new device.
  return { created: rows[0]?.created === true }
}

/**
 * Surrender **this device only** (FR-556).
 *
 * Idempotent, and scoped to the caller: an endpoint that is not theirs is not theirs to remove,
 * and unscoped this would let anybody who learned an endpoint unregister somebody else's phone.
 * Every other device the attendee has registered is untouched.
 */
export const unregisterSubscription = async (
  attendeeId: string,
  endpoint: string,
): Promise<void> => {
  await getDb().execute(sql`
    DELETE FROM push_subscriptions
    WHERE attendee_id = ${attendeeId}::uuid AND endpoint = ${endpoint}
  `)
}

/**
 * Every device this attendee can be reached on. The send path fans out to all of them.
 *
 * A person with a phone and a laptop has two, and one of them is frequently stale — which is why
 * `dispatchToDevices` isolates failures per device rather than per attendee.
 */
export const subscriptionsFor = async (attendeeId: string): Promise<StoredSubscription[]> => {
  const rows = await getDb().execute<{
    endpoint: string
    p256dh_key: string
    auth_key: string
  }>(sql`
    SELECT endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE attendee_id = ${attendeeId}::uuid
    ORDER BY created_at
  `)

  return rows.map((row) => ({
    endpoint: row.endpoint,
    p256dhKey: row.p256dh_key,
    authKey: row.auth_key,
  }))
}

/**
 * T-review (014) — every device for **many** attendees, in one query.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SINGULAR VERSION IN A LOOP IS ONE QUERY PER RECIPIENT, AND 014's FAN-OUT HAS AS MANY
 * RECIPIENTS AS THE SESSION HAS SAVERS.**
 *
 * 007's send path reaches one attendee, so `subscriptionsFor` was exactly right and still is —
 * it remains the function the message path uses. A saved-session change reaches everybody who
 * saved the session, and at a keynote that is hundreds of round trips before a single
 * notification is sent.
 *
 * Grouped into a `Map` here rather than returned flat, because the caller dispatches **per
 * attendee** — one coalesced notification each (FR-1034) — and a flat list would put the grouping
 * in the caller, where a second caller could get it wrong. `attendeesToNotify` groups for the
 * same reason and says so.
 *
 * An attendee with no registration is **absent from the map rather than present with an empty
 * array**, which is what lets the caller distinguish "has no device" from "has devices" without
 * a second check. That distinction is the whole of FR-1032: an attendee who denied permission
 * still gets the in-app marker, and the dispatcher must simply skip them.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const subscriptionsForMany = async (
  attendeeIds: readonly string[],
): Promise<Map<string, StoredSubscription[]>> => {
  const byAttendee = new Map<string, StoredSubscription[]>()
  if (attendeeIds.length === 0) return byAttendee

  const rows = await getDb().execute<{
    attendee_id: string
    endpoint: string
    p256dh_key: string
    auth_key: string
  }>(sql`
    SELECT attendee_id, endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE attendee_id = ANY(${sql.param([...attendeeIds])}::uuid[])
    ORDER BY attendee_id, created_at
  `)

  for (const row of rows) {
    const devices = byAttendee.get(row.attendee_id) ?? []
    devices.push({
      endpoint: row.endpoint,
      p256dhKey: row.p256dh_key,
      authKey: row.auth_key,
    })
    byAttendee.set(row.attendee_id, devices)
  }

  return byAttendee
}

/**
 * Discard subscriptions the push service reported as permanently gone (FR-557).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Only ever called with endpoints that answered `'gone'`**, never with ones that merely failed.
 * `dispatch.ts` records the asymmetry that makes that important: over-retrying a dead endpoint
 * costs a request, while wrongly discarding a live one silently stops that person receiving
 * anything ever again.
 *
 * Not scoped to an attendee, deliberately: an endpoint is globally unique, the push service has
 * declared *the endpoint itself* finished, and a row that survived because it had since been
 * reassigned would be a registration nothing could ever deliver to.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const discardSubscriptions = async (endpoints: readonly string[]): Promise<void> => {
  if (endpoints.length === 0) return

  await getDb().execute(sql`
    DELETE FROM push_subscriptions
    WHERE endpoint IN (
      SELECT value FROM json_array_elements_text(${JSON.stringify([...endpoints])}::json)
    )
  `)
}

/** Records a successful delivery, which is how a stale registration is recognised later. */
export const recordDelivery = async (endpoints: readonly string[]): Promise<void> => {
  if (endpoints.length === 0) return

  await getDb().execute(sql`
    UPDATE push_subscriptions SET last_delivered_at = now()
    WHERE endpoint IN (
      SELECT value FROM json_array_elements_text(${JSON.stringify([...endpoints])}::json)
    )
  `)
}
