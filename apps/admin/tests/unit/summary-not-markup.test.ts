import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T187, admin half (014 tranche 2) — **this product never renders a session's summary as
 * clickable markup** (FR-1054, FR-1052).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SUMMARY STAYS A PLAIN PARAGRAPH, AND THAT IS WHAT KEEPS FR-1052's REFUSAL WHOLE.**
 *
 * REQ-013 proposed carrying a virtual session's joining link in the description, and FR-1052
 * refused it three times over: the summary is long free text nothing parses, it is enumerated
 * as content that does not notify, and rendering organizer-authored free text as clickable
 * markup would be a new injection surface authored by a promoted attendee. The dedicated,
 * validated `accessLink` field is the ONLY route by which a link reaches anybody — and that
 * stays true exactly as long as no component undoes it locally with a markdown renderer, an
 * autolinker, or a raw-HTML sink. One component doing so re-opens REQ-013 without a decision.
 *
 * Scoped to `apps/admin/src`; the attendee product's half of FR-1054 is asserted in its own
 * suite. Comments are stripped before matching (009's guards' discipline): every pattern below
 * also appears in this prose, and matching raw text would fail this correct file first.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const adminSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

const files = sourceFiles(adminSrc)
const label = (path: string): string => path.slice(adminSrc.length)

describe('the administrative product renders no summary as markup (T187, FR-1054)', () => {
  it('found source to audit, including the surfaces that hold a summary', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((path) => /summary/i.test(codeOnly(path)))).toBe(true)
  })

  it('has no raw-HTML sink anywhere', () => {
    // Not merely near summaries: `dangerouslySetInnerHTML` anywhere in this product is a sink
    // waiting for organizer-authored text to reach it, and nothing here has a use for one.
    const offending = files.filter((path) => codeOnly(path).includes('dangerouslySetInnerHTML'))
    expect(
      offending.map(label),
      'A raw-HTML sink exists in the administrative product. FR-1054 forbids any raw-HTML ' +
        'rendering path over session surfaces, and this product has no legitimate use for one ' +
        'anywhere.',
    ).toEqual([])
  })

  it('depends on no markdown renderer or autolinker', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })

    const renderers =
      /markdown|marked|remark|rehype|showdown|linkify|autolink|sanitize-html|dompurify|html-react-parser/i
    expect(
      declared.filter((name) => renderers.test(name)),
      'The administrative product depends on a markdown renderer, autolinker or HTML parser. ' +
        'FR-1054 keeps the summary a plain paragraph; a rendering dependency is the first ' +
        'commit of undoing that one component at a time.',
    ).toEqual([])
  })

  it('never turns a summary into a link or element markup on any line', () => {
    // The line-level guard: wherever a summary is read, it must not feed an anchor, an href,
    // element construction or a parser on the same line. The dedicated `accessLink` field is
    // the only value that may ever become an <a>, and it never rides under the name `summary`.
    const markup = /<a\s|href=|linkify|marked\s*\(|parse\s*\(|innerHTML/i

    const offending = files.flatMap((path) =>
      codeOnly(path)
        .split('\n')
        .filter((line) => /\bsummary\b/i.test(line) && markup.test(line))
        .map((line) => `${label(path)}: ${line.trim()}`),
    )

    expect(
      offending,
      'A line of this product reads a summary and builds markup from it. The summary is ' +
        'organizer-authored free text and stays a plain paragraph (FR-1054); the validated ' +
        'accessLink field is the only route by which a link reaches anybody (FR-1052).',
    ).toEqual([])
  })
})
