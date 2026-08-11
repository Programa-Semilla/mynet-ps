/**
 * Shared lint and formatting configuration (T007, T013).
 *
 * FR-004 requires linting to be enforced. Two rules here are not style preferences but the
 * machine-checked form of success criteria: `mynet/no-colour-literals` is SC-009, and
 * `mynet/no-direct-platform-access` is SC-008 (registered in T106).
 */
import js from '@eslint/js'
import css from '@eslint/css'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import mynet from './eslint-plugin-mynet.js'

/** The one file in the repository where a colour may be written literally (FR-008). */
export const TOKEN_FILE = 'apps/web/src/theme/tokens.css'

/** Everything ESLint should treat as script. CSS is handled by its own language block. */
const SCRIPT_FILES = ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}']

export default tseslint.config(
  {
    name: 'mynet/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Generated from contracts/openapi.json — an output, never edited by hand.
      'packages/data/src/generated/**',
      // Drizzle-generated SQL and its journal.
      'apps/api/migrations/**',
      // Approved visual reference, explicitly not production code (constitution Principle II).
      'GroundZero/prototype/**',
    ],
  },

  // The recommended sets carry no `files` restriction of their own, so they would otherwise
  // apply to CSS too — and core JS rules crash when handed a CSS source tree. Scope them to
  // the languages they were written for.
  { ...js.configs.recommended, files: SCRIPT_FILES },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: SCRIPT_FILES })),

  {
    name: 'mynet/typescript',
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { mynet },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  /**
   * T073 (002) — **closes the branded `EventScope`'s one escape hatch** (FR-147, research D2).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * The brand makes verification a precondition of reading: a handler that skipped
   * `requireEventAccess` has no `EventScope` and cannot call the query layer. The compiler
   * enforces that — with one gap, stated openly in research D2 rather than hidden: **a type
   * assertion defeats any branded type.**
   *
   * `as EventScope` anywhere outside the guard would compile cleanly, pass the route audit, and
   * read a conference the attendee is not registered for. This turns that bypass into a lint
   * failure rather than an invisible one.
   *
   * It is a guard against forgetting, not against a determined author — someone who wants to
   * get round it can. That is the honest limit of the mechanism, and it is why the brand is
   * paired with the route audit and the isolation suite rather than presented alone.
   *
   * The one legitimate construction site is `plugins/event-access.ts`, exempted below.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  {
    name: 'mynet/event-scope-brand',
    files: ['apps/api/**/*.{ts,tsx,mts,cts}'],
    ignores: ['apps/api/src/plugins/event-access.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSTypeReference > Identifier[name="EventScope"]',
          message:
            'Do not assert a value to EventScope. It is proof that the attendee is registered ' +
            'for the event, and the only place that proof can be produced is requireEventAccess ' +
            'in plugins/event-access.ts. An assertion here fabricates the proof and reads ' +
            'another conference (FR-147, research D2).',
        },
        {
          selector: 'TSTypeAssertion > TSTypeReference > Identifier[name="EventScope"]',
          message: 'Do not assert a value to EventScope — see plugins/event-access.ts (FR-147).',
        },
        {
          // A one-line local alias defeated the two selectors above: `type A = EventScope` and
          // then `x as unknown as A` matched neither, because both key on the identifier text.
          selector: 'TSTypeAliasDeclaration > TSTypeReference > Identifier[name="EventScope"]',
          message:
            'Do not alias EventScope. An alias defeats the assertion rules above, which match ' +
            'on the type name. Use EventScope directly (FR-147).',
        },
      ],
    },
  },

  /**
   * T016 (007) — the same three selectors for `ConversationScope` (FR-523, research R9).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **A SIBLING BLOCK RATHER THAN THREE MORE SELECTORS IN THE ONE ABOVE, AND THAT IS
   * DELIBERATE: THE TWO BRANDS HAVE DIFFERENT LEGITIMATE CONSTRUCTION SITES.**
   *
   * `ignores` exempts a whole file from every selector in its block. Folding these into the
   * event block would mean listing `participation.ts` there too — and that file would then be
   * free to assert `as EventScope`, while `event-access.ts` would be free to assert
   * `as ConversationScope`. Each exemption would silently widen to cover a brand it has no
   * business constructing.
   *
   * Two blocks, two ignore lists, each exempting exactly the one module that may construct the
   * one brand. Everything else about the reasoning is the event block's, above, unchanged: the
   * type assertion is the brand's single remaining escape hatch, this makes using it a lint
   * failure rather than an invisible one, and it guards against forgetting rather than against
   * a determined author.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  {
    name: 'mynet/conversation-scope-brand',
    files: ['apps/api/**/*.{ts,tsx,mts,cts}'],
    ignores: ['apps/api/src/plugins/participation.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSTypeReference > Identifier[name="ConversationScope"]',
          message:
            'Do not assert a value to ConversationScope. It is proof that the attendee ' +
            'participates in the conversation, and the only place that proof can be produced is ' +
            'requireParticipation in plugins/participation.ts. An assertion here fabricates the ' +
            "proof and reads somebody else's correspondence (FR-523, research R9).",
        },
        {
          selector: 'TSTypeAssertion > TSTypeReference > Identifier[name="ConversationScope"]',
          message:
            'Do not assert a value to ConversationScope — see plugins/participation.ts (FR-523).',
        },
        {
          // Same alias bypass the event rule had to close: `type A = ConversationScope` followed
          // by `x as unknown as A` matches neither selector above, because both key on the name.
          selector:
            'TSTypeAliasDeclaration > TSTypeReference > Identifier[name="ConversationScope"]',
          message:
            'Do not alias ConversationScope. An alias defeats the assertion rules above, which ' +
            'match on the type name. Use ConversationScope directly (FR-523).',
        },
      ],
    },
  },

  /**
   * T017 (004) — **the `StorageService` boundary, made machine-checked** (FR-352, FR-393).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * FR-352 says image bytes are read and written **only** through a project-owned interface and
   * that no feature code may call a storage vendor's API directly. Without this rule that is a
   * sentence in a specification, not a boundary — exactly as the branded `EventScope` needed
   * `mynet/event-scope-brand` to close its assertion escape hatch, and as SC-008 needed
   * `mynet/no-direct-platform-access` to be a count rather than a habit.
   *
   * Two groups, and they defend against different mistakes:
   *
   *   1. **The vendor SDKs.** Register entry 11 has not chosen one, so this list is what the
   *      plausible candidates are called today and **must be extended in the same change that
   *      answers that entry**. An unlisted vendor would pass, which is the honest limit of a
   *      name-matching rule — the same limit `mynet/event-scope-brand` states about a
   *      determined author.
   *
   *   2. **`db/schema/stored-objects.js`** — and this is the one that bites *now*. The
   *      development, test and preview backend is a table, so the way this boundary actually
   *      gets breached today is a handler importing that table and reading avatar bytes with a
   *      `SELECT` instead of `storage.get()`. That would work perfectly until the day the
   *      production adapter is a bucket and the table is empty. This is the current vendor, and
   *      it is restricted like one.
   *
   * `apps/api/src/storage/` is the single exempted directory: implementing the interface is
   * precisely where the real call belongs, which is the same exemption `packages/platform/web`
   * and `packages/data/http` already carry on the client side.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  {
    name: 'mynet/vendor-boundary',
    files: ['apps/api/**/*.{ts,tsx,mts,cts}'],
    ignores: [
      'apps/api/src/storage/**',
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 007 — the same exemption for the push adapter, and it is in **this** block rather than a
      // block of its own for a reason worth knowing: ESLint flat config does not merge rule
      // options. A second block setting `no-restricted-imports` for the same files silently
      // *replaces* this one, so a separate push-boundary block looked correct, reported nothing,
      // and disabled the storage boundary while it did — verified by probing it with a real
      // violating import, which passed.
      //
      // The cost of folding them together is that this directory is also exempt from the storage
      // patterns, and `storage/**` from the push one. Both are cross-vendor imports nobody has a
      // reason to write, and both would be plain in review — a smaller risk than two boundaries
      // where one quietly cancels the other.
      // ─────────────────────────────────────────────────────────────────────────────────────
      'apps/api/src/notifications/**',
      'apps/api/tests/unit/web-push-adapter.test.ts',
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 010 (T030) — the same exemption for the SMTP adapter, and it is in **this** block for
      // the reason the note above records: ESLint flat config does not merge rule options, so a
      // sibling block setting `no-restricted-imports` for these files would silently *replace*
      // this one and disable both existing boundaries while appearing to add a third.
      // ─────────────────────────────────────────────────────────────────────────────────────
      'apps/api/src/mail/**',
      // The schema barrel re-exports every table by design, and the deletion-coverage guard
      // depends on it listing all of them — a table that could hide from the registry could
      // hide from the guard. Re-exporting is not consuming; the third pattern below is what
      // stops a consumer reaching the table *through* the barrel.
      'apps/api/src/db/schema/index.ts',
      // `import * as schema` — the registry as a whole, handed to Drizzle so relational queries
      // resolve. It consumes the barrel, not the table: a namespace import cannot be narrowed
      // by `importNames`, so the rule cannot tell this apart from reaching for `storedObjects`
      // and this is the one file where the whole registry is legitimately the point.
      'apps/api/src/db/client.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@aws-sdk/client-s3',
                '@aws-sdk/client-s3/**',
                '@aws-sdk/s3-request-presigner',
                '@google-cloud/storage',
                '@azure/storage-blob',
                '@supabase/storage-js',
                'firebase-admin/storage',
                '@cloudflare/workers-types',
                'minio',
              ],
              message:
                'Storage vendor SDKs are reachable only from apps/api/src/storage/, which is the ' +
                'one place StorageService is implemented (FR-352, FR-393, research D3). Call ' +
                '`app.storage` instead. If this import is a NEW vendor being adopted, add it to ' +
                "this list in the same change — a boundary that only names yesterday's vendors " +
                'is a boundary that passes while checking nothing.',
            },
            {
              group: ['web-push', 'web-push/**'],
              message:
                'The Web Push library is reachable only from apps/api/src/notifications/, which ' +
                'is the one place PushService is implemented. Call `app.push` instead — going ' +
                'direct bypasses the per-device timeout, the failure isolation, and the ' +
                "gone-versus-failed mapping that decides whether somebody's device registration " +
                'is discarded forever.',
            },
            {
              /**
               * 010 (T030) — the mail transport, confined to `apps/api/src/mail/` (FR-842).
               *
               * **The list is short because the decision made it short.** Research R3 chose SMTP
               * over Mailgun's HTTP API precisely so that no vendor package enters the tree at
               * all — there is no `mailgun.js` to restrict, and swapping providers is a change of
               * URL. What is restricted is the *transport*, because a route that reached for it
               * directly would bypass the port's three-methods-and-no-generic-send shape, which
               * is what has kept engagement notifications out of scope since 004.
               *
               * The Mailgun names are listed anyway, and deliberately: if a later change adopts
               * the HTTP API for bounce handling, it must land inside the mail module rather than
               * wherever the bounce is convenient.
               */
              group: [
                'nodemailer',
                'nodemailer/**',
                'mailgun.js',
                'mailgun.js/**',
                'form-data',
                '@sendgrid/mail',
                'postmark',
                'resend',
              ],
              message:
                'The mail transport is reachable only from apps/api/src/mail/, which is the one ' +
                'place MailService is implemented (FR-842). Call `app.mail` instead. Going ' +
                'direct bypasses the port, whose exactly-three-methods shape — two account ' +
                'messages and an operator report, no generic `send` — is what keeps engagement ' +
                'notifications out of scope. If this import is a NEW provider being adopted, add ' +
                "it to this list in the same change: a boundary naming only yesterday's vendors " +
                'is a boundary that passes while checking nothing.',
            },
            {
              group: ['**/schema/stored-objects.js', '**/schema/stored-objects.ts'],
              message:
                '`stored_objects` is the internal backing table of ONE StorageService adapter, ' +
                'not a domain table (research D3). Reading avatar bytes with a SELECT works today ' +
                'and stops working the day the production adapter is a bucket and the table is ' +
                'empty. Use `app.storage.get()` / `.put()` / `.delete()` (FR-352).',
            },
            {
              // The barrel is exempted above so it can re-export the table for the registry and
              // the deletion guard. Without this, that exemption would be a way in: an import of
              // `storedObjects` from `schema/index.js` reaches exactly what the pattern above
              // forbids, by a different path.
              group: ['**/db/schema/index.js', '**/db/schema/index.ts', '**/schema/index.js'],
              importNames: ['storedObjects', 'StoredObject'],
              message:
                'Reaching `storedObjects` through the schema barrel is the same breach as ' +
                'importing its module directly — see above. Use `app.storage` (FR-352).',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'mynet/client',
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { mynet, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      // SC-009 — zero colour literals outside the token file. The client is where colours
      // would otherwise accumulate; the prototype hardcoded seven of them throughout.
      'mynet/no-colour-literals': 'error',

      // SC-008 — zero direct platform and network calls in feature code (T106, FR-045).
      //
      // Registered here, on `apps/web/**`, which is exactly the feature and presentation code
      // constitution Principle V is about. The adapter layers are deliberately outside this
      // block: `packages/platform/src/web` and `packages/data/src/http` exist precisely to make
      // these calls, and forbidding them there would forbid implementing the interfaces at all.
      //
      // The composition root is exempted below — see `mynet/composition-root`.
      'mynet/no-direct-platform-access': 'error',

      ...reactHooks.configs.recommended.rules,

      /**
       * Accessibility, linted rather than only reviewed.
       *
       * This does **not** replace the axe checks in Playwright (T068) — a linter cannot see
       * focus indicators, contrast, or responsive layout, which is why SC-005 is asserted
       * against the rendered application. What it catches is the class of defect the
       * prototype shipped: a control with no accessible name, a label bound to nothing, an
       * interactive element that is a `<div>`. Catching those at lint is cheaper than
       * catching them in a browser.
       */
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },

  {
    /**
     * The composition root — the one module in `apps/web` allowed to name a platform API.
     *
     * Principle V is about *feature and presentation* code not reaching past the interfaces.
     * Something, somewhere, has to hand the real `fetch` to the HTTP client and the real device
     * implementations to the registry; that something is this file, and it is one file precisely
     * so the exemption is a single reviewable line rather than a habit.
     *
     * SC-008 counts violations in feature code. This is not feature code: it constructs no
     * requests, renders nothing, and is the only import of `@mynet/platform/web` in the client.
     */
    name: 'mynet/composition-root',
    files: ['apps/web/src/app/services.ts', 'apps/web/src/main.tsx'],
    rules: {
      'mynet/no-direct-platform-access': 'off',
    },
  },

  {
    /**
     * The service worker — an adapter, like `packages/platform/src/web`, that happens to live in
     * the client's source tree.
     *
     * 007 moved it from generated output to hand-written source (T118), and that move is what
     * makes this exemption necessary rather than cosmetic. A service worker has no registry to
     * reach through: `self.registration`, `self.clients` and `caches` are the only way to do
     * anything at all inside one, and there is no React tree to inject an interface into. It is
     * the same reasoning that puts `packages/platform/src/web` outside the block above.
     *
     * SC-008 counts violations in **feature code**, and this is not it: it renders nothing,
     * imports nothing from the application, and runs in a different global scope — one that
     * `tsconfig.sw.json` typechecks separately for the same reason.
     */
    name: 'mynet/service-worker',
    files: ['apps/web/src/sw.ts'],
    rules: {
      'mynet/no-direct-platform-access': 'off',
    },
  },

  {
    /**
     * Dev-server-only scaffolding: the local instance legend.
     *
     * These files mount a strip showing the branch and instance while `vite dev` is running.
     * They are excluded from every production build twice over — `main.tsx` imports them behind
     * `import.meta.env.DEV`, and the virtual module they depend on is provided by a plugin
     * declared `apply: 'serve'`. `e2e/navigation.spec.ts` asserts their absence from a real
     * production build, so this exemption rests on a check rather than on a promise.
     *
     * SC-008 counts violations in feature code. This is not feature code: it is not shipped.
     */
    name: 'mynet/dev-scaffolding',
    files: ['apps/web/src/dev/**/*.{ts,tsx}'],
    rules: {
      'mynet/no-direct-platform-access': 'off',
    },
  },

  {
    name: 'mynet/css',
    files: ['**/*.css'],
    language: 'css/css',
    plugins: { css, mynet },
    rules: {
      'css/no-duplicate-imports': 'error',
      'css/no-empty-blocks': 'error',
      // SC-009 again, on the other side of the language boundary. `allow` names the single
      // exempt file; everything else — component CSS, resets, print styles — must use tokens.
      'mynet/no-colour-literals': ['error', { allow: [TOKEN_FILE] }],
    },
  },

  {
    name: 'mynet/declaration-files',
    files: ['**/*.d.ts'],
    rules: {
      // A declaration file imports types that are used only inside `declare module` blocks.
      // ESLint's scope analysis does not traverse module augmentation, so every such import
      // reads as unused. The alternative is an inline disable comment on every one.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    name: 'mynet/tests',
    files: [
      '**/tests/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
    ],
    rules: {
      // A test double may name a literal the production code may not.
      'mynet/no-colour-literals': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    name: 'mynet/config-files',
    files: ['**/*.config.{js,ts,mjs}', '**/vitest.base.ts', 'packages/config/**/*.js'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
