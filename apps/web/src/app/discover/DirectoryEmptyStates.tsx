import { Link } from 'react-router'

/**
 * T053, T054, T055 (006) — every state the directory can be in that is not a list of people
 * (FR-401b, FR-414, FR-415, FR-466–FR-468).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE WORDING IS THE REQUIREMENT HERE, NOT THE MARKUP.**
 *
 * FR-415 forbids the empty state disclosing *which* of three things is true: the conference has
 * no attendees, it has no discoverable attendees, or none matched what was typed. That is a
 * privacy property, not a copy preference — "nobody at this conference has made themselves
 * discoverable" tells a reader something about every other attendee's settings, and it tells it
 * to anybody who can join with a world-readable code.
 *
 * So there are exactly **two** empty states, and the split is by *what the reader can do next*
 * rather than by what is true about the population:
 *
 *   - the reader has narrowed the directory, so the way forward is to widen it (FR-414);
 *   - the reader has not, so there is nothing to widen and nothing further to say.
 *
 * Neither says why. Adding "no discoverable attendees" to the second would be the disclosure.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
    {children}
  </div>
)

/**
 * T053 — nothing matched, with the reset FR-414 requires.
 *
 * The action clears **every** filter and the search term together. Clearing them one at a time
 * would leave a reader who set three narrowings pressing three controls to get back to a
 * directory they can see, and the state exists precisely because they cannot see what they are
 * clearing.
 */
export const NoMatches = ({ onReset }: { onReset: () => void }) => (
  <Panel>
    {/*
      Worded differently from the live count above it, which already says "No attendees
      matched". Two elements saying the same sentence would announce it twice to a screen-reader
      user — once from the live region and once as the region they then navigate into.
    */}
    <p className="mb-1 font-medium text-text-primary">Nothing matched</p>
    <p className="mb-4 text-sm text-text-body">
      Nothing here matches what you are looking for. Try a different search, or clear what you have
      set to see everyone.
    </p>
    <button
      type="button"
      onClick={onReset}
      className="inline-flex min-h-11 items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
    >
      Clear search and filters
    </button>
  </Panel>
)

/**
 * T053 — the unnarrowed empty directory.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Says nothing about why, deliberately** (FR-415). Every explanation available here is a
 * fact about other attendees: that nobody has joined, that nobody is discoverable, that nobody
 * has verified an address. The reader is told what is true *for them* — there is nobody to show
 * — and what changes it, which is other people arriving.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const NobodyToShow = () => (
  <Panel>
    <p className="mb-1 font-medium text-text-primary">Nobody to show yet</p>
    <p className="text-sm text-text-body">
      There is nobody here for you to see at the moment. As more people arrive at this conference,
      they will appear here.
    </p>
  </Panel>
)

/**
 * T054 — the reader has joined no conference (FR-401b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT an empty directory, NOT a loading state that never resolves, and NOT an error.**
 *
 * FR-401b names all three and rules each of them out, because this is where **every** attendee
 * stands between creating an account and entering their first join code. It is the most common
 * state a brand-new account is in, and all three wrong answers tell somebody with a perfectly
 * healthy account that something is broken or empty.
 *
 * Joining comes first, so the way to join is the content of the state rather than a link
 * underneath it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const NoConference = () => (
  <Panel>
    <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
      Join a conference to see who is here
    </h2>
    <p className="mb-4 text-sm text-text-body">
      Discover shows the people at the conference you are attending, so there is nobody to show
      until you have joined one. You will need its join code — it is on your badge, or wherever the
      organisers published it.
    </p>
    <Link
      to="/join"
      className="inline-flex min-h-11 items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
    >
      Join a conference
    </Link>
  </Panel>
)

/**
 * T055 — offline (FR-466, FR-467, FR-468).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING IN DISCOVER IS CACHED, AND THIS STATE SAYS SO RATHER THAN OMITTING IT.**
 *
 * 005 made the agenda readable offline through a caching decorator at the repository boundary,
 * and it would have been one line at the composition root to do the same here. This feature
 * deliberately does not, and FR-468 requires the refusal be *declared* rather than left as an
 * apparent gap: a cached directory is a copy of other people's personal data sitting on this
 * device, ageing, after they may have turned discoverability off — and the decorator's clock is
 * age, which is the wrong clock entirely for a setting that takes effect on the next request.
 *
 * **Worded distinguishably from a fault on our side** (FR-467), and both halves are stated: a
 * connection is needed, *and* there is nothing stored to show instead. Without the second, the
 * reader cannot tell "wait a moment" from "there is nothing here until you reconnect".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const DirectoryOffline = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role="status"
    className="rounded-md border border-warning-500 bg-warning-100 px-4 py-3 text-sm text-warning-700"
  >
    <p className="mb-2">
      Discover needs a connection, and there is not one right now. Nothing is stored on this device
      to show instead — the people here are not cached, so that nobody stays visible to you after
      they have chosen not to be.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-11 rounded-sm border border-warning-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)

/**
 * A fault on our side, worded so it is not mistaken for the offline state above (FR-467) and not
 * mistaken for a problem with the reader's account.
 */
export const DirectoryFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role="alert"
    className="rounded-md border border-danger-500 bg-danger-100 px-4 py-3 text-sm text-danger-700"
  >
    <p className="mb-2">
      The directory could not be loaded. This is a problem on our side, not with your account or
      your connection.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-11 rounded-sm border border-danger-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)
