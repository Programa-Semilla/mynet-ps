import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T086 (004) — **no photograph of a real person may ship as a seeded attendee avatar**
 * (FR-354).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The prototype's sample data uses **Unsplash photographs of real people**. CLAUDE.md records
 * them as prototype artifacts, and `GroundZero/prototype/` is an approved visual reference
 * rather than production code — but the five 1024×1024 avatar PNGs in it are the most
 * obviously reusable thing in the whole export, and "we need faces in the directory" is exactly
 * the moment somebody would reach for them.
 *
 * They must not be reached for, and the reason is not licensing. **This repository is public**
 * (register entry 16), the seed runs against every preview environment, and 006 builds a
 * directory of people. Shipping those images would attribute a real person's likeness to a
 * fictional attendee, in public, with no consent and no way for the person to find out — which
 * is the same class of harm this feature spends FR-349 on preventing at the other end.
 *
 * The seeded attendees therefore have **no avatar at all**, and every surface renders the
 * non-photographic fallback (FR-351). That is a state a reviewer sees at first run rather than
 * an omission — it is what the fallback is for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const apiRoot = fileURLToPath(new URL('../../', import.meta.url))
const seedDir = join(apiRoot, 'src/db/seed')

/**
 * The seed's **code**, with comments removed.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Stripped deliberately, and the reason is a defect this test had on its first run: the seed
 * explains *why* it ships no photographs, and the explanation necessarily names the prototype
 * and the word "Unsplash". A scan over raw text therefore failed on the sentence that documents
 * the rule being enforced — a test that punishes writing down its own reasoning is a test that
 * will have that reasoning deleted.
 *
 * Every assertion here is about what the seed *does*, so code is what it should read.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const seedSources = (): Array<{ file: string; source: string }> =>
  readdirSync(seedDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({
      file,
      source: withoutComments(readFileSync(join(seedDir, file), 'utf8')),
    }))

describe('seeded attendees ship no photographs (T086, FR-354)', () => {
  const sources = seedSources()

  it('found the seed to audit', () => {
    // A gate that cannot fail is not a gate: if the seed moved, every assertion below would
    // pass over an empty list while checking nothing.
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.map((s) => s.file)).toContain('attendees.ts')
  })

  it('sets no avatar object key anywhere in the seed', () => {
    // `avatar_object_key` is the only column that can point a seeded attendee at image bytes.
    // The seed never writes it, so seeded accounts render the fallback — asserted on the seed
    // rather than on the database, because this must hold before anything runs.
    const offending = sources.filter(({ source }) =>
      /avatarObjectKey|avatar_object_key/.test(source),
    )

    expect(
      offending.map((s) => s.file),
      'A seeded avatar key would point at bytes that had to come from somewhere — and the only ' +
        'images in this repository are photographs of real people (FR-354).',
    ).toEqual([])
  })

  it('writes nothing into stored_objects from the seed', () => {
    const offending = sources.filter(({ source }) => /stored_objects|storedObjects/.test(source))

    expect(offending.map((s) => s.file)).toEqual([])
  })

  it('references no image file, in any format', () => {
    const IMAGE = /\.(png|jpe?g|webp|avif|gif|heic|heif)\b/i

    const offending = sources.filter(({ source }) => IMAGE.test(source)).map((s) => s.file)

    expect(
      offending,
      'The seed must not read an image from disk. There is nowhere legitimate for one to come ' +
        "from: the prototype's avatars are photographs of real people, and this repository is " +
        'public (register entry 16).',
    ).toEqual([])
  })

  it('references nothing from the prototype, which is where the photographs live', () => {
    const offending = sources
      .filter(({ source }) => /GroundZero|prototype|unsplash/i.test(source))
      .map((s) => s.file)

    expect(offending).toEqual([])
  })

  it('ships no image files alongside the seed', () => {
    // The other way this arrives: not a reference in code, but a directory of faces committed
    // next to the module that would obviously use them.
    const IMAGE = /\.(png|jpe?g|webp|avif|gif|heic|heif)$/i

    const walk = (dir: string, found: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, found)
        else if (IMAGE.test(entry)) found.push(full)
      }
      return found
    }

    expect(walk(seedDir)).toEqual([])
  })
})
