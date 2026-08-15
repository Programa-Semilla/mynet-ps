import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T187's attendee half (014 tranche 2) — **no session summary is ever rendered as clickable
 * markup, anywhere in MyNet** (FR-1054).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS IS AN ABSENCE WORTH A FILE.** FR-1052 gives the access link a dedicated,
 * validated, `https:`-only field, and FR-1053 refuses links anywhere else — which is only a
 * guarantee if the summary stays a plain paragraph. A markdown renderer, an autolinker or a
 * raw-HTML path over the summary would undo that refusal one component at a time: the summary
 * is organizer-authored free text nothing parses, and rendering it as markup would be a new
 * injection surface authored by a promoted attendee. So the absence is asserted over the whole
 * client, at three layers:
 *
 *   1. no markdown / autolink / HTML-sanitiser library is imported at all;
 *   2. no raw-HTML rendering path (`dangerouslySetInnerHTML`, `innerHTML =`) exists anywhere —
 *      today the count is zero, and zero is cheap to keep;
 *   3. the files that render a summary render it as a text child, and are named, so a new
 *      render site joins the scan by mentioning `.summary` rather than by being remembered.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Comments are stripped before matching, because the pattern names appear in the prose
 * explaining the absence — 009's absence-guard rule.
 */

const WEB_SRC = join(import.meta.dirname, '../../src')

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const codeOf = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')

const all = () => sourceFiles(WEB_SRC)

describe('FR-1054 — the summary stays a plain paragraph (T187, attendee half)', () => {
  it('scans a real tree — a gate that cannot fail is not a gate', () => {
    expect(all().length).toBeGreaterThan(40)
    // Non-vacuity for layer 3: the two render sites exist and mention `.summary`.
    const rendering = all().filter((path) => /\.summary\b/.test(codeOf(path)))
    expect(rendering.length).toBeGreaterThan(1)
  })

  it('imports no markdown renderer, autolinker or HTML sanitiser anywhere', () => {
    const offending = all().filter((path) =>
      /from\s+['"](react-markdown|marked|markdown-it|remark[\w-]*|rehype[\w-]*|showdown|linkify[\w-]*|autolinker|dompurify|sanitize-html)['"]/.test(
        codeOf(path),
      ),
    )

    expect(
      offending.map((path) => path.slice(WEB_SRC.length)),
      'A markup-rendering library reached the attendee client. FR-1054 keeps the summary a ' +
        'plain paragraph precisely so FR-1052’s dedicated field is the ONLY route by which a ' +
        'link reaches an attendee — a renderer undoes that refusal one component at a time, ' +
        'over organizer-authored free text.',
    ).toEqual([])
  })

  it('has no raw-HTML rendering path at all', () => {
    const offending = all().filter((path) =>
      /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/.test(codeOf(path)),
    )

    expect(
      offending.map((path) => path.slice(WEB_SRC.length)),
      'A raw-HTML rendering path exists in MyNet. The count has been zero since 001, and any ' +
        'first use is a decision to review — over a session summary it is FR-1054’s named ' +
        'violation.',
    ).toEqual([])
  })

  it('every file rendering a summary renders it as text, never as an href or markup input', () => {
    for (const path of all().filter((candidate) => /\.summary\b/.test(codeOf(candidate)))) {
      const code = codeOf(path)

      expect(
        /href\s*=\s*\{[^}]*summary|\bmarked\(|\brender(?:Markdown|Html)\(/.test(code),
        `${path.slice(WEB_SRC.length)} feeds a summary into a link or a renderer. The summary ` +
          'is long free text nothing parses (FR-1054); the access link has its own validated ' +
          'field (FR-1052).',
      ).toBe(false)
    }
  })
})
