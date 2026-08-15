import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T009 (007) — where a device can be reached with a notification (FR-550–FR-559).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT. A device does not attend a conference.**
 *
 * The subscription is a property of the browser installation, not of anything the attendee is
 * registered for, so there is no event that could scope it and no switch that should clear it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **PER DEVICE, NOT PER SESSION** (FR-555). Signing out does **not** drop a subscription — a
 * person who signs out on their phone still wants to hear about a reply. What drops one is
 * revoking permission in the browser, or a permanent delivery failure reported by the push
 * service (FR-557), or deleting the account.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This table exists because of an amendment that has not landed yet.** Register entry 10
 * places engagement notification delivery out of product scope; owner decision M4 reverses it,
 * and the constitution amendment enacting that reversal **gates merge of this branch**. The
 * table, its port and its sink adapter are all buildable and testable without it — what may
 * not happen before the amendment is shipping real delivery.
 *
 * Entry 10's surviving half is untouched and carried forward by FR-560: **the notification
 * bell must not be reproduced.** Nothing in this feature adds one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /**
     * The push service's delivery address for this device.
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **UNIQUE, and the second reason is the one that matters.**
     *
     * The obvious reason is that a device re-subscribing must *replace* its registration rather
     * than accumulate duplicates, so every delivery is not sent five times.
     *
     * The security reason: the same browser profile signed into two accounts in turn produces
     * the same endpoint. Without uniqueness the first account's row survives, and the push
     * service happily delivers **one attendee's messages using another attendee's
     * registration** — a cross-account leak that looks like a caching bug. The upsert on this
     * column is what re-points the device at whoever holds it now.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    endpoint: text('endpoint').notNull().unique(),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **THE TWO KEY COLUMNS BELOW ARE CREDENTIALS, NOT CONTENT.**
     *
     * They are the client's public key and auth secret, and together they grant the ability to
     * deliver an encrypted notification to this device. They are collected data, so
     * `export-coverage` demands they be classified — and the classification is **redacted
     * presence, never value** (research R14): the export says a subscription for this device
     * exists and when it was created, and does not reproduce the keys.
     *
     * Exporting them would hand over a *capability* rather than a record, and an export file is
     * something an attendee emails to themselves. This is the same distinction that keeps
     * password hashes out of the export, made explicit here because the columns look like
     * ordinary text.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    p256dhKey: text('p256dh_key').notNull(),

    authKey: text('auth_key').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * When something was last successfully delivered here, or null.
     *
     * Operational rather than behavioural: it is how a stale registration is recognised. It is
     * deliberately **not** a record of what was delivered — no notification content, no message
     * or conversation identifier ever lands in this table.
     */
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  },
  (table) => [
    /**
     * The send path fans out to every subscription the recipient holds — a person with a phone
     * and a laptop has two. **Postgres does not create an index for a foreign key**, and this
     * read happens once per delivered message.
     */
    index('push_subscriptions_attendee_id_idx').on(table.attendeeId),
  ],
)

export type PushSubscription = typeof pushSubscriptions.$inferSelect
