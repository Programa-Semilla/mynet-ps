/**
 * T076 (010) — **this is not production, and every view says so** (FR-828, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **UAT IS OPENLY REACHABLE AND CARRIES A REAL SIGN-UP FORM, WHICH IS WHY THIS EXISTS.**
 *
 * Constitution v3.4.0 (decision 30) put the environment on a public address with no credential
 * and no allowlist, because the validation it exists for — service-worker registration, Web Push,
 * a physical-device test on cellular — is disabled by putting a door in front of it. The cost of
 * that decision is that somebody can arrive here having followed a link, see a working product,
 * and create an account believing it is the real one.
 *
 * The marker is what makes that mistake impossible to make silently.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FOUR CONSTRAINTS, AND EACH ONE REJECTS AN OBVIOUS IMPLEMENTATION.**
 *
 *   1. **Text, not colour or position alone.** A coral stripe along the top would read as "this
 *      is different" to somebody who can see it and as nothing at all to somebody who cannot.
 *   2. **Available to assistive technology.** So the short visible token has a full sentence
 *      beside it, and only one of the two is announced.
 *   3. **Not interactive and not focusable.** A `<span>`, not a badge component, not a link to an
 *      explanation. A focus stop added to every view is a real cost paid on every keyboard
 *      journey through the product, for something nobody can act on.
 *   4. **Not dismissible.** There is no close control, because an environment marker that can be
 *      turned off is one that is off at the moment it matters.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **INSIDE THE EXISTING HEADER, NOT A NEW BAND ABOVE IT — AND MOBILE IS WHY.**
 *
 * A full-width band is the conventional answer and it costs vertical space on *every* screen.
 * Principle III puts a success criterion on the first viewport, and at 320px this header already
 * shares one row between the product name, the conference switcher, the attendee's name and the
 * sign-out control. The marker therefore has to be the smallest thing in that row, and it is: a
 * three-character token that shrinks last because it never truncates.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The `__UAT_MARKER__` guard is a build-time literal (see `vite.config.ts`). In a production
 * build it is `false`, this returns `null` before any string is reachable, and the bundler removes
 * the element entirely — which is FR-828's "MUST NOT appear in a production build" as a property
 * of the artifact rather than of a runtime check.
 */
export const EnvironmentMarker = () => {
  if (!__UAT_MARKER__) return null

  return (
    <span
      // `aria-hidden` on the token and a full sentence beside it: "UAT" is three characters a
      // screen reader would spell out as letters, and "you are looking at a test environment" is
      // the thing that actually needs saying. Two elements, one announcement.
      className="shrink-0 rounded-sm border border-coral-300 bg-coral-50 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-coral-700"
    >
      <span aria-hidden="true">UAT</span>
      <span className="sr-only">
        Test environment. This is not the live MyNet — anything you do here is test data.
      </span>
    </span>
  )
}
