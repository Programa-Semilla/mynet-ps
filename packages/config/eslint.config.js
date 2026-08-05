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

  {
    name: 'mynet/client',
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { mynet },
    rules: {
      // SC-009 — zero colour literals outside the token file. The client is where colours
      // would otherwise accumulate; the prototype hardcoded seven of them throughout.
      'mynet/no-colour-literals': 'error',
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
