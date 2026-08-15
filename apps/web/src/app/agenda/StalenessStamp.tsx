/**
 * T066 (005) — when the content on screen was last retrieved (FR-216, SC-204).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EXPRESSED AS A TIME, NOT AS A COLOURED BADGE** (Assumptions, Principle IV).
 *
 * A "stale" chip needs a legend, carries its meaning in colour, and tells the attendee nothing
 * they can act on. A time is readable without relying on colour, needs no explanation, and is
 * the actual answer to the question they are asking — *is this current enough to walk across a
 * venue on?* Only they can decide that, and only from the time.
 *
 * Machine-readable through `dateTime` as well as human-readable, exactly as session times are,
 * so the fact is available to assistive technology without the visible text having to be an
 * ISO string.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Rendered only when the content actually came from the cache.** A stamp on live content
 * would train the attendee to ignore it, and SC-204 requires that no cached surface is
 * presented as if it were live — the converse matters just as much.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const StalenessStamp = ({ retrievedAt }: { retrievedAt: string | null }) => {
  if (!retrievedAt) return null

  const retrieved = new Date(retrievedAt)
  if (Number.isNaN(retrieved.getTime())) return null

  return (
    <p className="mb-4 rounded-sm border border-border-subtle bg-surface px-3 py-2 text-xs text-text-muted">
      {/*
        The reader's own clock and locale, deliberately — unlike a session time, which is the
        venue's. "When did my device last manage to fetch this" is a fact about the reader's
        device, and rendering it in the venue's timezone would be answering a question nobody
        asked.
      */}
      Showing what was saved on this device. Last updated{' '}
      <time dateTime={retrievedAt}>
        {retrieved.toLocaleString(undefined, {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
      .
    </p>
  )
}
