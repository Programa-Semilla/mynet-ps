import { OfflineError, RequestRefusedError, type OwnProfile } from '@mynet/data'
import { useProfileRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { asAvailability, asNetworkingIntent, AVAILABILITY_LABELS, INTENT_LABELS } from './labels.js'

/**
 * T074 (004) — editing the profile (FR-337, FR-338).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY LIMIT IS SURFACED AS IT IS APPROACHED, AND A FIELD OVER ITS LIMIT LEAVES
 * CONFIRMATION DISABLED WITH THE REASON STATED** (FR-337, FR-338).
 *
 * Two requirements, and they only work together. A disabled confirmation without a stated
 * reason replaces a post-submit error with a mystery; a stated limit with an enabled
 * confirmation lets somebody submit something that will be refused. Both are here, and the
 * remaining-characters count is announced politely rather than shouted, so a screen-reader user
 * hears it as they approach rather than only once they are over.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Mirrors `PROFILE_LIMITS` in `apps/api/src/db/schema/profiles.ts`.
 *
 * Exported so `tests/unit/client-limits.test.ts` can hold it to the published contract — see
 * the note on `PASSWORD_MIN_LENGTH` in `auth/SignUp.tsx` for why a comment was not enough.
 */
export const LIMITS = {
  company: 120,
  role: 120,
  headline: 200,
  interest: 60,
  interestCount: 12,
} as const

/** How close to a limit before the remaining count appears. Silent until it is worth saying. */
const WARN_WITHIN = 20

type Draft = {
  company: string
  role: string
  headline: string
  networkingIntent: string
  availability: string
  interests: string
}

const toDraft = (profile: OwnProfile): Draft => ({
  company: profile.company ?? '',
  role: profile.role ?? '',
  headline: profile.headline ?? '',
  networkingIntent: profile.networkingIntent ?? '',
  availability: profile.availability ?? '',
  // One comma-separated field rather than a tag editor: interests are a bounded list of short
  // free-text values (Assumptions), and a bespoke chip control would be a lot of interaction
  // surface for something a text field expresses honestly.
  interests: profile.interests.join(', '),
})

const parseInterests = (value: string): string[] =>
  value
    .split(',')
    .map((interest) => interest.trim())
    .filter((interest) => interest.length > 0)

export const ProfileEdit = () => {
  const repository = useProfileRepository()
  const navigate = useNavigate()

  const companyId = useId()
  const roleId = useId()
  const headlineId = useId()
  const intentId = useId()
  const availabilityId = useId()
  const interestsId = useId()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadFailure, setLoadFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // The await first, so the state write sits behind an async boundary — see `Profile.tsx`.
      const profile = await repository.getOwn()
      setDraft(toDraft(profile))
    } catch (error) {
      setLoadFailure(
        error instanceof OfflineError
          ? 'Editing your profile needs a connection. It is not stored on this device.'
          : 'Could not load your profile. Try again in a moment.',
      )
    }
  }, [repository])

  useEffect(() => {
    // Every state write inside `load` happens after an await, so this is not the synchronous
    // cascade the rule targets — the rule cannot see through a `useCallback` boundary to tell,
    // which is the same reason `auth/useAuth.tsx` carries this exemption twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const interests = draft ? parseInterests(draft.interests) : []

  /**
   * Why confirmation is disabled, in words — or `null` when nothing is wrong.
   *
   * Ordered so the message is about the field the person is most likely working on rather than
   * the first one in the form.
   */
  const blockedBecause = ((): string | null => {
    if (!draft || saving) return null

    for (const [field, label, limit] of [
      ['headline', 'Your headline', LIMITS.headline],
      ['company', 'Your company', LIMITS.company],
      ['role', 'Your role', LIMITS.role],
    ] as const) {
      const over = draft[field].trim().length - limit
      if (over > 0)
        return `${label} is ${over} character${over === 1 ? '' : 's'} over the limit of ${limit}.`
    }

    const long = interests.find((interest) => interest.length > LIMITS.interest)
    if (long) return `“${long.slice(0, 24)}…” is longer than ${LIMITS.interest} characters.`

    if (interests.length > LIMITS.interestCount) {
      return `You have ${interests.length} interests. The limit is ${LIMITS.interestCount}.`
    }

    return null
  })()

  const canSave = Boolean(draft) && !blockedBecause && !saving

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave || !draft) return

    setSaving(true)
    setFailure(null)

    try {
      await repository.saveOwn({
        company: draft.company.trim() || null,
        role: draft.role.trim() || null,
        headline: draft.headline.trim() || null,
        // T011 (006) — narrowed by a membership check rather than asserted (SC-414). A
        // `<select>` yields `string`; `asNetworkingIntent` returns the union member or `null`.
        networkingIntent: asNetworkingIntent(draft.networkingIntent),
        availability: asAvailability(draft.availability),
        interests: parseInterests(draft.interests),
      })
      await navigate('/profile')
    } catch (error) {
      // Offline is distinguished from a server fault, and **everything typed stays on screen**
      // — nothing is queued and nothing is reported as saved (Offline declaration).
      setFailure(
        error instanceof OfflineError
          ? 'Saving needs a connection. Nothing has been sent — your changes are still here, and you can save once you reconnect.'
          : error instanceof RequestRefusedError
            ? error.message
            : 'Could not save your profile. Nothing has changed — try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loadFailure) {
    return (
      <section className="px-4 py-6 tablet:px-6">
        <p
          role="alert"
          className="max-w-2xl rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
        >
          {loadFailure}
        </p>
      </section>
    )
  }

  if (!draft) {
    return (
      <section className="px-4 py-6 tablet:px-6">
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Loading your profile…
        </p>
      </section>
    )
  }

  const set = (field: keyof Draft) => (value: string) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current))

  return (
    <section aria-labelledby="profile-edit-heading" className="px-4 py-6 tablet:px-6">
      <div className="max-w-2xl">
        <h1
          id="profile-edit-heading"
          className="mb-1 font-display text-xl font-semibold text-text-primary"
        >
          Edit your profile
        </h1>
        <p className="mb-6 text-sm text-text-muted">
          Every field is optional. What you write here is what other attendees see.
        </p>

        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <TextField
            id={headlineId}
            label="Headline"
            hint="One line about what you do, or what you are here for."
            value={draft.headline}
            limit={LIMITS.headline}
            onChange={set('headline')}
          />
          <TextField
            id={companyId}
            label="Company"
            value={draft.company}
            limit={LIMITS.company}
            onChange={set('company')}
          />
          <TextField
            id={roleId}
            label="Role"
            value={draft.role}
            limit={LIMITS.role}
            onChange={set('role')}
          />

          <div className="mb-4">
            <label htmlFor={intentId} className="mb-1 block text-sm font-medium text-text-primary">
              Networking intent
            </label>
            <select
              id={intentId}
              value={draft.networkingIntent}
              onChange={(event) => set('networkingIntent')(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            >
              <option value="">Not stated</option>
              {Object.entries(INTENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label
              htmlFor={availabilityId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Availability
            </label>
            <select
              id={availabilityId}
              value={draft.availability}
              onChange={(event) => set('availability')(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            >
              <option value="">Not stated</option>
              {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label
              htmlFor={interestsId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Interests
            </label>
            <input
              id={interestsId}
              type="text"
              value={draft.interests}
              onChange={(event) => set('interests')(event.target.value)}
              aria-describedby={`${interestsId}-hint`}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            <p id={`${interestsId}-hint`} className="mt-1 text-xs text-text-muted">
              Separated by commas. Up to {LIMITS.interestCount}, each up to {LIMITS.interest}{' '}
              characters. You have {interests.length}.
            </p>
          </div>

          {failure && (
            <p
              role="alert"
              className="mb-4 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {failure}
            </p>
          )}

          {/* FR-338 — the reason, announced, so a disabled control is never a mystery. */}
          {blockedBecause && (
            <p role="status" aria-live="polite" className="mb-3 text-sm text-text-muted">
              {blockedBecause}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              onClick={() => void navigate('/profile')}
              className="rounded-sm border border-border-subtle px-4 py-2 font-medium text-text-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

/**
 * A labelled text field that **surfaces its limit as it is approached** (FR-337).
 *
 * Silent until the person is within `WARN_WITHIN` characters of the limit: a permanent counter
 * on every field is noise, and noise is what people learn to ignore. `aria-live="polite"` so it
 * is heard as it changes rather than only on focus.
 *
 * There is deliberately **no `maxLength`**. Truncating input silently discards what somebody
 * typed and gives them nothing to correct; letting them go over and saying so keeps the text and
 * explains the problem.
 */
const TextField = ({
  id,
  label,
  hint,
  value,
  limit,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  limit: number
  onChange: (value: string) => void
}) => {
  const remaining = limit - value.trim().length
  const showCount = remaining <= WARN_WITHIN
  const countId = `${id}-count`
  const hintId = `${id}-hint`

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={[hint ? hintId : null, showCount ? countId : null]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={remaining < 0 ? true : undefined}
        className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      )}
      {showCount && (
        <p
          id={countId}
          role="status"
          aria-live="polite"
          className={`mt-1 text-xs ${remaining < 0 ? 'text-danger-700' : 'text-text-muted'}`}
        >
          {remaining < 0
            ? `${-remaining} character${remaining === -1 ? '' : 's'} over the limit of ${limit}.`
            : `${remaining} character${remaining === 1 ? '' : 's'} left.`}
        </p>
      )}
    </div>
  )
}
