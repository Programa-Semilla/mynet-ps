import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { PRODUCT_NAME, PRODUCT_SHORT_NAME, PRODUCT_TAGLINE } from './src/app/branding.js'
import { ICONS, SCREENSHOTS } from './src/app/icons.js'
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
 * T059 (010) — the VAPID public key, resolved from ONE name (FR-853).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`loadEnv` IS LOAD-BEARING, AND LEAVING IT OUT BREAKS LOCAL DEVELOPMENT SILENTLY.**
 *
 * Vite reads `.env` into `import.meta.env`, not into `process.env` — and only `VITE_`-prefixed
 * keys at that. So `process.env['PUSH_VAPID_PUBLIC_KEY']` is undefined during `pnpm start` no
 * matter what the repository `.env` says, and the failure is the quiet kind: `isSupported()`
 * returns false, no permission is ever requested, and notifications simply never appear with
 * nothing anywhere reporting a problem.
 *
 * `loadEnv(mode, dir, '')` — the empty prefix — reads every key from that same file. The process
 * environment still wins, because that is what `deploy.sh` sets when it builds for a deployment.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const rootEnv = loadEnv(process.env['NODE_ENV'] ?? 'development', resolve('../..'), '')
const vapidPublicKey =
  process.env['PUSH_VAPID_PUBLIC_KEY'] ?? rootEnv['PUSH_VAPID_PUBLIC_KEY'] ?? ''

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

      /**
       * T-deep-review (010) — **the install icons are not shell assets, so they are not
       * precached** (the reasoning FR-815d gives for screenshots, applied where it also holds).
       *
       * ─────────────────────────────────────────────────────────────────────────────────────
       * Manifest icons and favicons are fetched by the **browser process**, not from a document,
       * so those requests never reach the service worker's `fetch` handler and can never be
       * answered from the precache. Storing them there downloads ~79KB onto every device at
       * install to satisfy requests that will not arrive.
       *
       * `globIgnores` alone does **not** achieve this, which is worth knowing before someone
       * tries: this plugin appends every manifest-declared icon to the precache list *after* the
       * glob runs, so the four icons come back regardless of the pattern. Measured — with
       * `icons/**` ignored and this flag absent, all four were still in `dist/sw.js`. This option
       * is the one that governs them.
       *
       * The two **in-app** marks stay precached, and that asymmetry is the point: they are
       * rendered by the shell, on every page, and must be there offline.
       * ─────────────────────────────────────────────────────────────────────────────────────
       */
      includeManifestIcons: false,

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
        /**
         * T029, T029a (010) — declared once, in `src/app/icons.ts`, and read from there.
         *
         * The manifest used to spell these out here, where no test could see them: a manifest
         * naming a file that is not on disk passes every one of this project's ten correctness
         * gates and fails only when a real device tries to install. Sharing the module lets
         * `tests/unit/icon-declarations.test.ts` derive its expectations from the declarations
         * themselves, so a new icon is checked **by existing**.
         *
         * `readColourToken` deliberately stays here rather than moving with them — it does file
         * I/O the browser program must never see, and FR-829 keeps `theme_color` and
         * `background_color` derived from the token file rather than from the brand constants.
         */
        // Copied rather than passed by reference: the declarations are `readonly` on purpose —
        // a manifest entry is a contract with a file on disk, not a list for a plugin to edit.
        //
        // **Both unconditional.** `screenshots` was briefly guarded by `SCREENSHOTS.length > 0`,
        // left over from the phase where the files did not exist yet. That guard failed *open* in
        // the mirror of this feature's whole thesis: emptying the array would silently drop the
        // manifest key, and the existence gate — which derives its cases from the same array —
        // would pass vacuously. Nothing would notice the screenshots had gone.
        icons: [...ICONS],
        screenshots: [...SCREENSHOTS],
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
        //
        // T054 (010) — and the install-prompt screenshots are for the **platform**, fetched when
        // it offers to install and never again. They are the largest files in `public/`, so
        // precaching them would put roughly 430KB of prompt illustration into the install
        // download of every attendee who has already accepted the prompt (FR-815d).
        globIgnores: [
          '**/*.map',
          'screenshots/**',
          // Browser-process fetches, never seen by the worker — see `includeManifestIcons`.
          'icons/**',
          'apple-touch-icon.png',
          'favicon*.png',
          'favicon.ico',
        ],
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
  /**
   * T075 (010) — **the UAT marker is a BUILD-TIME constant, and that is what makes FR-828's
   * "MUST NOT appear in a production build" structural rather than conditional** (research R6).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **A RUNTIME HOSTNAME CHECK WOULD HAVE BEEN THE OBVIOUS IMPLEMENTATION AND IS THE WRONG ONE.**
   *
   * `location.hostname !== 'mynetcr.com'` ships the marker's markup and its wording to production
   * and relies on a comparison being right. The requirement is not "the marker is hidden in
   * production" — it is that the production bundle **does not contain it**. Those differ the day
   * somebody mistypes the comparison, and they differ for anybody reading the shipped bundle.
   *
   * `define` substitutes a literal `true` or `false` before minification, so the entire element —
   * markup, strings and all — is dead code the bundler removes. `tests/unit/uat-marker-absent`
   * asserts that against a real production build rather than trusting this comment.
   *
   * Deliberately NOT read as `import.meta.env.VITE_UAT_MARKER` at the usage site: Vite only
   * statically replaces keys that are actually present in the environment, so an unset variable
   * can survive as a runtime lookup against the env object — which is exactly the outcome this
   * exists to prevent. A `define` is a literal either way.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  define: {
    __UAT_MARKER__: JSON.stringify(process.env['VITE_UAT_MARKER'] === 'true'),

    /**
     * T059 (010) — **one name for the VAPID public key, read by the API and by this build**
     * (FR-853).
     *
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **IT WAS CONFIGURED TWICE, AND NOTHING CHECKED THE TWO AGREED.**
     *
     * `PUSH_VAPID_PUBLIC_KEY` for the API and `VITE_PUSH_VAPID_PUBLIC_KEY` for the client — the
     * same key, spelled twice, in one file. The `vapid-config-duplication` inbox entry raised it
     * and said to settle it when the real adapter landed. It has landed.
     *
     * Two copies of a key is not a tidiness problem. A public key from one pair with a private
     * key from another produces a push service that rejects **every** delivery with a 403, and a
     * product that looks like it is working: subscriptions are created, sends are accepted, and
     * nothing ever arrives. `config.ts` already refuses to start with only half a pair; it
     * cannot detect halves of two *different* pairs, and neither could anything else.
     *
     * Reading the unprefixed name through `define` gives one variable for both consumers. The
     * `VITE_` prefix exists to stop secrets reaching the bundle — this is a **public** key, and
     * the prefix was never what made it safe to ship. `define` substitutes it as a literal, so
     * the rule the prefix enforces is untouched: nothing else becomes reachable.
     *
     * Serving it from the API was the other candidate and is what the configuration contract
     * suggests. It would have cost a new route, which FR-891 forbids this feature outright.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    __VAPID_PUBLIC_KEY__: JSON.stringify(vapidPublicKey),
  },
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
