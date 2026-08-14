import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T014 (013) — **Principle V is satisfied here by subtraction, and that is worth asserting**
 * (research R9).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ADMINISTRATIVE CLIENT NEEDS NONE OF THE DEVICE CAPABILITIES, SO IT TAKES NO DEPENDENCY
 * ON `@mynet/platform` AT ALL — AND MUST NOT ADD ONE.**
 *
 * Principle V mandates two abstraction layers, and the device-capability half exists so that
 * feature code never calls a browser API directly. `packages/platform` holds
 * `NotificationService`, `CalendarService`, `CameraService`, `ContactShareService`,
 * `SecureStorage`, `ConnectivityService`, `VisibilityService` (007) and `InstallService` (016).
 *
 * **The list is named and the count is not, deliberately.** This header said "seven" from 013
 * until 016 ratified the eighth, and in between it was simply wrong — while every test in the
 * file passed, because nothing here counts anything. A header is a claim that needs a guard like
 * any other, and the cheapest guard for this one is to assert a property no amendment can
 * falsify: *none*, not *none of seven*.
 *
 * This product needs zero of them. It does not notify (FR-935), does not go offline (FR-923),
 * takes no photograph, shares no contact, stores nothing on the device, and polls nothing that
 * would need to stop when the tab is hidden.
 *
 * **The reason that is asserted rather than simply true**: `VisibilityService` is the precedent.
 * It was added by an *implementation* rather than by a product decision — a poll had to stop
 * while the tab was hidden, and the only way to ask was a browser API feature code may not call.
 * `substitution.test.ts` is what forced it to be declared rather than added quietly, and
 * constitution v3.1.0 then had to ratify it into Principle V as standing decision 22. 016 paid
 * the same price again for `InstallService` at v5.1.0, which is the precedent holding.
 *
 * So a capability added for administration would be a governance change, not a convenience. This
 * test makes that conversation happen at the point somebody reaches for it, rather than at
 * ratification time — and it keeps `substitution.test.ts` untouched, which is the plan's stated
 * outcome for Principle V.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const adminRoot = fileURLToPath(new URL('../../', import.meta.url))
const adminSrc = fileURLToPath(new URL('../../src/', import.meta.url))

interface PackageManifest {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(join(adminRoot, 'package.json'), 'utf8'),
) as PackageManifest

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

describe('011 — the administrative client declares no platform dependency', () => {
  it('declares no @mynet/platform dependency (research R9)', () => {
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]

    expect(
      declared.filter((name) => name.startsWith('@mynet/platform')),
      'The administrative client depends on `@mynet/platform`. It needs none of the device ' +
        'capabilities, and adding an eighth for administration is a Principle V governance ' +
        'change — `VisibilityService` is the precedent, and constitution v3.1.0 had to ratify it.',
    ).toEqual([])
  })

  it('imports no platform module in its source', () => {
    // The manifest is the primary guard; this catches a deep relative import that would reach
    // the package without declaring it — which pnpm's strict resolution makes hard, and which a
    // path alias would make easy.
    const offenders = sourceFiles(adminSrc)
      .filter((path) => /@mynet\/platform|packages\/platform/.test(codeOnly(path)))
      .map((path) => path.slice(adminSrc.length))

    expect(
      offenders,
      'The administrative client reaches a platform module. See the manifest assertion above.',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-920 — IT REUSES NONE OF MYNET, AND UNTIL NOW THAT WAS TRUE WITHOUT BEING GUARDED.**
   *
   * Added at the review-code gate: FR-920 says the administrative site must be a separate
   * application reusing **none** of MyNet's five destinations, Home card registry, or navigation
   * contract. It was satisfied — nothing imports `apps/web` — but nothing failed if it stopped
   * being satisfied, and the project's own rule is that every absence requirement gets a test
   * that fails when the absence ends.
   *
   * It matters more than it looks. Decision 33 keeps Principle III's attendee-workspace framing
   * true *by construction*, and the first step away from that is not an admin screen in MyNet —
   * it is somebody importing MyNet's `navigation.ts` here "to avoid duplicating the contract",
   * after which one registry serves two products and a tier filter is the obvious next commit.
   * `routes.tsx` already argues this in prose; this is the assertion under it.
   *
   * **Comments are stripped first, and here that is load-bearing rather than ceremonial**: three
   * files in this client legitimately mention `apps/web` in explanatory comments — including the
   * one recording why the rail uses `coral-600`. Matching raw text would fail on a correct
   * implementation, and the natural repair is to weaken the pattern until it checks nothing.
   * That is 009's recorded rule.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('reuses nothing from the attendee product (FR-920, decision 33)', () => {
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(
      declared.filter((name) => name.startsWith('@mynet/web')),
      'The administrative client depends on `@mynet/web`. FR-920 requires a separate application.',
    ).toEqual([])

    const offenders = sourceFiles(adminSrc)
      .filter((path) => /@mynet\/web|apps\/web|\.\.\/web\//.test(codeOnly(path)))
      .map((path) => path.slice(adminSrc.length))

    expect(
      offenders,
      'The administrative client reaches into `apps/web`. FR-920 forbids reusing MyNet’s five ' +
        'destinations, its Home card registry and its navigation contract — sharing the ' +
        'navigation module is the shortest route back to one application with two faces, ' +
        'beginning with an administrative destination appended to the attendee list and ' +
        'filtered out by tier, which is exactly the role-dependent rendering decision 33 forbids.',
    ).toEqual([])
  })

  it('does declare @mynet/data, because the data layer half of Principle V still binds', () => {
    // The two halves of Principle V are not both optional. Repository interfaces in domain terms
    // are mandatory here exactly as they are in the attendee client: no component may call the
    // network or know a URL. Asserting the positive keeps this file from reading as "the admin
    // product opts out of Principle V", which it emphatically does not.
    expect(Object.keys(manifest.dependencies ?? {})).toContain('@mynet/data')
  })
})
