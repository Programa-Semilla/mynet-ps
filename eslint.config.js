// The lint configuration lives in packages/config so every workspace package resolves the
// same rules from one place (T007). This file exists only so `eslint .` at the root finds it.
export { default } from './packages/config/eslint.config.js'
