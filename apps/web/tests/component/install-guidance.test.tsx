import type { InstallState } from '@mynet/platform'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { InstallGuidance } from '../../src/auth/InstallGuidance.js'
import { devicesWith, testServices, WithServices } from '../support/services.js'

/**
 * T047 (016) — **shown when, and only when, it is true and useful** (FR-1031, SC-1008).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ABSENCES ARE THE REQUIREMENT, NOT THE PRESENCE.**
 *
 * "Tell people to install the app" is easy and would pass a test that only checked the guidance
 * appears. What FR-1031 actually asks is much narrower — mobile **and** not installed — and each
 * excluded case has its own reason:
 *
 *   - **Installed**: they have already done it. A prompt to do the thing they did reads as the
 *     product not knowing its own state, and it is the case that will be hit most often by the
 *     people who acted on it.
 *   - **Desktop**: a desktop browser can install too, but it does not have the iOS notification
 *     limitation this exists to explain. Nagging a laptop about a home screen is noise.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const installState = (overrides: Partial<InstallState> = {}): InstallState => ({
  installed: false,
  mobile: true,
  promptToInstall: null,
  ...overrides,
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE STORED-DISMISSAL READ IS HELD OPEN AND RELEASED DELIBERATELY, BECAUSE THE NEGATIVE
 * ASSERTIONS HAVE NO OTHER WAY TO TELL "NOT SHOWN" FROM "NOT DECIDED YET"** (review finding
 * T-m10).
 *
 * `InstallGuidance` returns `null` while `dismissed` is `null` — the state it is in until the
 * read of FR-1035's stored flag settles. **Absence is therefore also the pre-settle state**, so
 * an assertion that runs too early passes for the wrong reason and would keep passing against a
 * component that never hid anything at all.
 *
 * The barrier this replaced was
 * `await screen.findByText((_, element) => element?.tagName === 'BODY')`, which reads like a
 * flush and is not one: `<body>` exists on the very first check, so the `waitFor` resolved
 * immediately and the negative assertions were left relying on however many microtasks happened
 * to have drained. They passed by luck rather than by construction.
 *
 * So the double hands back a promise that nothing resolves until a test asks for it. Every test
 * here — positive and negative alike — goes through `settleDismissalRead()`, which resolves the
 * read and then awaits **the same promise inside `act`**: the component registered its `.then`
 * on it first, so by the time that await returns, `setDismissed` has run and React has flushed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const renderGuidance = (state: InstallState) => {
  let release: () => void = () => {}
  const dismissalRead = new Promise<string | null>((resolve) => {
    release = () => resolve(null)
  })

  const services = testServices(
    {},
    {
      devices: devicesWith({
        install: { current: () => state, subscribe: () => () => {} },
        secureStorage: {
          get: () => dismissalRead,
          set: async () => {},
          remove: async () => {},
          clear: async () => {},
        },
      }),
    },
  )

  const result = render(
    <WithServices services={services}>
      <MemoryRouter>
        <InstallGuidance />
      </MemoryRouter>
    </WithServices>,
  )

  return {
    ...result,
    settleDismissalRead: async () => {
      release()
      await act(async () => {
        await dismissalRead
      })
    },
  }
}

const guidance = () => screen.queryByRole('heading', { name: /home screen/i })

describe('install guidance', () => {
  it('appears on an uninstalled mobile device (FR-1031)', async () => {
    const { settleDismissalRead } = renderGuidance(installState())

    // Nothing renders until the stored dismissal has been read — which is itself the requirement
    // the barrier below exists for, and the reason the two states cannot be told apart earlier.
    expect(guidance()).not.toBeInTheDocument()
    await settleDismissalRead()

    expect(await screen.findByRole('heading', { name: /home screen/i })).toBeInTheDocument()
  })

  it('does NOT appear once the application is installed (FR-1031, SC-1008)', async () => {
    const { settleDismissalRead } = renderGuidance(installState({ installed: true }))

    await settleDismissalRead()

    expect(
      guidance(),
      'The guidance is shown to somebody who has already installed. It asks them to do the ' +
        'thing they have done, which reads as the product not knowing its own state.',
    ).not.toBeInTheDocument()
  })

  it('does NOT appear on desktop (FR-1031, SC-1008)', async () => {
    const { settleDismissalRead } = renderGuidance(installState({ mobile: false }))

    await settleDismissalRead()

    expect(
      guidance(),
      'A desktop browser can install too, but it does not have the iOS notification limitation ' +
        'this exists to explain.',
    ).not.toBeInTheDocument()
  })

  /**
   * FR-1032 — **the reason, not the request.**
   *
   * The whole justification for interrupting somebody on a sign-in screen is that notification
   * delivery on iOS is available only to an installed application, so an attendee can grant
   * permission and receive nothing. Copy that said "add us to your home screen" without saying
   * why would be an ask with no argument behind it, and the first thing to be dismissed.
   */
  it('states that installing is what enables notifications (FR-1032)', async () => {
    const { settleDismissalRead } = renderGuidance(installState())

    await settleDismissalRead()

    const region = await screen.findByRole('region', { name: /home screen/i })
    expect(region).toHaveTextContent(/notification/i)
    expect(region).toHaveTextContent(/messages reach you|cannot be delivered/i)
  })
})
