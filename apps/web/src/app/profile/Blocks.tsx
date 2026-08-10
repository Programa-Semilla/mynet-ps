import { OfflineError, type BlockedAttendee } from '@mynet/data'
import { useBlockRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useState } from 'react'

import { AvatarFallback } from './AvatarFallback.js'

/**
 * T085 (007) — the block-management list (FR-541, FR-541a, FR-581).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ON THE EXISTING ACCOUNT SURFACE, AND DELIBERATELY NOT A SIXTH DESTINATION** (FR-541a).
 *
 * The five destinations are fixed, and a list of blocks is not a place an attendee goes — it is a
 * setting they occasionally revisit. It belongs beside "who can find me" and "delete everything",
 * because it is the same kind of decision: **who may reach me, and on what terms.**
 *
 * That placement is a requirement rather than a convenience: giving safety controls their own
 * destination would put them in the navigation of every attendee who has never needed them,
 * which is both noise and a strange thing to advertise.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Three states, declared** (FR-541a, FR-581): loading, empty — "you have not blocked anyone",
 * which is not an error — and failure with a retry. An empty block list is the ordinary state of
 * almost every account, so it is the state this surface shows most often and the one that has to
 * read as *fine* rather than as *nothing loaded*.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const Blocks = () => {
  const repository = useBlockRepository()
  const headingId = useId()

  const [blocks, setBlocks] = useState<readonly BlockedAttendee[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [releasing, setReleasing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailure(null)
    try {
      setBlocks(await repository.list())
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? 'Your blocks need a connection. Nothing here is stored on this device.'
          : 'Could not load who you have blocked. Try again in a moment.',
      )
    }
  }, [repository])

  useEffect(() => {
    // The write is behind an await, so this is not a synchronous state update in an effect body —
    // the rule simply cannot see through the call. Same treatment as `Account.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const unblock = (attendeeId: string): void => {
    setReleasing(attendeeId)
    repository
      .unblock(attendeeId)
      .then(() => load())
      .catch(() => setFailure('That block could not be released. Nothing has changed — try again.'))
      .finally(() => setReleasing(null))
  }

  return (
    <section aria-labelledby={headingId} className="mb-8 border-t border-border-subtle pt-6">
      <h2 id={headingId} className="mb-1 font-display text-lg font-medium text-text-primary">
        People you have blocked
      </h2>
      <p className="mb-4 max-w-prose text-sm text-text-body">
        They cannot message you, and you cannot message them. They are not told. Nothing either of
        you wrote has been deleted — unblocking restores sending exactly as it was.
      </p>

      {failure && (
        <div
          role="alert"
          className="rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
        >
          <p className="mb-2">{failure}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="focus-ring min-h-11 rounded-sm border border-danger-500 px-3 py-1 font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {!blocks && !failure && (
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Loading who you have blocked…
        </p>
      )}

      {/* The ordinary state of almost every account, and it reads as fine rather than as empty. */}
      {blocks?.length === 0 && (
        <p className="text-sm text-text-muted">You have not blocked anyone.</p>
      )}

      {blocks && blocks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {blocks.map((blocked) => (
            <li
              key={blocked.attendeeId}
              className="flex min-h-11 items-center gap-3 rounded-md border border-border-subtle bg-surface-raised px-3 py-2"
            >
              {blocked.avatar ? (
                <img
                  src={blocked.avatar}
                  alt=""
                  className="size-10 shrink-0 rounded-full border border-border-subtle object-cover"
                />
              ) : (
                <AvatarFallback displayName={blocked.displayName} />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {blocked.displayName}
                </span>
                <span className="block text-xs text-text-muted">
                  Blocked <time dateTime={blocked.blockedAt}>{dateOf(blocked.blockedAt)}</time>
                </span>
              </span>

              <button
                type="button"
                onClick={() => unblock(blocked.attendeeId)}
                disabled={releasing === blocked.attendeeId}
                // Names the person, so a screen-reader user working down the list hears whom each
                // control releases rather than "Unblock" five times.
                aria-label={`Unblock ${blocked.displayName}`}
                className="focus-ring min-h-11 shrink-0 rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-accent-strong disabled:opacity-60"
              >
                {releasing === blocked.attendeeId ? 'Working…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The date in the reader's own locale — a block is a thing that happened on a day. */
const dateOf = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
