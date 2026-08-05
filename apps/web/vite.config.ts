import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { PRODUCT_NAME, PRODUCT_SHORT_NAME, PRODUCT_TAGLINE } from './src/app/branding.js'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

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

      workbox: {
        // Content-hashed filenames, so a new deployment's precache manifest differs and the old
        // entries are evicted. This is FR-055 without hand-written cache-versioning logic.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Sourcemaps are for the reviewer, not the attendee. Precaching them would multiply the
        // install payload for no benefit.
        globIgnores: ['**/*.map'],

        // FR-051 — any in-scope address falls back to the shell, so a deep link to /network
        // opens offline and lands on the not-found-free real destination rather than a browser
        // error page.
        navigateFallback: 'index.html',
        // **The API is excluded from the fallback and from every cache.** Without this,
        // navigation requests to the API origin would be answered with the HTML shell, and a
        // failed request would look like a successful page load.
        navigateFallbackDenylist: [/^\/api\//],

        // No `runtimeCaching` entry exists, and none may be added for an API route. If a future
        // slice needs offline data it needs a recorded decision about staleness first
        // (constitution: optimistic updates and conflict resolution each require one).
        runtimeCaching: [],

        cleanupOutdatedCaches: true,

        // ── Update semantics, chosen as a pair (FR-055) ──────────────────────────────────
        //
        // `clientsClaim` without `skipWaiting` is the combination this slice wants:
        //
        // - **claim**: the worker controls the page it was installed on, so the offline shell
        //   works from the attendee's *first* visit. Without it, a first-time visitor who
        //   loses their connection before ever reloading gets a browser error page — which is
        //   precisely the case FR-051 exists for, at a conference venue with poor wifi.
        // - **no skipWaiting**: a new deployment does not replace a running version underneath
        //   somebody mid-session. It waits, and takes over at the next launch — which is
        //   exactly the latitude FR-055 allows ("by the next launch at the latest").
        //
        // Turning on `skipWaiting` (or `registerType: 'autoUpdate'`) would swap assets under a
        // live page and force a reload nothing warned the attendee about. There is no
        // update-prompt UI in this slice to do it politely, so it is not done at all.
        clientsClaim: true,
        skipWaiting: false,
      },

      // The service worker is disabled in `vite dev` but must be present in `vite preview`,
      // which is what the end-to-end offline suite runs against.
      devOptions: { enabled: false },
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
    port: 5173,
  },
  // The end-to-end suite runs against `vite preview`, and the API's CORS allow-list is a single
  // origin read from WEB_ORIGIN. Preview must therefore answer on the same port the dev server
  // does, rather than Vite's default 4173 — otherwise every cross-origin request in the suite
  // is refused for a reason that has nothing to do with the code under test.
  preview: {
    port: 5173,
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
