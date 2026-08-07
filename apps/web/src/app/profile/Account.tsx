import {
  OfflineError,
  RequestRefusedError,
  type Discoverability,
  type OwnProfile,
} from '@mynet/data'
import { useIdentityRepository, useProfileRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from '../../auth/useAuth.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { WithdrawConference } from './WithdrawConference.js'

/**
 * T093 (004) — the account surface: what is shared, and what can be taken away.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Separate from the profile editor, and visually separated from it** (Desktop layout
 * declaration). Editing a headline and deleting an account are not the same kind of act, and a
 * surface that treats them alike invites the second by accident. The profile is where somebody
 * describes themselves; this is where they decide who sees it and whether it exists.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const Account = () => {
  const repository = useProfileRepository()

  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [loadFailure, setLoadFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const own = (await repository.getOwn()) as OwnProfile
      setProfile(own)
    } catch (error) {
      setLoadFailure(
        error instanceof OfflineError
          ? 'Your account settings need a connection. Nothing here is stored on this device.'
          : 'Could not load your account settings. Try again in a moment.',
      )
    }
  }, [repository])

  useEffect(() => {
    // See `Profile.tsx` — the writes are behind an await, and the rule cannot see through a
    // `useCallback` boundary to tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <section aria-labelledby="account-heading" className="px-4 py-6 tablet:px-6">
      <div className="max-w-2xl">
        <h1
          id="account-heading"
          className="mb-1 font-display text-xl font-semibold text-text-primary"
        >
          Your account
        </h1>
        <p className="mb-6 text-sm text-text-muted">
          Who can find you, and what happens to what the product holds about you.
        </p>

        {loadFailure && (
          <p
            role="alert"
            className="rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
          >
            {loadFailure}
          </p>
        )}

        {!profile && !loadFailure && (
          <p role="status" aria-live="polite" className="text-sm text-text-muted">
            Loading your account settings…
          </p>
        )}

        {profile && (
          <>
            <DiscoverabilityControl profile={profile} />
            {/*
              T112 — leaving a conference sits between "who can see me" and "delete everything",
              because that is where it belongs in severity: reversible in principle, and not
              reversible for the notes attached to it.
            */}
            <WithdrawConference />
            <ExportControl />
            <DeleteAccountControl />
          </>
        )}
      </div>
    </section>
  )
}

/**
 * T099 (004) — taking a copy of everything (FR-373).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DOCUMENT BECOMES A DOWNLOAD WITHOUT THIS COMPONENT TOUCHING THE DOM.**
 *
 * The conventional implementation — `URL.createObjectURL`, an anchor created in code, a
 * synthetic click, then `revokeObjectURL` — reaches for `document` directly, which
 * `mynet/no-direct-platform-access` refuses in feature code and SC-008 counts. That rule is not
 * an obstacle to work around here: a component that manufactures DOM nodes to trigger a browser
 * behaviour is exactly the coupling Principle V exists to prevent.
 *
 * A data URL on a real `<a download>` gets the same result declaratively. The attendee clicks a
 * link, the browser saves a file, and nothing here knows that a network, a blob or a document
 * exists. The cost is one string in memory the size of the export, which for one attendee's
 * data is a few tens of kilobytes.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Three states, all named in the specification**: preparing, ready, failure. Ready is a
 * separate state rather than an automatic download, because a file appearing without being
 * asked for twice is startling — and because the link is what lets somebody save it again
 * without paying for a second export.
 */
const ExportControl = () => {
  const identity = useIdentityRepository()

  const [state, setState] = useState<'idle' | 'preparing' | 'ready' | 'failed'>('idle')
  const [href, setHref] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const prepare = async () => {
    setState('preparing')
    setFailure(null)

    try {
      const document_ = await identity.exportPersonalData()
      // `charset=utf-8` and `encodeURIComponent` rather than base64: an export contains
      // attendee-authored free text, and a name or a note with an accent in it must survive
      // the round trip intact.
      setHref(
        `data:application/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(document_, null, 2),
        )}`,
      )
      setState('ready')
    } catch (error) {
      setState('failed')
      setFailure(
        error instanceof OfflineError
          ? 'Preparing your data needs a connection. Try again once you reconnect.'
          : error instanceof RequestRefusedError
            ? error.message
            : 'Could not prepare your data just now. Try again in a moment.',
      )
    }
  }

  return (
    <section
      aria-labelledby="export-heading"
      className="mb-8 rounded-md border border-border-subtle bg-surface-raised px-4 py-4"
    >
      <h2 id="export-heading" className="mb-2 font-display text-base font-medium text-text-primary">
        A copy of your data
      </h2>
      <p className="mb-3 text-sm text-text-body">
        Everything MyNet holds about you, in one file — your profile, your photograph, the
        conferences you joined, the sessions you saved and the notes you wrote.
      </p>

      {state === 'ready' && href ? (
        <>
          <a
            href={href}
            download="mynet-personal-data.json"
            className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
          >
            Download your data
          </a>
          <p role="status" className="mt-2 text-sm text-text-muted">
            Ready. The file is prepared on this device and is not stored anywhere.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={state === 'preparing'}
          className="rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'preparing' ? 'Preparing…' : 'Prepare a copy'}
        </button>
      )}

      {state === 'preparing' && (
        <p role="status" aria-live="polite" className="mt-2 text-sm text-text-muted">
          Gathering everything…
        </p>
      )}

      {state === 'failed' && failure && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {failure}
        </p>
      )}
    </section>
  )
}

/**
 * T111 (004) — deleting the account (FR-364, FR-367, FR-368).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFIRMATION MUST STATE THAT IT CANNOT BE UNDONE AND THAT NO COPY IS KEPT** (FR-367).
 *
 * Both halves, in those words, because both are true and neither is what somebody expects. Most
 * products keep a copy for thirty days; this one does not, and a person who assumes the usual
 * grace period would be making an irreversible decision on a false premise.
 *
 * The export sits immediately above this on purpose. Somebody about to delete everything is
 * exactly the person who should be offered a copy first, and putting the two in the same place
 * is the least this surface can do about that.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const DeleteAccountControl = () => {
  const identity = useIdentityRepository()
  const { markSignedOut } = useAuth()
  const navigate = useNavigate()

  const opener = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const remove = async () => {
    setDeleting(true)
    setFailure(null)

    try {
      await identity.deleteAccount()
      setConfirming(false)
      // The session is already gone server-side; this is what stops the shell rendering a
      // workspace for an attendee who no longer exists.
      markSignedOut()
      await navigate('/')
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? 'Deleting your account needs a connection. Nothing has been deleted — try again once you reconnect.'
          : 'Could not delete your account just now. Nothing has been deleted — try again.',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      aria-labelledby="delete-heading"
      // Visually separated from ordinary editing (Desktop layout declaration): this is not the
      // same kind of act as changing a headline, and it must not look like one.
      className="rounded-md border border-danger-500 bg-surface-raised px-4 py-4"
    >
      <h2 id="delete-heading" className="mb-2 font-display text-base font-medium text-text-primary">
        Delete your account
      </h2>
      <p className="mb-3 text-sm text-text-body">
        Your profile, your photograph, the conferences you joined, the sessions you saved and the
        notes you wrote — all of it goes. If you want a copy, take one first.
      </p>

      <button
        ref={opener}
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-sm border border-danger-500 px-4 py-2 text-sm font-medium text-danger-700"
      >
        Delete my account
      </button>

      {failure && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {failure}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Delete everything"
          confirming={deleting}
          destructive
          onConfirm={() => void remove()}
          onDismiss={() => setConfirming(false)}
          returnFocusTo={opener}
        >
          {/*
            FR-367, in the two sentences it asks for. Stated plainly rather than softened: a
            person who assumes the usual thirty-day grace period would be making an irreversible
            decision on a false premise.
          */}
          <p className="mb-2">
            <strong className="font-medium text-text-primary">This cannot be undone.</strong> Your
            account and everything MyNet holds about you is deleted immediately.
          </p>
          <p>
            <strong className="font-medium text-text-primary">No copy is kept.</strong> There is no
            grace period and nothing to restore — not by you, and not by anyone else.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

/**
 * T093 — the discoverability control (FR-360, FR-362, FR-363).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IT STATES WHAT THE SETTING CURRENTLY DOES, NOT WHAT IT IS SET TO** (FR-362).
 *
 * Those differ for every unverified attendee, and the difference is the whole reason this
 * requirement exists: turning the switch on while unverified changes nothing anybody can
 * observe. A control that showed only its own position would be lying by omission to precisely
 * the people who most need to know why nobody can find them.
 *
 * So the state is read from `effectivelyVisible` — the server's answer to "can co-attendees
 * actually find you" — and what verification adds is spelled out beside it (FR-325b).
 *
 * **One switch, all-or-nothing** (FR-360). Per-field visibility was considered and rejected;
 * a second control here would be it arriving without the recorded decision that requires.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const DiscoverabilityControl = ({ profile }: { profile: OwnProfile }) => {
  const repository = useProfileRepository()
  const switchId = useId()
  const explanationId = useId()

  const [state, setState] = useState<Discoverability>({
    discoverable: profile.discoverable,
    emailVerified: profile.emailVerified,
    effectivelyVisible: profile.discoverable && profile.emailVerified,
  })
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const toggle = async (discoverable: boolean) => {
    setSaving(true)
    setFailure(null)

    try {
      // The server's answer replaces the local one wholesale — the state comes from a confirmed
      // response rather than from what was just clicked, which is what keeps this
      // non-optimistic and what makes `effectivelyVisible` trustworthy.
      setState((await repository.setDiscoverable(discoverable)) as Discoverability)
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? 'Changing this needs a connection. Nothing has changed — try again once you reconnect.'
          : 'Could not change this setting. Nothing has changed — try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby={`${switchId}-label`}
      className="mb-8 rounded-md border border-border-subtle bg-surface-raised px-4 py-4"
    >
      <h2
        id={`${switchId}-label`}
        className="mb-2 font-display text-base font-medium text-text-primary"
      >
        Being found by other attendees
      </h2>

      <div className="flex items-start gap-3">
        <input
          id={switchId}
          type="checkbox"
          checked={state.discoverable}
          disabled={saving}
          onChange={(event) => void toggle(event.target.checked)}
          aria-describedby={explanationId}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <div className="min-w-0">
          <label htmlFor={switchId} className="block text-sm font-medium text-text-primary">
            Let attendees at my conferences find me
          </label>

          {/*
            ───────────────────────────────────────────────────────────────────────────────
            The plain statement FR-362 asks for, and it is deliberately about the EFFECT.
            `role="status"` so a change is announced rather than only redrawn — the whole
            point of the unverified case is that toggling the switch changes nothing visible,
            and a screen-reader user would otherwise have no way to know that.
            ───────────────────────────────────────────────────────────────────────────────
          */}
          <p
            id={explanationId}
            role="status"
            aria-live="polite"
            className="mt-1 text-sm text-text-body"
          >
            {state.effectivelyVisible
              ? 'Attendees at conferences you have joined can find your profile. Nobody else can.'
              : state.discoverable
                ? 'Nobody can find you yet. Verifying your email address is what makes you visible — until then this setting has no effect.'
                : 'Nobody can find you. Your profile is visible only to you.'}
          </p>

          {saving && (
            <p role="status" className="mt-1 text-xs text-text-muted">
              Saving…
            </p>
          )}

          {failure && (
            <p role="alert" className="mt-2 text-sm text-danger-700">
              {failure}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
