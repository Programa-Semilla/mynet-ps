/**
 * T085 (004) — the non-photographic fallback (FR-351).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO BROKEN IMAGE MAY APPEAR ANYWHERE A PROFILE RENDERS**, and the way to guarantee that is
 * not to render an `<img>` at all when there is nothing to put in it.
 *
 * An `<img src="">` or an `src` pointing at a 404 produces the browser's broken-image glyph —
 * a torn page icon that reads as *this product is failing* rather than *this person has not
 * uploaded a photograph*. The two states are completely different and must look completely
 * different.
 *
 * This is also the state most attendees are in most of the time: nobody has a photograph the
 * moment they sign up, the seeded fixtures deliberately have none (FR-354), and the third
 * seeded attendee never gets one. The fallback is the common case, not the exceptional one, so
 * it is drawn rather than apologised for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Initials, from whatever the display name actually is.
 *
 * Two graphemes at most, taken from the first and last space-separated parts — which is right
 * for "Ada Lovelace" and harmless for "Prince". `Intl.Segmenter` rather than `slice(0, 1)`,
 * because a name beginning with an emoji, a surrogate pair or a combining mark would otherwise
 * be cut in half and render as a replacement character.
 */
const initialsOf = (displayName: string): string => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'

  const first = parts[0] as string
  const last = parts.length > 1 ? (parts[parts.length - 1] as string) : ''

  const firstGrapheme = (value: string): string => {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...segmenter.segment(value)][0]?.segment ?? ''
  }

  return `${firstGrapheme(first)}${firstGrapheme(last)}`.toUpperCase()
}

export const AvatarFallback = ({
  displayName,
  size = 'medium',
}: {
  displayName: string
  size?: 'small' | 'medium' | 'large'
}) => {
  const dimensions = {
    small: 'h-8 w-8 text-xs',
    medium: 'h-12 w-12 text-sm',
    large: 'h-24 w-24 text-xl',
  }[size]

  return (
    <span
      // ─────────────────────────────────────────────────────────────────────────────────────
      // `aria-hidden`, deliberately. The initials are a decorative stand-in for a photograph
      // the attendee has not provided; the name itself is always rendered adjacent to this, so
      // announcing "A L" as well would read the same person's identity twice — once
      // unintelligibly (SC-310).
      // ─────────────────────────────────────────────────────────────────────────────────────
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-cream-200 font-display font-medium text-text-primary ${dimensions}`}
    >
      {initialsOf(displayName)}
    </span>
  )
}
