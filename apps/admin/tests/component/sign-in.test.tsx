import { ApiError } from '@mynet/data/http'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AdminRoutes } from '../../src/app/routes.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { identity, stubServices } from '../support/services.js'

/**
 * T052 (013) — the administrative sign-in screen: loading, failure, and disabled submit
 * (FR-915, FR-917, FR-922).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE MOST IMPORTANT ASSERTION HERE IS THAT THE SCREEN SAYS NOTHING HELPFUL.**
 *
 * The server answers all four sign-in causes identically (FR-915). The temptation on this screen
 * is *"if you are an attendee, sign in at MyNet instead"* — which would undo the whole property,
 * because it would tell somebody probing addresses that theirs belongs to a real attendee.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const renderApp = (services: ReturnType<typeof stubServices>) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <AdminSessionProvider services={services}>
        <AdminRoutes />
      </AdminSessionProvider>
    </MemoryRouter>,
  )

describe('the administrative sign-in screen', () => {
  it('asks for sign-in when there is no session, and shows nothing administrative', async () => {
    const services = stubServices({
      session: { me: async () => Promise.reject(new ApiError(401, { code: 'not_authenticated' })) },
    })

    renderApp(services)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()

    // FR-917 — an unauthenticated caller learns nothing about what exists. No queue, no
    // conferences, no mention of tiers or of how one becomes an operator.
    expect(screen.queryByText(/report/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/conference/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/operator|organiz/i)).not.toBeInTheDocument()
  })

  it('keeps submit DISABLED until both fields are filled, rather than failing after submission', async () => {
    const services = stubServices({
      session: { me: async () => Promise.reject(new ApiError(401, { code: 'not_authenticated' })) },
    })
    renderApp(services)

    const submit = await screen.findByRole('button', { name: /sign in/i })
    // The constitution's required-states constraint: an invalid empty form is a disabled
    // control, never a post-submit error.
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/email/i), 'operator@mynet.invalid')
    expect(submit, 'submit enabled with only the address filled').toBeDisabled()

    await userEvent.type(screen.getByLabelText(/password/i), 'a-password')
    expect(submit).toBeEnabled()
  })

  it('renders the server’s refusal verbatim and adds nothing to it (FR-915)', async () => {
    const services = stubServices({
      session: { me: async () => Promise.reject(new ApiError(401, { code: 'not_authenticated' })) },
    })
    services.session.signIn = async () =>
      Promise.reject(new ApiError(401, { code: 'invalid_credentials' }))

    renderApp(services)

    await userEvent.type(await screen.findByLabelText(/email/i), 'operator@mynet.invalid')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Announced, not merely rendered: it is the only feedback this form gives, and a
    // screen-reader user pressing a button that appears to do nothing has no other way to learn
    // it was refused.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/did not match/i)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **Nothing helpful.** A hint about MyNet, about being an organizer, or about needing
    // promotion would each tell a prober something the server refused to.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(alert).not.toHaveTextContent(/attendee|mynet|organiz|operator|promot|not registered/i)
  })

  it('shows a loading state while the credential is being checked', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })

    const services = stubServices({
      session: { me: async () => Promise.reject(new ApiError(401, { code: 'not_authenticated' })) },
    })
    services.session.signIn = async () => pending

    renderApp(services)

    await userEvent.type(await screen.findByLabelText(/email/i), 'operator@mynet.invalid')
    await userEvent.type(screen.getByLabelText(/password/i), 'a-password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Required wherever data crosses the network.
    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
    release()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE DOUBLE MUST BE REFUSED, BECAUSE THE SERVER REFUSES.**
   *
   * This test used to resolve `me()` with `{ credentialIsInitial: true }` and assert the
   * replacement screen appeared. It passed, and **the product was broken**: `requireOperator`
   * answers every address except the replacement route with a `credential_not_replaced` 403
   * while the bootstrapped credential stands, and `/admin/me` is not that route — so a
   * successful `me()` carrying `credentialIsInitial: true` is a response the server can never
   * produce. The real client caught the 403, classified it as signed-out, and returned the
   * operator to the sign-in form they had just used correctly. A loop, on the product's opening
   * interaction, found only by driving it end to end.
   *
   * So the double now returns what the server returns. The shape of the double IS the assertion
   * — 008 records the same lesson about the caching decorator's test needing a class with a
   * private field rather than an object literal.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('routes to the credential-replacement screen when the initial credential stands (FR-992)', async () => {
    const services = stubServices({
      session: {
        me: async () => Promise.reject(new ApiError(403, { code: 'credential_not_replaced' })),
      },
    })

    renderApp(services)

    expect(
      await screen.findByRole('heading', { name: /choose your password/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /reports/i })).not.toBeInTheDocument()

    // And NOT the sign-in form, which is what it fell back to before. The two failure modes are
    // one `classify` branch apart, so asserting the replacement screen alone is not enough.
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument()
  })

  it('shows the shell once a replaced credential is in hand', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      conferences: { list: async () => [] },
    })

    renderApp(services)

    await waitFor(() =>
      expect(screen.getByText(/signed in as a platform operator/i)).toBeInTheDocument(),
    )
    // FR-924 — the tier is visible at all times, so somebody who cannot tell which they are
    // cannot mistake a permission for a bug.
    expect(screen.getByLabelText(/tier: platform operator/i)).toBeInTheDocument()
  })
})
