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
