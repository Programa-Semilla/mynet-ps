import { OfflineError, type OwnProfile } from '@mynet/data'
import { useProfileRepository } from '@mynet/platform'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Avatar } from './Avatar.js'
import { INTENT_LABELS, AVAILABILITY_LABELS } from './labels.js'
import { VerifyInvitation } from './VerifyInvitation.js'

/**
 * T073 (004) — the attendee's own profile (FR-334, FR-341).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN EMPTY PROFILE IS AN INVITATION, NOT A BROKEN RECORD** (FR-341).
 *
 * This is the ordinary state of a new account, and it is what the third seeded attendee shows a
 * reviewer at first run. Rendering it as a failure, or as a page of blank labels, would tell
 * somebody their account is wrong when it is simply new. So the empty state has its own words
 * and its own call to action, rather than being the populated state with nothing in it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **A single column at every width** (Desktop/Tablet/Mobile declarations). A profile is a form
 * and a form is a column; the multi-column workspace around it is the shell's, not this
 * surface's.
 */

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly profile: OwnProfile }
  | { readonly status: 'failed'; readonly message: string }

export const Profile = () => {
  const repository = useProfileRepository()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async () => {
    try {
      // The await comes first deliberately: every `setState` below it is behind an async
      // boundary, so this is not the synchronous cascade `set-state-in-effect` targets — and
      // writing it this way means the rule can see that, rather than needing a disable comment.
      const profile = await repository.getOwn()
      setState({ status: 'ready', profile })
    } catch (error) {
      setState({
        status: 'failed',
        message:
          error instanceof OfflineError
            ? // Nothing this feature stores is cached for offline reading, and that is a
              // declaration rather than an omission — so the honest answer offline is that the
              // profile is unavailable, not a stale copy of it.
              'Your profile needs a connection. It is not stored on this device.'
            : 'Could not load your profile. Try again in a moment.',
      })
    }
  }, [repository])

  useEffect(() => {
    // Every state write inside `load` happens after an await, so this is not the synchronous
    // cascade the rule targets — the rule cannot see through a `useCallback` boundary to tell,
    // which is the same reason `auth/useAuth.tsx` carries this exemption twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <section aria-labelledby="profile-heading" className="px-4 py-6 tablet:px-6">
      <div className="max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h1 id="profile-heading" className="font-display text-xl font-semibold text-text-primary">
            Your profile
          </h1>
          {state.status === 'ready' && (
            <div className="flex shrink-0 gap-2">
              <Link
                to="/profile/edit"
                className="rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
              >
                Edit
              </Link>
              {/*
                The account surface is reached from here rather than from the rail — it is about
                this profile, and the five destinations are fixed (Open Question 8).
              */}
              <Link
                to="/account"
                className="rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
              >
                Account
              </Link>
            </div>
          )}
        </div>

        {state.status === 'loading' && (
          <p role="status" aria-live="polite" className="text-sm text-text-muted">
            Loading your profile…
          </p>
        )}

        {state.status === 'failed' && (
          <p
            role="alert"
            className="rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
          >
            {state.message}
          </p>
        )}

        {state.status === 'ready' && (
          <>
            {/* T066 — unobtrusive, and only while it is true (FR-325b). */}
            <VerifyInvitation emailVerified={state.profile.emailVerified} />

            {/*
              T084 — the photograph, above the text, because it is the thing a person looks at
              first and the thing FR-351's fallback has to be honest about when it is absent.
            */}
            <Avatar displayName={state.profile.displayName} hasAvatar={state.profile.hasAvatar} />

            <p className="mb-1 font-display text-lg font-medium text-text-primary">
              {state.profile.displayName}
            </p>
            <p className="mb-6 text-sm text-text-muted">{state.profile.email}</p>

            {isEmpty(state.profile) ? (
              /*
                FR-341 — the invitation. Its own words, not the populated layout with every value
                missing: a page of empty labels reads as data that failed to arrive.
              */
              <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
                <h2 className="mb-1 font-display text-base font-medium text-text-primary">
                  You have not described yourself yet
                </h2>
                <p className="mb-4 text-sm text-text-body">
                  Your company, role and interests are what let other attendees find you and know
                  why to say hello. None of it is required.
                </p>
                <Link
                  to="/profile/edit"
                  className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
                >
                  Complete your profile
                </Link>
              </div>
            ) : (
              <dl className="grid gap-4">
                <Field label="Headline" value={state.profile.headline} />
                <Field label="Company" value={state.profile.company} />
                <Field label="Role" value={state.profile.role} />
                <Field
                  label="Networking intent"
                  value={
                    state.profile.networkingIntent
                      ? INTENT_LABELS[state.profile.networkingIntent]
                      : null
                  }
                />
                <Field
                  label="Availability"
                  value={
                    state.profile.availability
                      ? AVAILABILITY_LABELS[state.profile.availability]
                      : null
                  }
                />
                {state.profile.interests.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-text-muted">Interests</dt>
                    <dd className="mt-1 flex flex-wrap gap-2">
                      {state.profile.interests.map((interest) => (
                        <span
                          key={interest}
                          className="rounded-sm border border-border-subtle bg-surface-raised px-2 py-1 text-sm text-text-body"
                        >
                          {interest}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** Every field is optional (FR-336), so an unset one is simply absent rather than blank. */
const Field = ({ label, value }: { label: string; value: string | null }) =>
  value ? (
    <div>
      <dt className="text-sm font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-text-body">{value}</dd>
    </div>
  ) : null

const isEmpty = (profile: OwnProfile): boolean =>
  !profile.company &&
  !profile.role &&
  !profile.headline &&
  !profile.networkingIntent &&
  !profile.availability &&
  profile.interests.length === 0
