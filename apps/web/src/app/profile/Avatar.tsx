import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useProfileRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

import { AvatarFallback } from './AvatarFallback.js'

/**
 * T084 (004) — choosing and removing an avatar (FR-346, FR-347, research D9).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A FILE INPUT, AND `CameraService` STAYS UNWIRED** (research D9).
 *
 * `packages/platform/src/interfaces/index.ts` describes `CameraService` as being "for scanning
 * a badge or capturing an avatar in a later slice" — this slice. It is deliberately not used,
 * and the reason is recorded so the unused interface does not read as an oversight:
 *
 *   - `accept="image/*"` on a file input **already offers the camera** on both mobile
 *     platforms. A `getUserMedia` flow would add a second capture path for a capability the
 *     platform hands over for free.
 *   - A file input is a declarative form element, not a browser API call, so it does not engage
 *     `mynet/no-direct-platform-access` and SC-008 stays at zero.
 *   - A dedicated capture surface has its own permission states, its own preview, and its own
 *     failure modes. No requirement asks for one, and Open Question 6 records the choice as
 *     open rather than closed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing is validated here beyond what the platform already does.** The size and format
 * limits are the server's, checked by inspecting the bytes (FR-347) — a check in the browser
 * would be a courtesy, and treating it as enforcement is exactly what Principle VIII rules out.
 * What this surface owes the attendee is that a refusal explains itself and does not lose their
 * selection.
 */
export const Avatar = ({ displayName, hasAvatar }: { displayName: string; hasAvatar: boolean }) => {
  const repository = useProfileRepository()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<string | null>(null)
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const dataUrl = await repository.readOwnAvatar()
      setSource(dataUrl)
    } catch {
      // A photograph that will not load is not worth an error banner on a profile page: the
      // fallback renders and says exactly as much as a failure message would.
      setSource(null)
    }
  }, [repository])

  useEffect(() => {
    // Every state write inside `load` happens after an await; the rule cannot see through a
    // `useCallback` boundary to tell, which is the same reason `auth/useAuth.tsx` is exempted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasAvatar) void load()
  }, [hasAvatar, load])

  const onChoose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setBusy('uploading')
    setFailure(null)

    try {
      await repository.uploadAvatar(file)
      await load()
      // Cleared only on success. Leaving the selection in place after a refusal is what lets
      // somebody see which file was rejected rather than guessing.
      if (inputRef.current) inputRef.current.value = ''
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? // The specification names this case explicitly: refused, with the file not lost
            // from the form, nothing queued and nothing reported as succeeded.
            'Uploading needs a connection. Your photograph has not been sent — it is still selected, and you can try again once you reconnect.'
          : error instanceof RequestRefusedError
            ? // The server states the limit and what it accepts; repeating it here in different
              // words would give two answers to one question.
              error.message
            : 'Could not upload that photograph. Nothing has changed — try again.',
      )
    } finally {
      setBusy(null)
    }
  }

  const onRemove = async () => {
    setBusy('removing')
    setFailure(null)

    try {
      await repository.removeAvatar()
      setSource(null)
    } catch (error) {
      setFailure(
        error instanceof OfflineError
          ? 'Removing your photograph needs a connection. It has not been removed — try again once you reconnect.'
          : 'Could not remove your photograph. Nothing has changed — try again.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-6 flex items-center gap-4">
      {source ? (
        <img
          src={source}
          // The photograph adds nothing a screen-reader user can use that the adjacent name
          // does not already say, so it is presentational rather than described badly.
          alt=""
          className="h-24 w-24 shrink-0 rounded-full border border-border-subtle object-cover"
        />
      ) : (
        <AvatarFallback displayName={displayName} size="large" />
      )}

      <div className="min-w-0">
        {/*
          A real `<label>` bound to a real `<input type="file">`. The common alternative — a
          hidden input clicked by a styled button — loses keyboard operability and the accessible
          name unless both are rebuilt by hand (SC-310).
        */}
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-sm font-medium text-text-primary"
        >
          {busy === 'uploading' ? 'Uploading…' : source ? 'Change photograph' : 'Add a photograph'}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          // Offers the camera on mobile without this surface knowing a camera exists (D9).
          accept="image/*"
          disabled={busy !== null}
          onChange={(event) => void onChoose(event)}
          className="sr-only"
        />

        {source && (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy !== null}
            className="ml-3 rounded-sm px-3 py-2 text-sm font-medium text-text-body underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'removing' ? 'Removing…' : 'Remove'}
          </button>
        )}

        <p className="mt-2 text-xs text-text-muted">
          JPEG, PNG, WebP, AVIF or GIF, up to 5 MB. Location and camera information is removed
          before your photograph is stored.
        </p>

        {failure && (
          <p role="alert" className="mt-2 text-sm text-danger-700">
            {failure}
          </p>
        )}
      </div>
    </div>
  )
}
