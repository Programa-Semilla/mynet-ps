import {
  OfflineError,
  RequestRefusedError,
  type ChoosableVocabulary,
  type OwnProfile,
} from '@mynet/data'
import { useProfileRepository, useVocabularyRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { asAvailability, asNetworkingIntent, AVAILABILITY_LABELS, INTENT_LABELS } from './labels.js'

/**
 * T074 (004), T178 (014 tranche 2) — editing the profile (FR-337, FR-338, FR-1087, FR-1088,
 * FR-1090, FR-1091, FR-1095b).
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
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T178 — SECTOR, SUBSECTOR AND INTERESTS ARE CHOSEN, NEVER TYPED** (FR-1087, FR-1088).
 *
 * The interest field used to be comma-separated free text, and this rewrite is the reversal
 * that comment anticipated could not happen under Principle III — reversed by v4.0.0, delivered
 * here: a NEW value comes from the controlled vocabulary, so the controls are choosers and
 * there is no free-entry path at all. When the vocabulary has nothing to offer — the client's
 * lists do not exist yet (FR-1086) — the chooser renders an explanatory empty state rather
 * than a text input, because offering typing "meanwhile" would un-curate the list the moment
 * it arrived.
 *
 * **What the attendee already HOLDS is presented as present and removable, never silently
 * dropped** (FR-1095b). Whole-profile semantics make this load-bearing rather than polite: a
 * save omitting a held value REMOVES it, so a held-but-retired sector or a retained free-text
 * interest that the form quietly dropped would be erased by the next unrelated save. Held
 * values appear in their controls marked "(no longer offered)"; removing one is the attendee's
 * own act, and they are told they cannot choose it back.
 *
 * **A subsector travels with its sector** (FR-1087). Changing sector while a subsector of the
 * old one is chosen leaves confirmation disabled with the reason stated — resolving it is the
 * attendee's own act inside their own save, exactly as the server enforces, and there is no
 * administrative repair path.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Mirrors the published contract's bounds — held to it by `tests/unit/client-limits.test.ts`.
 * `sector` and `subsector` carry no client-side length bound because they are chosen, not
 * typed: nothing here can produce an over-long value the vocabulary itself did not offer.
 */
export const LIMITS = {
  company: 120,
  role: 120,
  headline: 200,
  interest: 60,
  interestCount: 12,
  productiveActivity: 200,
} as const

/** How close to a limit before the remaining count appears. Silent until it is worth saying. */
const WARN_WITHIN = 20

type Draft = {
  company: string
  role: string
  headline: string
  sector: string
  subsector: string
  productiveActivity: string
  networkingIntent: string
  availability: string
  interests: readonly string[]
}

const toDraft = (profile: OwnProfile): Draft => ({
  company: profile.company ?? '',
  role: profile.role ?? '',
  headline: profile.headline ?? '',
  sector: profile.sector ?? '',
  subsector: profile.subsector ?? '',
  productiveActivity: profile.productiveActivity ?? '',
  networkingIntent: profile.networkingIntent ?? '',
  availability: profile.availability ?? '',
  interests: profile.interests,
})

export const ProfileEdit = () => {
  const repository = useProfileRepository()
  const vocabularyRepository = useVocabularyRepository()
  const navigate = useNavigate()

  const companyId = useId()
  const roleId = useId()
  const headlineId = useId()
  const sectorId = useId()
  const subsectorId = useId()
  const activityId = useId()
  const intentId = useId()
  const availabilityId = useId()
  const interestsId = useId()

  const [draft, setDraft] = useState<Draft | null>(null)
  /** What the attendee HELD when the editor opened — the values FR-1095b keeps acceptable. */
  const [held, setHeld] = useState<{ sector: string | null; subsector: string | null }>({
    sector: null,
    subsector: null,
  })
  const [vocabulary, setVocabulary] = useState<ChoosableVocabulary | null>(null)
  const [loadFailure, setLoadFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // The await first, so the state write sits behind an async boundary — see `Profile.tsx`.
      // Both reads together: the editor cannot offer its choosers without the vocabulary, and
      // cannot present held values without the profile, so a half-loaded editor helps nobody.
      const [profile, choosable] = await Promise.all([
        repository.getOwn(),
        vocabularyRepository.choosable(),
      ])
      setDraft(toDraft(profile))
      setHeld({ sector: profile.sector, subsector: profile.subsector })
      setVocabulary(choosable)
    } catch (error) {
      setLoadFailure(
        error instanceof OfflineError
          ? 'Editing your profile needs a connection. It is not stored on this device.'
          : 'Could not load your profile. Try again in a moment.',
      )
    }
  }, [repository, vocabularyRepository])

  useEffect(() => {
    // Every state write inside `load` happens after an await, so this is not the synchronous
    // cascade the rule targets — the rule cannot see through a `useCallback` boundary to tell,
    // which is the same reason `auth/useAuth.tsx` carries this exemption twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // The choosers' option sets, derived per render from the vocabulary and the held values.
  // ─────────────────────────────────────────────────────────────────────────────────────────

  const choosableSectors = vocabulary?.sectors ?? []
  const selectedSectorId = choosableSectors.find((sector) => sector.label === draft?.sector)?.id
  /** Choosable subsectors OF the selected sector. Empty when the sector itself is not offered. */
  const choosableSubsectors = (vocabulary?.subsectors ?? []).filter(
    (subsector) => subsector.sectorId === selectedSectorId,
  )

  /** A held value that is no longer offered is still PRESENT — removable, never dropped. */
  const sectorIsHeldOnly =
    draft !== null &&
    draft.sector !== '' &&
    held.sector === draft.sector &&
    !choosableSectors.some((sector) => sector.label === draft.sector)

  const holdsPair =
    draft !== null &&
    draft.subsector !== '' &&
    held.subsector === draft.subsector &&
    held.sector === draft.sector
  const subsectorIsHeldOnly =
    holdsPair && !choosableSubsectors.some((subsector) => subsector.label === draft.subsector)

  /**
   * FR-1087 at the editor: a chosen subsector is resolved when it is empty, held with its held
   * sector, or a choosable refinement of the selected sector. Anything else — typically a
   * subsector left behind by a sector change — blocks the save until the attendee resolves it.
   */
  const subsectorUnresolved =
    draft !== null &&
    draft.subsector !== '' &&
    !holdsPair &&
    !choosableSubsectors.some((subsector) => subsector.label === draft.subsector)

  /**
   * Why confirmation is disabled, in words — or `null` when nothing is wrong.
   *
   * Ordered so the message is about the field the person is most likely working on rather than
   * the first one in the form.
   */
  const blockedBecause = ((): string | null => {
    if (!draft || saving) return null

    if (subsectorUnresolved) {
      return draft.sector === ''
        ? 'Your subsector needs a sector to belong to. Choose a sector, or clear the subsector.'
        : `“${draft.subsector}” belongs to a different sector than “${draft.sector}”. Choose a subsector of “${draft.sector}”, or clear it — a subsector travels with its sector.`
    }

    for (const [field, label, limit] of [
      ['headline', 'Your headline', LIMITS.headline],
      ['productiveActivity', 'Your activity description', LIMITS.productiveActivity],
      ['company', 'Your company', LIMITS.company],
      ['role', 'Your role', LIMITS.role],
    ] as const) {
      const over = draft[field].trim().length - limit
      if (over > 0)
        return `${label} is ${over} character${over === 1 ? '' : 's'} over the limit of ${limit}.`
    }

    if (draft.interests.length > LIMITS.interestCount) {
      return `You have ${draft.interests.length} interests. The limit is ${LIMITS.interestCount}.`
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
        sector: draft.sector || null,
        subsector: draft.subsector || null,
        productiveActivity: draft.productiveActivity.trim() || null,
        // T011 (006) — narrowed by a membership check rather than asserted (SC-414). A
        // `<select>` yields `string`; `asNetworkingIntent` returns the union member or `null`.
        networkingIntent: asNetworkingIntent(draft.networkingIntent),
        availability: asAvailability(draft.availability),
        interests: draft.interests,
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

  if (!draft || !vocabulary) {
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

  const removeInterest = (interest: string) =>
    setDraft((current) =>
      current
        ? { ...current, interests: current.interests.filter((kept) => kept !== interest) }
        : current,
    )

  const addInterest = (interest: string) =>
    setDraft((current) =>
      current && interest && !current.interests.includes(interest)
        ? { ...current, interests: [...current.interests, interest] }
        : current,
    )

  /** Choosable interests not already held — what the add-control offers. */
  const addableInterests = vocabulary.interests.filter(
    (option) => !draft.interests.includes(option.label),
  )

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

          {/*
            T178 — the sector chooser (FR-1087). Chosen, never typed: the options are the
            vocabulary's, plus — kept distinct — the value the attendee already holds when it is
            no longer offered, because a held value silently missing from this list would be
            REMOVED by the next save (FR-1095b).
          */}
          <div className="mb-4">
            <label htmlFor={sectorId} className="mb-1 block text-sm font-medium text-text-primary">
              Sector
            </label>
            <select
              id={sectorId}
              value={draft.sector}
              aria-describedby={sectorIsHeldOnly ? `${sectorId}-held` : undefined}
              onChange={(event) => {
                // The subsector deliberately does NOT auto-clear on a sector change: clearing
                // would silently discard a choice the attendee made, and keeping it invalid
                // blocks the save with the reason stated — resolving it is their own act
                // (FR-1087, the "attendee changes sector" edge case).
                set('sector')(event.target.value)
              }}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            >
              <option value="">Not stated</option>
              {sectorIsHeldOnly && (
                <option value={draft.sector}>{draft.sector} (no longer offered)</option>
              )}
              {choosableSectors.map((sector) => (
                <option key={sector.id} value={sector.label}>
                  {sector.label}
                </option>
              ))}
            </select>
            {sectorIsHeldOnly && (
              <p id={`${sectorId}-held`} className="mt-1 text-xs text-text-muted">
                This value is no longer offered. It stays yours until you change it — and once
                cleared, it cannot be chosen again.
              </p>
            )}
          </div>

          {/*
            The subsector chooser, filtered by the chosen sector (FR-1087). Held-but-unoffered
            values are presented exactly as the sector's are.
          */}
          <div className="mb-4">
            <label
              htmlFor={subsectorId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Subsector
            </label>
            <select
              id={subsectorId}
              value={draft.subsector}
              aria-describedby={`${subsectorId}-hint`}
              onChange={(event) => set('subsector')(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            >
              <option value="">Not stated</option>
              {/* An unresolved or held-only value stays VISIBLE in its control, so the person
                  resolving it can see what they are resolving. */}
              {draft.subsector !== '' &&
                !choosableSubsectors.some((subsector) => subsector.label === draft.subsector) && (
                  <option value={draft.subsector}>
                    {draft.subsector}
                    {subsectorIsHeldOnly ? ' (no longer offered)' : ''}
                  </option>
                )}
              {choosableSubsectors.map((subsector) => (
                <option key={subsector.id} value={subsector.label}>
                  {subsector.label}
                </option>
              ))}
            </select>
            <p id={`${subsectorId}-hint`} className="mt-1 text-xs text-text-muted">
              {draft.sector === ''
                ? 'Choose a sector first — a subsector refines one.'
                : choosableSubsectors.length === 0 && !holdsPair
                  ? `No subsectors of “${draft.sector}” are defined yet. The list is curated and grows as it is authored — nothing is wrong with your profile.`
                  : `A refinement of “${draft.sector}”.`}
            </p>
          </div>

          <TextAreaField
            id={activityId}
            label="What you do"
            hint="A short description of your productive activity — what you actually make or offer."
            value={draft.productiveActivity}
            limit={LIMITS.productiveActivity}
            onChange={set('productiveActivity')}
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

          {/*
            T178 — interests are CHOSEN from the vocabulary (FR-1088); there is deliberately no
            text input here and none may be added. What is already held renders as removable
            whatever its origin — a vocabulary choice, a retired one, or free text retained from
            before the vocabulary existed (FR-1095, FR-1095b).
          */}
          <fieldset className="mb-5">
            <legend className="mb-1 block text-sm font-medium text-text-primary">Interests</legend>

            {draft.interests.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {draft.interests.map((interest) => (
                  <li
                    key={interest}
                    className="flex items-center gap-1 rounded-sm bg-cream-200 px-2 py-0.5 text-xs text-text-body"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      aria-label={`Remove ${interest}`}
                      className="ml-1 rounded-sm px-1 font-medium text-text-muted hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-coral-500"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {vocabulary.interests.length === 0 ? (
              // FR-1086's shipped condition: the interest list starts empty, and this state is
              // an explanation rather than a broken form. Free entry is NOT offered in its
              // place (FR-1088) — a typed value is exactly what a curated list exists to avoid.
              <p className="text-xs text-text-muted">
                No interests are defined yet. The list is curated and interests are chosen from it
                rather than typed — once it has values, you can pick yours here.
                {draft.interests.length > 0
                  ? ' What you already have stays yours, and you can remove any of it above.'
                  : ''}
              </p>
            ) : draft.interests.length >= LIMITS.interestCount ? (
              <p role="status" aria-live="polite" className="text-xs text-text-muted">
                You have {LIMITS.interestCount} interests, which is the limit. Remove one to choose
                another.
              </p>
            ) : (
              <>
                <label htmlFor={interestsId} className="sr-only">
                  Add an interest
                </label>
                <select
                  id={interestsId}
                  value=""
                  aria-describedby={`${interestsId}-hint`}
                  onChange={(event) => addInterest(event.target.value)}
                  className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
                >
                  <option value="">Add an interest…</option>
                  {addableInterests.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p id={`${interestsId}-hint`} className="mt-1 text-xs text-text-muted">
                  Chosen from the shared list, up to {LIMITS.interestCount}. You have{' '}
                  {draft.interests.length}.
                </p>
              </>
            )}
          </fieldset>

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

/**
 * T178 — the multi-line variant, for the productive-activity description (FR-1090). The same
 * limit behaviour as `TextField`, in the same words, because FR-337's obligation does not
 * change with the element — and a second element rather than a flag on the first, so neither
 * control's markup grows conditionals the other has to read around.
 */
const TextAreaField = ({
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
      <textarea
        id={id}
        rows={3}
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
