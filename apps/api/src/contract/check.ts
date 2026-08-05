/**
 * T031 — fail when the committed contract is stale (FR-044b).
 *
 * Regenerates the document from the live route schemas and compares it to what is committed.
 * A developer who changes a response shape must commit the regenerated contract, which is
 * precisely what puts the change in front of a reviewer.
 *
 * **Known limitation, recorded as spec Open Question 19**: this makes contract changes
 * *visible*, not *classified*. Nothing here distinguishes an additive change from a breaking
 * one. A semantic diff that fails only on breaking changes is a candidate for a later slice.
 */
import { readFileSync } from 'node:fs'

import { buildContractDocument, CONTRACT_PATH } from './document.js'

const generated = await buildContractDocument()

let committed: string
try {
  committed = readFileSync(CONTRACT_PATH, 'utf8')
} catch {
  console.error(
    `No committed contract at ${CONTRACT_PATH}.\n` +
      'Run `pnpm contract:generate` and commit the result (FR-044b).',
  )
  process.exit(1)
}

if (committed !== generated) {
  console.error(
    'The committed API contract is stale.\n\n' +
      'The route schemas no longer produce the document in contracts/openapi.json.\n' +
      'Run `pnpm contract:generate` and commit the result, so the change appears in the\n' +
      'pull request diff where a reviewer sees it (FR-044b).\n\n' +
      'Do not edit contracts/openapi.json by hand — it is an output. To change the contract,\n' +
      'change the route schema.',
  )
  process.exit(1)
}

console.warn('API contract is up to date.')
