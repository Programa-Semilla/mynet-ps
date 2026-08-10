import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { PRODUCT_NAME, PRODUCT_SHORT_NAME, PRODUCT_TAGLINE } from './src/app/branding.js'
import { devBranchLegend } from './src/dev/branch-plugin.js'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The dev server and `vite preview` must both answer on the port this instance was assigned,
 * because the API's CORS allow-list is the single origin in WEB_ORIGIN. Vite loads `.env.local`
 * natively via `envDir`, but that happens after this config is evaluated — so the port is read
 * from the process environment, which `pnpm start` sets on the child it spawns.
 */
const webPort = Number(process.env['MYNET_WEB_PORT'] ?? 5173)

/**
 * Reads a colour token out of the token file at build time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The web app manifest needs `background_color` and `theme_color`, and a manifest is static
 * JSON that cannot reference a CSS custom property. The obvious move is to write the two hex
 * values here — and `mynet/no-colour-literals` rejects that, correctly. FR-008 says every colour
 * is defined in one place, and "except the two in the manifest" is how that stops being true.
 *
 * So the values are read from that one place instead. This keeps SC-009's count at zero without
 * an exemption, and means a palette change reaches the installed application's splash screen
 * along with everything else.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const readColourToken = (name: string): string => {
  const tokens = readFileSync(resolve('./src/theme/tokens.css'), 'utf8')
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)
  if (!match?.[1]) {
    throw new Error(`Design token --${name} is not defined in src/theme/tokens.css.`)
  }
  return match[1].trim()
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    // Dev server only — see the note at the top of the plugin. Absent from every build.
    devBranchLegend(),

    /**
     * T095, T096, T098 — the installable PWA and its bounded offline behaviour
     * (FR-048–FR-051, FR-055, research.md D14).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **The application shell is precached. API responses are never cached, at all.**
     *
     * That single rule is what makes offline *honest* rather than merely functional. A cached
     * `/events` response would let the shell render somebody's schedule from last Tuesday with
     * no indication it was stale — which FR-052 forbids and which, for a conference agenda, is
     * worse than showing nothing. Instead the shell renders, the offline state says what is
     * unavailable, and server-dependent actions are refused (FR-053).
     *
     * It also satisfies FR-056 almost for free: no attendee data is ever written to a cache, so
     * signing out cannot leave any behind.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    VitePWA({
      // The new service worker takes over on the next launch rather than demanding a reload
      // mid-session. FR-055 asks that a new deployment supersede stale assets "by the next
      // launch at the latest", which is exactly this behaviour.
      registerType: 'prompt',
      injectRegister: 'auto',

      // ── T117 (007) — `generateSW` → `injectManifest` (research R2) ──────────────────────
      //
      // **A `push` handler is code, and generated-service-worker configuration cannot express
      // one.** So `src/sw.ts` becomes the worker and the build only substitutes the precache
      // manifest into it. Registering a *second* worker was rejected outright: one scope means
      // one worker, and two would race for control of the same clients.
      //
      // Everything the `workbox` block below used to configure is carried across explicitly in
      // `src/sw.ts`, with the reason each line existed — including the API denylist, which is the
      // one that matters most: dropping it would answer API requests with the HTML shell.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',

      manifest: {
        // FR-049, SC-013 — every name comes from the single branding constant. The product
        // cannot be called MyNet in the shell and something else on the home screen.
        name: PRODUCT_NAME,
        short_name: PRODUCT_SHORT_NAME,
        description: PRODUCT_TAGLINE,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        // Read from the token file rather than written here — see `readColourToken` (FR-008).
        background_color: readColourToken('color-cream-100'),
        theme_color: readColourToken('color-navy-800'),
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      /**
       * ── What survives the move to `injectManifest`, and what does not ──────────────────
       *
       * `injectManifest` reads only the **manifest-generation** options from here; every
       * behavioural option — `navigateFallback`, the denylist, `clientsClaim`, `skipWaiting`,
       * `cleanupOutdatedCaches`, `runtimeCaching` — is now code in `src/sw.ts`, because that is
       * the whole point of the strategy change.
       *
       * They are not lost. Each is reproduced there beside the reason it existed, so a reader
       * comparing this diff can see that nothing was dropped in the move — which is the risk
       * research R2 flagged as the highest in the feature.
       */
      injectManifest: {
        // Content-hashed filenames, so a new deployment's manifest differs and the old entries
        // are evicted. FR-055 without hand-written cache-versioning logic.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Sourcemaps are for the reviewer, not the attendee.
        globIgnores: ['**/*.map'],
      },

      /**
       * ═══════════════════════════════════════════════════════════════════════════════════════
       * **THE WORKER RUNS IN `vite dev` TOO, AND 007 IS WHY THAT CHANGED.**
       *
       * This was `enabled: false`, decided in 001 on the reasoning that the worker only had to
       * exist where the end-to-end offline suite runs — `vite preview`. That was true while the
       * worker's whole job was caching the shell.
       *
       * **Web Push is impossible without a registered service worker.** With it off, `pnpm start`
       * could not subscribe, could not receive, and could not run `quickstart.md` scenario 5 at
       * all — the failure looked like a defect (a "Turn on notifications" button that goes quiet)
       * rather than like a missing prerequisite, and the workaround was a two-terminal build-and-
       * preview dance for what is otherwise a one-command project.
       *
       * `type: 'module'` because `src/sw.ts` is an ES module; without it the dev worker is served
       * as a classic script and its imports fail.
       * ═══════════════════════════════════════════════════════════════════════════════════════
       */
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  // Vite reads `.env` from the project root by default, which here is `apps/web`. The single
  // `.env` this workspace documents in `.env.example` sits at the repository root, so without
  // this the client silently builds with no `VITE_API_BASE_URL` and calls its own origin.
  // Only `VITE_`-prefixed values are exposed, so pointing at the shared file does not widen
  // what reaches the bundle (FR-041).
  envDir: resolve('../..'),
  resolve: {
    alias: {
      '@mynet/platform/web': resolve('../../packages/platform/src/web/index.ts'),
      '@mynet/platform': resolve('../../packages/platform/src/index.ts'),
      '@mynet/data/http': resolve('../../packages/data/src/http/index.ts'),
      '@mynet/data': resolve('../../packages/data/src/index.ts'),
      '@': resolve('./src'),
    },
  },
  server: {
    port: webPort,
  },
  // The end-to-end suite runs against `vite preview`, and the API's CORS allow-list is a single
  // origin read from WEB_ORIGIN. Preview must therefore answer on the same port the dev server
  // does, rather than Vite's default 4173 — otherwise every cross-origin request in the suite
  // is refused for a reason that has nothing to do with the code under test.
  preview: {
    port: webPort,
    strictPort: true,
  },
  build: {
    // Sourcemaps are what make the asset-budget failure legible: FR-072 fails the build on
    // total size, and the reviewer needs to see *what* grew, not just that it did.
    sourcemap: true,
    // The budget check reads this to find the entry chunk and everything it statically imports.
    // Globbing `dist/assets/*.js` would count lazily-loaded chunks that the shell never
    // downloads, which is a different number from the one FR-072 is about.
    manifest: true,
  },
})
