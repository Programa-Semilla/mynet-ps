/**
 * T030 — write the generated OpenAPI document to `contracts/openapi.json` (FR-044a).
 *
 * The server is the source of truth; the committed file is a snapshot, never an input.
 * Committing it is what puts every contract change in the diff where a reviewer sees it
 * (FR-044b, contracts/README.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { buildContractDocument, CONTRACT_PATH } from './document.js'

const document = await buildContractDocument()

mkdirSync(dirname(CONTRACT_PATH), { recursive: true })
writeFileSync(CONTRACT_PATH, document, 'utf8')

console.warn(`Wrote ${CONTRACT_PATH}`)
