import type {
  Appointment,
  AppointmentRepository,
  MeetingSlot,
  ProposeInput,
} from '../interfaces/appointments.js'
import type { HttpClient } from './client.js'

/**
 * T034 (008) — the HTTP appointment repository.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY ADDRESS HERE BEGINS `/events/{eventId}/`, AND THAT IS A SECURITY DECISION RATHER
 * THAN AN ORGANISING ONE** (FR-639, research R2).
 *
 * It is the exact opposite of `cards-repository.ts`, which sits one file over and names no
 * conference at all. The two are the two halves of this feature's scoping split.
 *
 * Appointments are **per-event**, so naming the conference in the path puts them inside the
 * guarantee that already exists: `apps/api/tests/unit/event-scope-audit.test.ts` *examines* a
 * route that names an event and demands `requireEventAccess` on it. Addressing them as
 * `/appointments/{id}` instead would name no conference, and that audit would **silently pass
 * them** — the exact hole cards need a third audit to close.
 *
 * Do not "tidy" these paths shorter. The nesting is the protection.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The refusals differ deliberately, and this class preserves the difference by doing nothing
 * with it.** A blocked proposal is a **reasonless** 409 (FR-637); an acceptance that would
 * double-book the reader is a 409 **carrying an explanation** (FR-633a). Those are not
 * inconsistent: the second describes the reader's own schedule to the reader, so it discloses
 * nothing about anybody else, while the first would confirm a block if it said anything at all.
 *
 * **No method takes the acting attendee's identifier.** The proposer, the invitee answering, and
 * the party cancelling are all the sign-in session's attendee. The identifier `slots` and
 * `propose` carry names the other person.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The wire shape. Identical to `Appointment` — there is no avatar to decode, so unlike the
 * conversation and directory repositories this one needs no conversion step at all.
 */
type AppointmentBody = Appointment

interface SlotsBody {
  readonly slots: readonly MeetingSlot[]
}

interface AppointmentListBody {
  readonly appointments: readonly AppointmentBody[]
}

/**
 * Encoded once, so no call site can forget and no identifier can escape into the path.
 *
 * **The conference is always the first segment.** See the file header for why that is not a
 * stylistic choice.
 */
const eventPath = (eventId: string, rest = ''): string =>
  `/events/${encodeURIComponent(eventId)}/appointments${rest}`

export class HttpAppointmentRepository implements AppointmentRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * **No invitee is sent, because there is nowhere to send one** (FR-626, SC-605).
   *
   * The offered set is computed from the reader's own commitments alone. An earlier shape passed
   * the invitee as a query parameter "for the title" — which the dialog never used — putting an
   * attendee identifier into every access log and leaving a hook somebody could later wire into
   * the computation. The guarantee is stronger when the value does not cross the wire.
   */
  async slots(eventId: string): Promise<MeetingSlot[]> {
    const body = await this.#http.request<SlotsBody>(eventPath(eventId, '/slots'))
    return [...body.slots]
  }

  async propose(eventId: string, input: ProposeInput): Promise<Appointment> {
    const body = await this.#http.request<AppointmentBody>(eventPath(eventId), {
      method: 'POST',
      body: JSON.stringify({
        inviteeId: input.attendeeId,
        slotId: input.slotId,
        topic: input.topic,
      }),
    })
    return body
  }

  async list(eventId: string): Promise<Appointment[]> {
    const body = await this.#http.request<AppointmentListBody>(eventPath(eventId))
    return [...body.appointments]
  }

  /**
   * The three answers, each a `POST` to a named sub-address rather than a `PATCH` carrying a
   * status.
   *
   * A `PATCH …/{id}` with `{ status }` would make the four transitions look interchangeable, and
   * they are not: **only the invitee may accept or decline** (FR-635) while **either party may
   * cancel** (FR-632), and declining frees the slot for one person where cancelling frees it for
   * two (FR-633). Naming each act gives the server three separate authorization decisions to
   * make instead of one branch on a value the client chose.
   */
  async accept(eventId: string, appointmentId: string): Promise<Appointment> {
    return this.#answer(eventId, appointmentId, 'accept')
  }

  async decline(eventId: string, appointmentId: string): Promise<Appointment> {
    return this.#answer(eventId, appointmentId, 'decline')
  }

  async cancel(eventId: string, appointmentId: string): Promise<Appointment> {
    return this.#answer(eventId, appointmentId, 'cancel')
  }

  async #answer(
    eventId: string,
    appointmentId: string,
    action: 'accept' | 'decline' | 'cancel',
  ): Promise<Appointment> {
    const path = eventPath(eventId, `/${encodeURIComponent(appointmentId)}/${action}`)
    return this.#http.request<AppointmentBody>(path, { method: 'POST' })
  }
}
