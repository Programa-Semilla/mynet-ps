/// <reference types="vite/client" />

/**
 * T075 (010) — the build-time UAT marker flag (FR-828).
 *
 * Declared as a `const boolean` rather than as `boolean`, because that is what it is: `define` in
 * `vite.config.ts` substitutes a literal before minification, so the compiler can narrow on it and
 * the bundler can eliminate the branch. Typing it as a plain `boolean` would compile identically
 * and quietly give up the dead-code elimination that FR-828's "MUST NOT appear in a production
 * build" depends on.
 */
declare const __UAT_MARKER__: boolean

/**
 * T059 (010) — the VAPID public key, substituted from `PUSH_VAPID_PUBLIC_KEY` (FR-853).
 *
 * Empty string when unconfigured, which the composition root turns back into `undefined` —
 * absent is a supported state, and with no key `isSupported()` is false and nobody is ever asked
 * for permission.
 */
declare const __VAPID_PUBLIC_KEY__: string
