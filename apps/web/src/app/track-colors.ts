/**
 * T044 (002) — track token name → the classes that render it (FR-136, research D7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The one place a track's colour is decided, and the one place an unknown token is handled.**
 *
 * The database stores a token *name*. This maps it to classes built from the tokens in
 * `theme/tokens.css`. No component contains a colour, and no colour reaches the database — the
 * palette stays in one file, where contrast is already reasoned about.
 *
 * **An unrecognised token renders as a defined neutral rather than as an unstyled element.** A
 * seed typo — `track-desgin` — must degrade, not break. That costs nothing here because colour
 * is never the sole carrier of meaning: the track is always rendered as text alongside its chip
 * (constitution Principle IV), so a chip that falls back to neutral loses reinforcement and no
 * information at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Classes are written out in full rather than interpolated, because Tailwind scans source text
 * for class names — a template literal would produce classes that exist at runtime and were
 * never generated at build time, which is a blank chip in production and a passing test locally.
 */
const TRACK_CLASSES: Record<string, string> = {
  'track-design': 'bg-track-design text-track-design-ink',
  'track-product': 'bg-track-product text-track-product-ink',
  'track-tech': 'bg-track-tech text-track-tech-ink',
  'track-keynote': 'bg-track-keynote text-track-keynote-ink',
}

/** The defined neutral. Named rather than inline so the fallback is itself a design decision. */
const UNKNOWN_TRACK_CLASSES = 'bg-track-unknown text-track-unknown-ink'

export const trackClassesFor = (colorToken: string): string =>
  TRACK_CLASSES[colorToken] ?? UNKNOWN_TRACK_CLASSES
