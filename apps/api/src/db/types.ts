import { customType } from 'drizzle-orm/pg-core'

/**
 * PostgreSQL `citext` — case-insensitive text.
 *
 * FR-025b requires the attendee's email to be compared case-insensitively with surrounding
 * whitespace trimmed. Trimming is normalisation and belongs in application code; case
 * insensitivity is a *comparison* rule, and putting it in the column type means the database
 * enforces it rather than every call site remembering to lower-case first.
 *
 * This matters for the UNIQUE constraint specifically: with plain `text`, `Ada@example.com`
 * and `ada@example.com` are two rows, and FR-025a's "unique across the entire product" would
 * be false in exactly the case that lets one person hold two accounts.
 *
 * The extension is created by the initial migration (data-model.md, Migration ordering).
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext'
  },
})
