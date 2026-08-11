import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T005 (010) — **the committed deployment configuration, asserted rather than reviewed**
 * (FR-820, FR-823).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE EXISTS TO SURVIVE SOMEBODY BEING HELPFUL.**
 *
 * The values it guards are the kind a reader finds *incomplete* and fixes on the way past.
 * `envs/prod.env` has a blank `APP_DOMAIN`, sitting one line away from UAT's filled one, in a
 * file whose every other row is populated. It reads like an oversight. It is a requirement:
 * `mynetcr.com` is **provisional and unregistered** (constitution v3.4.0, standing decision 31),
 * and committing it before it is registered would make `deploy-prod`'s refusal dishonest — the
 * job would proceed past its domain check and fail somewhere that names something else.
 *
 * A blank value is doing work here. Nothing else in the repository says so at the point where
 * somebody would change it, which is what this file is for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Reads the real committed files. A test that parsed a fixture would assert that the fixture was
 * written correctly.
 */

const VM_DIR = fileURLToPath(new URL('../../../../deploy/vm', import.meta.url))

/**
 * One `KEY=value` line from a committed env file.
 *
 * Deliberately not a full shell parser: these files are sourced by `_common.sh` with `set -a`,
 * and anything needing more than this to read would be a file `mynet::load_env` could not load
 * either. Returns `undefined` when the key is absent and `''` when it is present and blank —
 * a distinction this file's whole purpose rests on.
 */
const readValue = (file: string, key: string): string | undefined => {
  const contents = readFileSync(`${VM_DIR}/envs/${file}`, 'utf8')
  const line = contents
    .split('\n')
    .find((candidate) => candidate.startsWith(`${key}=`) && !candidate.trimStart().startsWith('#'))

  return line === undefined ? undefined : line.slice(key.length + 1).trim()
}

describe('the UAT environment names what v3.4.0 decided (FR-820)', () => {
  it('pins the subscription by identifier, never by name', () => {
    // FR-821. An identifier because a subscription *name* is mutable and an inherited default
    // silently provisions into whatever `az account show` happens to return — which, on the
    // machine this was implemented on, was a different subscription entirely.
    expect(readValue('uat.env', 'SUBSCRIPTION')).toBe('d428f98f-a3c4-49c3-ae24-06ec3de08477')
  })

  it('names the UAT address', () => {
    expect(readValue('uat.env', 'APP_DOMAIN')).toBe('mynet-dev.programasemilla.com')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **UAT AND PRODUCTION MUST REMAIN SEPARATE REGISTRABLE DOMAINS** (v3.4.0, decision 31).
   *
   * This is what makes a UAT session cookie *structurally incapable* of reaching production —
   * stronger than any cookie attribute, and arrived at by accident of naming rather than by
   * design. It would be undone by the most natural tidying imaginable: moving UAT to
   * `uat.mynetcr.com` so both environments live under one domain.
   *
   * Asserted as "UAT is not a subdomain of production's provisional name" rather than as a
   * literal, so it keeps binding when production's name is finally registered.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('keeps UAT off production’s registrable domain', () => {
    const uat = readValue('uat.env', 'APP_DOMAIN') ?? ''

    expect(
      uat.endsWith('.mynetcr.com') || uat === 'mynetcr.com',
      'UAT has been moved onto production’s registrable domain. A session cookie issued by UAT ' +
        'would then be sendable to production by the Public Suffix List’s own rules, and the ' +
        'separation constitution v3.4.0 (decision 31) records as an invariant would be gone. ' +
        'Keep UAT on programasemilla.com.',
    ).toBe(false)
  })
})

/**
 * T039 (010) — **nothing stands in front of UAT, and the absence is asserted** (FR-829).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"LOCK IT DOWN" WILL ALWAYS SOUND LIKE THE CAREFUL OPTION. IT IS THE ONE THIS REQUIREMENT
 * FORBIDS.**
 *
 * Constitution v3.4.0 (decision 30) closed register entry 14 in the direction of leaving UAT
 * open, and both alternatives were considered by name and **rejected as safer-looking but
 * worse**: basic auth and an IP allowlist each disable the validation this environment exists
 * for — service-worker registration, Web Push, a physical-device test on cellular — to buy
 * secrecy over data that does not need it.
 *
 * **001's FR-067 is satisfied by the DATA rather than by the door.** UAT carries seeded content
 * and accounts created against UAT, and nothing that must be kept from a stranger is ever
 * present. That is what makes an open URL the correct answer rather than a tolerated one.
 *
 * Asserted here because adding a restriction is the most natural helpful change imaginable —
 * "just while we're testing" — and it would breach a ratified decision silently.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('UAT is openly reachable (FR-829)', () => {
  const caddyfile = readFileSync(`${VM_DIR}/Caddyfile`, 'utf8')
  const provision = readFileSync(`${VM_DIR}/provision-vm.sh`, 'utf8')

  it('the files being inspected are the real ones', () => {
    expect(caddyfile).toContain('APP_DOMAIN')
    expect(provision).toContain('nsg rule create')
  })

  it('puts no credential in front of the product', () => {
    // Caddy's directives for HTTP authentication, across the versions that spell it differently.
    expect(
      /\bbasic_?auth\b|\bforward_auth\b/i.test(caddyfile),
      'An authentication directive has appeared in the Caddyfile. FR-829 forbids placing any ' +
        'credential in front of UAT: it disables the service-worker and push validation the ' +
        'environment exists for, to protect data that is seeded by definition.',
    ).toBe(false)
  })

  it('leaves the web ports open to the world', () => {
    // The rule that opens 80/443. A `--source-address-prefixes` on it is an allowlist.
    const webRule = /allow-web[\s\S]{0,400}?destination-port-ranges 80 443/.exec(provision)?.[0]

    expect(webRule, 'the allow-web NSG rule was not found to inspect').toBeDefined()
    expect(
      /--source-address-prefixes/.test(webRule ?? ''),
      'The web rule now restricts source addresses. That is the IP allowlist v3.4.0 decision 30 ' +
        'considered and rejected — it makes a physical-device test on cellular impossible, which ' +
        'is one of the two things UAT was stood up to do.',
    ).toBe(false)
  })

  /**
   * The SSH rule is the deliberate opposite and must stay restricted. Asserted alongside, so that
   * "no restrictions" is never read as a rule about the whole NSG.
   */
  it('still restricts SSH to a single address', () => {
    expect(provision).toMatch(/allow-ssh[\s\S]{0,400}?--source-address-prefixes/)
  })
})

describe('the production environment stays unfilled (FR-823)', () => {
  /**
   * The assertion this file was created for. See the header.
   */
  it('leaves APP_DOMAIN blank, because mynetcr.com is not registered', () => {
    expect(
      readValue('prod.env', 'APP_DOMAIN'),
      'deploy/vm/envs/prod.env now carries an APP_DOMAIN. Constitution v3.4.0 (standing ' +
        'decision 31) forbids committing `mynetcr.com` until the domain is actually registered: ' +
        'the name is PROVISIONAL, and a blank value is what keeps `deploy-prod`’s refusal ' +
        'honest. If the domain has since been registered, that is a decision to record in the ' +
        'constitution first — then change this assertion in the same commit that fills the value.',
    ).toBe('')
  })

  /**
   * FR-894 — this feature creates no production resource and fills no production value. The
   * subscription is the one that would be filled "while we are here", since v3.4.0 names the
   * same subscription for both environments and it is therefore *known*.
   */
  it('leaves the production subscription unfilled too', () => {
    expect(
      readValue('prod.env', 'SUBSCRIPTION'),
      'FR-894 — feature 010 provisions UAT and nothing else. Filling production’s subscription ' +
        'here is the first half of provisioning it, and the second half is one command away.',
    ).toBe('')
  })

  it('still keeps its own database name, which is what the FR-485 guard compares', () => {
    // Blank here would not be caution, it would disable `mynet::require_data_separation`: the
    // guard compares UAT's resolved database name against *this* value, and a blank one can
    // never collide. The refusal would report success forever.
    expect(readValue('prod.env', 'DATABASE_NAME')).not.toBe('')
    expect(readValue('prod.env', 'DATABASE_NAME')).not.toBe(readValue('uat.env', 'DATABASE_NAME'))
  })
})
