import { OfflineError } from '@mynet/data'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'

/**
 * T044 (006) — **every state Discover declares, asserted by name** (FR-401b, FR-414, FR-415,
 * FR-466, FR-467, SC-409).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A MATRIX, DELIBERATELY.** Each of these states is reachable in ordinary use — a new account
 * has joined nothing, a typed search matches nobody, a train goes into a tunnel — and each of
 * them is the state a reader is looking at when they form their opinion of the product. States
 * asserted in passing on the way to testing something else are the ones that come to be *nearly*
 * covered; this file asserts the property the Principle IX declaration actually promises, so a
 * missing state fails by name. 005's `agenda-states.test.tsx` is the same shape for the same
 * reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

describe('Discover: the declared states', () => {
  it('LOADING: says the directory is loading', async () => {
    const { directory } = renderDiscover()
    directory.holdNext()

    expect(await screen.findByText(/loading the directory/i)).toBeInTheDocument()
  })

  it('POPULATED: renders a card per attendee, with the fields FR-405 names', async () => {
    renderDiscover({ attendees: [anAttendee()] })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    // Scoped to the card. The interest filter offers every loaded interest as an option, so an
    // unscoped text query for "Design systems" legitimately finds two — the chip and the
    // `<option>` — and would be testing the harness rather than the card.
    const card = within(heading.closest('li') as HTMLElement)

    expect(card.getByText(/Designer · Peña & Asociados/)).toBeInTheDocument()
    expect(card.getByText('Design systems for large teams.')).toBeInTheDocument()
    expect(card.getByText('Design systems')).toBeInTheDocument()
    expect(card.getByText('Available')).toBeInTheDocument()
    expect(card.getByText('Open to meetings')).toBeInTheDocument()
    // FR-412 — the shared-interest count is on the card.
    expect(card.getByText('2 interests in common')).toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE AVATAR-PRESENT PATH, WHICH NOTHING EXERCISED.**
   *
   * The seed ships no faces (FR-354, deliberately — the prototype's photographs are of real
   * people), the harness default is `avatar: null`, and no test passed a non-null one. So the
   * `<img src={attendee.avatar}>` branch was never rendered anywhere, at any layer: a broken
   * data-URL binding, a missing `alt`, or a swapped fallback would all have shipped.
   *
   * It also made the e2e "one request" assertion unfalsifiable — with no avatar to fetch,
   * `avatarReads` is empty whatever the client does.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('POPULATED with a face: renders the data URL as an image, presentationally', async () => {
    const avatar = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
    renderDiscover({ attendees: [anAttendee({ avatar })] })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = within(heading.closest('li') as HTMLElement)

    const image = card.getByRole('presentation', { hidden: true }) as HTMLImageElement
    expect(image.tagName).toBe('IMG')
    expect(image.src).toBe(avatar)
    // Presentational: the name is rendered immediately beside it, so describing the photograph
    // would announce the same person twice (SC-310's reasoning, inherited from 004).
    expect(image).toHaveAttribute('alt', '')
  })

  it('POPULATED without a face: renders the fallback, and NO image at all (FR-351)', async () => {
    renderDiscover({ attendees: [anAttendee({ avatar: null })] })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    // No `<img>` — not an `<img>` with an empty `src`, which is what produces the browser's
    // broken-image glyph and reads as "this product is failing" rather than "no photograph".
    expect(card.querySelector('img')).toBeNull()
    // The initials, `aria-hidden` so the adjacent name is not announced twice.
    expect(card.querySelector('[aria-hidden="true"]')?.textContent).toBe('SM')
  })

  /**
   * T053 — the no-match state and its reset (FR-414).
   *
   * The reset must clear **everything** at once. A reader who set three narrowings and can now
   * see nothing has no way to tell which one is responsible, so clearing them one at a time is
   * asking them to guess.
   */
  it('EMPTY (narrowed): says nothing matched and offers a reset that clears everything', async () => {
    const user = userEvent.setup()
    // The server is what narrows (FR-409), so the double narrows too — a double that ignored
    // the query would let a client-side filter pass this test.
    const { directory } = renderDiscover({
      pages: (query) => ({
        attendees: query.q ? [] : [anAttendee()],
        nextCursor: null,
      }),
    })
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    await user.type(screen.getByRole('searchbox', { name: /search attendees/i }), 'zzz')

    expect(await screen.findByText(/nothing matched/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear search and filters/i }))

    expect(screen.getByRole('searchbox', { name: /search attendees/i })).toHaveValue('')
    // The reset must actually re-ask the server without the narrowing, not merely blank the box.
    await waitFor(() => {
      const last = directory.queries.at(-1)
      expect(last?.q).toBe('')
      expect(last?.role).toBe('')
      expect(last?.interest).toBe('')
    })
  })

  /**
   * T053 — the unnarrowed empty directory (FR-415).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The assertion that matters is the negative one.** Rendering *an* empty state is easy;
   * what FR-415 requires is that it does not disclose which of three things is true, because
   * all three are facts about other attendees' settings — and the reader got in with a
   * world-readable join code.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('EMPTY (unnarrowed): says nobody to show, without disclosing why (FR-415)', async () => {
    renderDiscover({ attendees: [] })

    const empty = await screen.findByText(/nobody to show yet/i)
    const panel = empty.parentElement as HTMLElement

    expect(panel).not.toHaveTextContent(/discoverab/i)
    expect(panel).not.toHaveTextContent(/verif/i)
    expect(panel).not.toHaveTextContent(/nobody has (joined|registered)/i)
    expect(panel).not.toHaveTextContent(/hidden|private|withheld/i)
  })

  /**
   * T054 — the reader has joined no conference (FR-401b).
   *
   * Named explicitly as **not** an empty directory, **not** a never-resolving spinner and
   * **not** an error, because FR-401b rules out all three by name and this is where every
   * brand-new account stands.
   */
  it('NO CONFERENCE: explains joining comes first, and offers the way (FR-401b)', async () => {
    renderDiscover({
      overrides: {
        activeEvent: {
          getActive: async () => null,
          // Registered for nothing, so there is nothing to switch to. Rejecting rather than
          // resolving keeps the double honest about that.
          setActive: async () => Promise.reject(new Error('registered for no conferences')),
        },
      },
    })

    expect(
      await screen.findByRole('heading', { name: /join a conference to see who is here/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /join a conference/i })).toHaveAttribute(
      'href',
      '/join',
    )

    // Not an empty directory, not an error, and not a spinner.
    expect(screen.queryByText(/nobody to show yet/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/loading the directory/i)).not.toBeInTheDocument()
  })

  /**
   * T055 — offline (FR-466, FR-467, FR-468, SC-409).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **Both halves are asserted: a connection is needed, AND nothing is stored to show.**
   *
   * Without the second, a reader cannot tell "wait a moment" from "there is nothing here for
   * you until you reconnect" — and 005 made the agenda readable offline, so the reasonable
   * expectation is that everything else is too. Discover deliberately is not, and the state has
   * to say so rather than leave it as an apparent gap.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('OFFLINE: says a connection is needed and that nothing is cached (FR-467, FR-468)', async () => {
    const { directory } = renderDiscover()
    directory.failWith(new OfflineError('Loading the directory'))

    // Found by its wording rather than by role: `Loading` is also a `status` region, and the
    // loading line is on screen first, so a role query would settle on the wrong one.
    const notice = (await screen.findByText(/needs a connection/i)).closest(
      '[role="status"]',
    ) as HTMLElement

    expect(
      notice,
      'FR-468 requires the refusal to cache be declared rather than left as a gap.',
    ).toHaveTextContent(/nothing is stored on this device/i)

    // FR-467 — worded distinguishably from a fault on our side.
    expect(notice).not.toHaveTextContent(/problem on our side/i)
  })

  it('OFFLINE: renders no attendee content at all (SC-409)', async () => {
    const { directory } = renderDiscover({ attendees: [anAttendee()] })
    directory.failWith(new OfflineError('Loading the directory'))

    await screen.findByText(/needs a connection/i)
    expect(
      screen.queryByText('Sofía Muñoz'),
      'Zero directory content is readable offline. Anything on screen here would be a second ' +
        "copy of somebody else's personal data on this device (FR-466).",
    ).not.toBeInTheDocument()
  })

  it('FAILED: reports a fault on our side, with a retry, and never as an empty directory', async () => {
    const { directory } = renderDiscover()
    directory.failWith(new Error('server fault'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problem on our side/i)
    expect(alert).not.toHaveTextContent(/needs a connection/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/nobody to show yet/i)).not.toBeInTheDocument()
  })

  /**
   * **The retry is PRESSED, not merely found.**
   *
   * `retry` bumps a counter that has to be in the effect's dependency array for anything to
   * happen. Removing it there — or forgetting the `setStatus('loading')` — leaves a button that
   * exists, is labelled, is reachable by keyboard, and does nothing, with every other test still
   * green. A control asserted to exist but never operated is the weakest form of coverage.
   */
  it('FAILED: the retry actually re-asks the server, and recovers', async () => {
    const user = userEvent.setup()
    const { directory } = renderDiscover()
    directory.failWith(new Error('server fault'))
    await screen.findByRole('alert')

    const before = directory.queries.length
    directory.failWith(null)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' }),
    ).toBeInTheDocument()
    expect(directory.queries.length).toBeGreaterThan(before)
  })
})

/**
 * FR-409 — **the narrowing is a server-side query, never a client-side filter.**
 *
 * A response the client filters is a response that already contains what it is hiding, and the
 * ranking and pagination are computed *from* the narrowed set — so filtering in the browser
 * would rank and page the wrong population as well as disclosing it.
 */
describe('Discover: narrowing goes to the server', () => {
  it('sends the search term as a query rather than filtering what it already has', async () => {
    const user = userEvent.setup()
    const { directory } = renderDiscover()
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    await user.type(screen.getByRole('searchbox', { name: /search attendees/i }), 'Munoz')

    await waitFor(() => expect(directory.queries.at(-1)?.q).toBe('Munoz'))
  })

  it('sends role and interest as queries too, and states how many are applied', async () => {
    const user = userEvent.setup()
    const { directory } = renderDiscover()
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    await user.selectOptions(screen.getByRole('combobox', { name: /^role$/i }), 'Designer')

    await waitFor(() => expect(directory.queries.at(-1)?.role).toBe('Designer'))
    expect(await screen.findByText('1 filter applied')).toBeInTheDocument()
  })
})

/**
 * FR-410a — **the de-duplication that closes what keyset paging leaves open** (research D4).
 *
 * The server may return an attendee a second time when their score fell below the cursor after
 * they were shown. It cannot fix that without a snapshot, which FR-466 forbids. This is where
 * the guarantee actually becomes true, so this is where it is asserted.
 */
describe('Discover: paging never shows the same person twice (FR-410a, SC-403a)', () => {
  const FIRST = anAttendee({
    attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111',
    displayName: 'Ada',
  })
  const SECOND = anAttendee({
    attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222',
    displayName: 'Bea',
  })

  it('appends a further page', async () => {
    const user = userEvent.setup()
    renderDiscover({
      pages: [
        { attendees: [FIRST], nextCursor: 'cursor-1' },
        { attendees: [SECOND], nextCursor: null },
      ],
    })
    await screen.findByText('Ada')

    await user.click(screen.getByRole('button', { name: /show more attendees/i }))

    expect(await screen.findByText('Bea')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    // The control goes away once there is nothing more, rather than staying as a dead button.
    expect(screen.queryByRole('button', { name: /show more attendees/i })).not.toBeInTheDocument()
  })

  it('drops a repeat the server returned, rather than rendering the person twice', async () => {
    const user = userEvent.setup()
    renderDiscover({
      pages: [
        { attendees: [FIRST], nextCursor: 'cursor-1' },
        // The residue: Ada's score fell below the cursor after she was shown, so the server
        // returns her again. `directory-paging.test.ts` asserts that the server does exactly
        // this and nothing worse.
        { attendees: [FIRST, SECOND], nextCursor: null },
      ],
    })
    await screen.findByText('Ada')

    await user.click(screen.getByRole('button', { name: /show more attendees/i }))
    await screen.findByText('Bea')

    expect(
      screen.getAllByText('Ada'),
      'A duplicate is a visible defect and makes a reader wonder whether they have already ' +
        'spoken to somebody. FR-410a forbids it and permits the omission instead.',
    ).toHaveLength(1)
  })

  it('keeps what is already shown when a further page fails', async () => {
    const user = userEvent.setup()
    const { directory } = renderDiscover({
      pages: [{ attendees: [FIRST], nextCursor: 'cursor-1' }],
    })
    await screen.findByText('Ada')

    directory.failWith(new Error('server fault'))
    await user.click(screen.getByRole('button', { name: /show more attendees/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /more attendees could not be loaded/i,
    )
    expect(
      screen.getByText('Ada'),
      'Blanking a page of cards because the next page failed loses the reader their place for ' +
        'nothing.',
    ).toBeInTheDocument()
  })
})
