import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T068 (005) — the agenda with no signal (FR-215–FR-221, SC-203, SC-204).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONLY PLACE THE INDEXEDDB IMPLEMENTATION IS ACTUALLY EXERCISED.**
 *
 * The caching decorator's rules — the 24-hour lifetime, per-attendee keys, invalidation on
 * refusal — are unit-tested against an in-memory store, because that is where the rules live.
 * The *storage* is a browser capability with no Node equivalent, and standing up a fake
 * IndexedDB in the unit layer would test the fake. So the round trip is proved here, in a real
 * browser, going genuinely offline.
 *
 * The claim under test is not "MyNet works offline". It is 002's claim, extended: MyNet
 * **tells the truth** offline. What is readable is readable and stamped with when it was
 * retrieved; what is not is said to be unavailable; and every write is refused rather than
 * queued or faked.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

/**
 * Waits for the service worker, which is what makes the shell available offline at all.
 *
 * A truthiness check, never `!== null` (T022 — 012, FR-1146): on an engine with no
 * `serviceWorker`, `navigator.serviceWorker?.controller` is `undefined`, and
 * `undefined !== null` is TRUE — the old comparison resolved instantly precisely where there
 * was nothing to wait for. Wrong on Chromium too: `undefined` is also what an aborted
 * registration yields.
 */
const awaitServiceWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 20_000,
  })
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **READING THE STORE ITSELF, BECAUSE FIX-2 AND FIX-3 CHANGE WHAT IS STORED AND NOTHING THAT IS
 * SHOWN.**
 *
 * Everything above this point asserts a surface. The two members `LocalCache` gained cannot be
 * asserted that way: through the decorator, "deleted" and "present but stale" are the same
 * observation (FIX-204), and a conference erased on a cold start was already invisible. So these
 * three helpers open `mynet-cache` directly — the same database `WebLocalCache` writes, opened at
 * the same version so no upgrade is triggered — and read its keys back out.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THEY ARE THE OBSERVATION, NEVER THE SUBJECT.** Nothing here reimplements `keys` or `remove`;
 * a second copy of a cursor loop would prove the copy works. The subject is always the product
 * calling the real member — the composition root's erasure for `keys`, the caching decorator's
 * expiry for `remove` — and these read the bytes afterwards.
 *
 * That distinction is the whole point of the two tests at the foot of this file. Before them the
 * real bodies of `keys` and `remove` ran in **no test at all**: the unit suite exercises the
 * no-IndexedDB degradation path, where `remove` resolves `undefined` and `keys` resolves `[]`
 * without touching a store, and substitutes an in-memory double everywhere else. Had `keys`
 * resolved `[]` against a *working* store — a cursor that never completes, a bound built the
 * wrong way round, `primaryKey` read where `key` was meant — **no conference would ever have been
 * erased and every suite would have stayed green.** That is 008's `#private`-field Proxy and
 * 010's precache guard arriving a third time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THEY REJECT ON A STORE FAILURE, AND THAT IS A 012 CORRECTION** (T023, FR-1146). Each used to
 * resolve an empty answer on every error path, argued as "a helper that throws turns a missing
 * precondition into a stack trace instead of a legible assertion failure" — and the argument
 * missed which direction the assertions point. The deletion proofs are `.not.toContain(...)`,
 * and an error-induced `[]` satisfies them: a broken `indexedDB.open` would have reported FIX-2
 * and FIX-3 working forever, on Chromium too. A helper whose failure mode PASSES the test it
 * serves is the `it.skipIf` precache guard arriving again. So: a missing ENTRY is still a
 * legible `null`/empty answer (that is a real state under test), but a store that cannot be
 * OPENED or a transaction that ERRORS rejects with its reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const CACHE_DATABASE = 'mynet-cache'
const CACHE_STORE = 'entries'

/** Every key the device holds, exactly as the store reports them. */
const storedKeys = (page: Page): Promise<string[]> =>
  page.evaluate(
    ([database, store]) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open(database)
        open.onerror = () => reject(new Error(`could not open ${database}: ${open.error?.message}`))
        open.onblocked = () => reject(new Error(`open of ${database} blocked`))
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(store)) {
            db.close()
            reject(new Error(`${database} has no object store ${store}`))
            return
          }
          const request = db.transaction(store, 'readonly').objectStore(store).getAllKeys()
          request.onsuccess = () => {
            resolve(request.result.filter((key): key is string => typeof key === 'string'))
            db.close()
          }
          request.onerror = () => {
            db.close()
            reject(new Error(`getAllKeys failed: ${request.error?.message}`))
          }
        }
      }),
    [CACHE_DATABASE, CACHE_STORE] as const,
  )

/** Puts an entry under an exact key, with the shape `WebLocalCache.write` gives it. */
const storeEntry = (page: Page, key: string, retrievedAt: string, payload: unknown) =>
  page.evaluate(
    ({ database, store, entryKey, stamp, body }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(database)
        open.onerror = () => reject(new Error(`could not open ${database}: ${open.error?.message}`))
        open.onblocked = () => reject(new Error(`open of ${database} blocked`))
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(store)) {
            db.close()
            reject(new Error(`${database} has no object store ${store}`))
            return
          }
          const transaction = db.transaction(store, 'readwrite')
          transaction.objectStore(store).put({ payload: body, retrievedAt: stamp }, entryKey)
          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onerror = () => {
            db.close()
            reject(new Error(`write of ${entryKey} failed: ${transaction.error?.message}`))
          }
        }
      }),
    {
      database: CACHE_DATABASE,
      store: CACHE_STORE,
      entryKey: key,
      stamp: retrievedAt,
      body: payload,
    },
  )

/**
 * Rewrites one entry's `retrievedAt` to `hoursAgo` hours before **the device's own clock**,
 * keeping its payload, and answers the stamp it wrote (or `null` if there was no such entry).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE STAMP IS COMPUTED IN THE PAGE, AND IT MUST BE OLD ENOUGH TO EXPIRE AND YOUNG ENOUGH TO
 * BE BELIEVED.**
 *
 * `ageOf` in `cached.ts` reads the stamp against the device clock and sorts it into three states,
 * not two: inside the lifetime is `fresh`, past it by a credible margin is `expired` **and gets
 * deleted**, and past `CLOCK_TRUST_CEILING_MS` is `withheld` — served no more than an expired one
 * and **deliberately not deleted**, because an age only a moved clock explains says more about the
 * date than about the entry.
 *
 * So an epoch stamp is exactly the wrong choice here: it is neither served nor removed, and a
 * test using one would report FIX-2 broken while FIX-2 worked. That is what this helper is for —
 * naming the band rather than reaching for the oldest date available. Computing `Date.now()` in
 * the page rather than in the runner is the same care one level down: the comparison is made
 * against the browser's clock, so the stamp has to be relative to the browser's clock.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The payload is preserved deliberately**: the entry must be indistinguishable from a real one
 * that has simply aged, or this would exercise the corrupt-entry path rather than the expiry path.
 */
const ageOut = (page: Page, key: string, hoursAgo: number): Promise<string | null> =>
  page.evaluate(
    ({ database, store, entryKey, hours }) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open(database)
        open.onerror = () => reject(new Error(`could not open ${database}: ${open.error?.message}`))
        open.onblocked = () => reject(new Error(`open of ${database} blocked`))
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(store)) {
            db.close()
            reject(new Error(`${database} has no object store ${store}`))
            return
          }
          const transaction = db.transaction(store, 'readwrite')
          const objectStore = transaction.objectStore(store)
          const read = objectStore.get(entryKey)
          const stamp = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

          read.onsuccess = () => {
            const entry = read.result as { payload: unknown } | undefined
            // A missing ENTRY is a legible answer, not a store failure — the caller asserts on it.
            if (!entry) {
              db.close()
              resolve(null)
              return
            }
            objectStore.put({ ...entry, retrievedAt: stamp }, entryKey)
            transaction.oncomplete = () => {
              db.close()
              resolve(stamp)
            }
          }
          transaction.onerror = () => {
            db.close()
            reject(new Error(`ageing ${entryKey} failed: ${transaction.error?.message}`))
          }
        }
      }),
    { database: CACHE_DATABASE, store: CACHE_STORE, entryKey: key, hours: hoursAgo },
  )

/** One entry's stamp, so a test can prove its own precondition took rather than assume it. */
const storedStamp = (page: Page, key: string): Promise<string | null> =>
  page.evaluate(
    ([database, store, entryKey]) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open(database)
        open.onerror = () => reject(new Error(`could not open ${database}: ${open.error?.message}`))
        open.onblocked = () => reject(new Error(`open of ${database} blocked`))
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(store)) {
            db.close()
            reject(new Error(`${database} has no object store ${store}`))
            return
          }
          const request = db.transaction(store, 'readonly').objectStore(store).get(entryKey)
          request.onsuccess = () => {
            const entry = request.result as { retrievedAt?: string } | undefined
            db.close()
            // A missing entry answers `null` — a real state the callers assert on.
            resolve(entry?.retrievedAt ?? null)
          }
          request.onerror = () => {
            db.close()
            reject(new Error(`reading ${entryKey} failed: ${request.error?.message}`))
          }
        }
      }),
    [CACHE_DATABASE, CACHE_STORE, key] as const,
  )

test.describe('Agenda offline', () => {
  test('the programme and saved set stay READABLE, with a retrieval stamp', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    // Read once while connected — the cache is seeded by ordinary reads, never by pre-fetching,
    // which is what keeps it honest about what it can serve.
    //
    // The retrying assertion comes first for the reason `agenda-saved.spec.ts` records at length:
    // `allTextContents()` does not auto-wait, and `goToAgenda` only waits for the `<h1>`. The
    // `expect` below would then fail with an empty array rather than an offline defect.
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
    const titles = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(titles.length).toBeGreaterThan(0)

    await context.setOffline(true)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **In-app navigation, NOT a reload — restructured by 012's T035, and the boundary is the
    // point** (FR-1140, decision D-012-1). This test used to reload here, and the reload was
    // asserting the SC-1207 disclosure as a feature: a fresh document offline could only
    // resolve its identity from the cached `getCurrent` entry, which is the exact entry that
    // served the previous attendee's notes to whoever held the device. Since T032 an offline
    // document cannot resolve an identity at all, so FR-215's surviving scope — and this
    // test's subject — is the SESSION that resolved its identity online: navigate away and
    // back without leaving the document, and the cached programme must still be readable.
    // The document-boundary case now has its own test at the foot of this file, asserting the
    // opposite outcome by design.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'Home', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: `Hello, ${ADA.displayName}` })).toBeVisible()
    await goToAgenda(page)

    try {
      // FR-215 — the programme is readable with no connection.
      await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
      for (const title of titles) {
        await expect(page.getByRole('heading', { level: 3, name: title.trim() })).toBeVisible()
      }

      // FR-216, SC-204 — and it says when it was retrieved, as a time rather than a badge.
      await expect(page.getByText(/last updated/i)).toBeVisible()
      await expect(page.getByText(/saved on this device/i)).toBeVisible()

      // The saved filter works offline too: the saved set is cached alongside the programme.
      await page.getByRole('radio', { name: 'My agenda' }).check()
      await expect(page.getByText(/nothing on your agenda yet/i)).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
  })

  test('an offline SAVE is refused, changes nothing, and queues nothing (SC-203)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    const link = page.getByRole('heading', { level: 3 }).first().getByRole('link')
    const title = ((await link.textContent()) ?? '').trim()

    await context.setOffline(true)

    try {
      await page.getByRole('button', { name: `Save ${title} to your agenda` }).click()

      // Refused with an explanation, not silently ignored and not shown as succeeded.
      const refusal = page.getByRole('alert')
      await expect(refusal).toBeVisible()
      await expect(refusal).toContainText(/needs a connection/i)
      await expect(refusal).toContainText(/nothing has been queued/i)

      // The displayed state did not change: the control still offers to save.
      await expect(page.getByRole('button', { name: `Save ${title} to your agenda` })).toBeVisible()
    } finally {
      await context.setOffline(false)
    }

    // ── Back online: the same action now succeeds, WITHOUT A RELOAD (US4 scenario 6) ───────
    await page.getByRole('button', { name: `Save ${title} to your agenda` }).click()
    await expect(
      page.getByRole('button', { name: `Remove ${title} from your agenda` }),
    ).toBeVisible()

    // And nothing replayed itself while offline — exactly one save happened, the one just made.
    await page.getByRole('radio', { name: 'My agenda' }).check()
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1)

    // Clean up.
    await page.getByRole('button', { name: `Remove ${title} from your agenda` }).click()
    await expect(page.getByText(/nothing on your agenda yet/i)).toBeVisible()
  })

  test('an offline NOTE says there is no connection, and keeps the text (FR-218)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await context.setOffline(true)

    try {
      const editor = page.getByRole('textbox', { name: /private notes/i })
      await editor.fill('Written in a basement with no signal.')

      const alert = page.getByRole('alert')
      await expect(alert).toBeVisible({ timeout: 15_000 })
      await expect(alert).toContainText(/no connection/i)
      // Distinct from a server fault — the attendee must not be sent to fix the wrong thing.
      await expect(alert).not.toContainText(/our side/i)

      // **The text stays on screen.** It was never sent anywhere, so clearing the field would
      // destroy the only copy.
      await expect(editor).toHaveValue('Written in a basement with no signal.')
    } finally {
      await context.setOffline(false)
    }

    // Retry succeeds, and the note is stored.
    await page.getByRole('button', { name: /try again/i }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })

    // Clean up.
    await page.getByRole('textbox', { name: /private notes/i }).fill('')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('a NEVER-READ conference says so rather than showing an empty programme (FR-219)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The cache is emptied, because "never visited Agenda" is not the same as "nothing
    // cached" — and discovering that is what this test is worth.**
    //
    // Home's own cards read the very same programme, through the very same repository, so by
    // the time an attendee reaches Agenda for the first time the programme is already cached.
    // That is the feature working exactly as designed: one cached entry per conference serves
    // every surface, which is the mechanism behind SC-210.
    //
    // It does mean a test that simply avoided Agenda would be asserting the *wrong* state.
    // Clearing the store is what actually produces a conference whose content has never been
    // retrieved on this device.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.evaluate(
      async () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase('mynet-cache')
          request.onsuccess = () => resolve()
          request.onerror = () => resolve()
          request.onblocked = () => resolve()
        }),
    )

    await context.setOffline(true)

    try {
      await page.goto('/agenda')

      // ─────────────────────────────────────────────────────────────────────────────────────
      // With nothing cached at all, the *first* thing that cannot resolve is which conference
      // the attendee is in — so the message comes from that layer rather than the programme's.
      // Which layer says it is a presentation detail; that the attendee is told both halves is
      // the requirement, and that is what is asserted.
      //
      // Since 012's T032, the layer moved once more: an offline `goto` is a fresh document,
      // identity itself no longer resolves offline, and the failure is the identity-offline
      // one — which carries the same two halves by design (`active-event.tsx` reuses the
      // wording). The requirement under test — a device-fact, never rendered as an empty
      // programme — is unchanged, and the anti-assertion below still pins it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const failure = page.getByRole('alert').first()
      await expect(failure).toBeVisible()
      await expect(failure).toContainText(/needs a connection/i)
      await expect(failure).toContainText(/nothing is cached/i)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Not an empty programme.** That state is a fact about the conference; this is a fact
      // about the device. Rendering the second as the first tells an attendee standing in a
      // venue that there is no programme, when there is one and they cannot see it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await expect(page.getByText(/no published programme/i)).toHaveCount(0)
    } finally {
      await context.setOffline(false)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FIX-3 — `keys()` AGAINST A REAL STORE, WHICH IS THE ONE THING NO OTHER LAYER CAN DO.**
   *
   * `erasingWithdrawnConferences` at the composition root asks the store which conferences this
   * device holds and purges the ones the server no longer lists. **The whole mechanism rests on
   * `keys()` returning real key strings**, and until this test its real body — the
   * `openKeyCursor` loop, the `typeof cursor.key === 'string'` filter, the `oncomplete`
   * resolution — executed in no test at all. The unit suite drives the no-IndexedDB path, where
   * it resolves `[]` without opening anything, and doubles it everywhere else.
   *
   * A `keys()` that resolved `[]` against a working store would therefore be **completely
   * silent**: no conference would ever be erased, the erasure would be a no-op forever, and every
   * suite in this repository would stay green. That is exactly the shape of 008's `#private`-field
   * Proxy and of 010's precache guard that could never run.
   *
   * So a conference this attendee is *not* registered for is planted in the store by hand, and
   * the product is made to perform an online `listRegistered()`. The plant is what makes the
   * assertion sharp: it can only disappear if `keys()` genuinely reported it back.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  test('a stored conference the server no longer lists is ERASED, keys and all (FIX-301)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Back to Home by a link rather than a reload, because what has to be true when the erasure
    // runs is that **identity has resolved**: it skips outright while the scope still reads
    // `anonymous`, and only a resolved session can be reached by a control the attendee pressed.
    //
    // **And the conference list is waited for, not just the greeting** — it is what says the
    // `listRegistered()` this page load issued has *finished*. Planting while one is in flight
    // is a race the plant loses: the erasure took its snapshot of the device's conferences
    // before the plant existed, so it survives that pass and the precondition below fails on a
    // mechanism that is working. It failed exactly that way once.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const settled = async () => {
      await expect(page.getByRole('heading', { name: `Hello, ${ADA.displayName}` })).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: 'Your conferences' })
          .getByRole('heading', { level: 3 })
          .first(),
      ).toBeVisible()
    }

    await page.getByRole('link', { name: 'Home', exact: true }).first().click()
    await settled()

    const before = await storedKeys(page)

    // A key naming a conference, from which the attendee's own prefix is read back. Derived from
    // what the store actually holds rather than from an attendee id fetched some other way —
    // this test is about the store's answer, so the store is where the question comes from.
    const conferenceKey = before.find((key) => /^attendee:[^|]+\|event:[^|]+\|/.test(key))
    expect(
      conferenceKey,
      `no conference-scoped entry was written after visiting Agenda. Keys: ${JSON.stringify(before)}`,
    ).toBeDefined()

    const attendeePrefix = conferenceKey!.slice(0, conferenceKey!.indexOf('|') + 1)
    const phantom = `${attendeePrefix}event:00000000-0000-4000-8000-0000000000ff|programme`
    await storeEntry(page, phantom, new Date().toISOString(), [])

    expect(
      await storedKeys(page),
      'the planted conference was not stored, so the assertion below would pass vacuously',
    ).toContain(phantom)

    // A round trip that remounts Home's `Your conferences` card, which is what issues a fresh
    // `listRegistered()` with identity already resolved.
    await goToAgenda(page)
    await page.getByRole('link', { name: 'Home', exact: true }).first().click()
    await settled()

    await expect
      .poll(async () => await storedKeys(page), {
        timeout: 15_000,
        message:
          `the planted conference ${phantom} survived a successful listRegistered(). Either the ` +
          'erasure did not run, or `keys()` did not report the key back — the second is silent ' +
          'everywhere else, because an unreported key is simply never purged.',
      })
      .not.toContain(phantom)

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **And nothing else went with it** (FIX-302's sibling property). The erasure purges a whole
    // conference prefix, so a bound that reached one key too far would take the conference the
    // attendee is still registered for — and that loss is offline-only and silent.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const after = await storedKeys(page)
    for (const key of before) {
      expect(
        after,
        `${key} was erased alongside the withdrawn conference. Only entries under the conference ` +
          'absent from listRegistered() may go.',
      ).toContain(key)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FIX-2 — `remove()` AGAINST A REAL STORE, AND IT MUST TAKE ONE KEY AND NO NEIGHBOUR.**
   *
   * The other half of the same gap. `remove`'s real body is one line — `store.delete(key)` — and
   * one line is exactly the sort of thing nobody writes a browser test for; the unit suite proves
   * it resolves `undefined` when there is no IndexedDB, which is the path where it deletes
   * nothing by construction.
   *
   * **`remove`, never `purge`, is the property under test** (FIX-203). `purge` is a prefix match,
   * and this conference's other resources are still fresh and still readable — so the expiry of
   * one entry must not cost the attendee the rest of their offline copy. Routed through
   * `prefixBounds`, `remove` would take `programme` and leave `tracks` and `saved` gone too, and
   * **nothing on any screen would say so**: through the decorator, "deleted" and "present but
   * stale" are the same observation (FIX-204). Only the store can tell them apart, which is why
   * this reads the store.
   *
   * The entry is aged rather than corrupted, and the read is made offline, because that is the
   * only situation in which the decorator reaches the deletion at all: online it never consults
   * the cache, and a refusal purges the conference instead.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  test('an entry past its lifetime is DELETED, and its fresh neighbours are not (FIX-203)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    const before = await storedKeys(page)
    const programme = before.find((key) => key.endsWith('|programme'))
    expect(
      programme,
      `the programme was not cached after visiting Agenda. Keys: ${JSON.stringify(before)}`,
    ).toBeDefined()

    // Its neighbours under the same conference prefix — the entries `purge` would take and
    // `remove` must not. There is at least one: Agenda reads tracks and the commitment set too.
    const conferencePrefix = programme!.slice(0, programme!.lastIndexOf('|') + 1)
    const neighbours = before.filter((key) => key.startsWith(conferencePrefix) && key !== programme)
    expect(
      neighbours.length,
      `no other entry is cached under ${conferencePrefix}, so "one key and no neighbour" would ` +
        'be asserted against an empty set',
    ).toBeGreaterThan(0)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Offline FIRST, then the entry is aged.** The other way round leaves a window in which a
    // read still in flight rewrites the stamp with a live one, and the test then measures a
    // fresh entry while reporting on an expired one — it failed exactly that way once, and a
    // precondition that can be undone by a race is not a precondition.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await context.setOffline(true)
    try {
      // 48 hours: twice the lifetime, and nowhere near the clock-trust ceiling. See `ageOut`.
      const stamp = await ageOut(page, programme!, 48)
      expect(stamp, `${programme} could not be aged out`).not.toBeNull()
      expect(
        await storedStamp(page, programme!),
        `${programme} did not keep the stamp it was given, so its expiry is not established`,
      ).toBe(stamp)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **In-app navigation, NOT a reload — restructured by 012's T036** (FR-1140). This test
      // used to reload here, and under T032 that would make it pass FOR THE WRONG REASON while
      // proving nothing: an offline reload can no longer resolve an identity, so it renders
      // the identity-offline failure — whose wording also matches the assertion below — and
      // issues NO conference read at all, so the expired entry is never presented for the
      // deletion this test exists to prove. Navigating within the document keeps identity
      // resolved in memory; remounting Agenda is what issues the read that meets the expired
      // entry, triggers FIX-2's remove, and renders the conference-layer refusal.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await page.getByRole('link', { name: 'Home', exact: true }).first().click()
      await expect(page.getByRole('heading', { name: `Hello, ${ADA.displayName}` })).toBeVisible()
      await goToAgenda(page)

      // The surface is unchanged by the deletion (FIX-202): a connection is needed and nothing
      // is cached, which is what an expired entry has always meant. Waited for here so the
      // deletion has demonstrably happened before the store is read.
      const failure = page.getByRole('alert').first()
      await expect(failure).toBeVisible()
      await expect(failure).toContainText(/needs a connection/i)

      await expect
        .poll(async () => await storedKeys(page), {
          timeout: 15_000,
          message:
            `${programme} was still stored after it expired and was read. The 24-hour lifetime ` +
            'bounded what may be SERVED and, before FIX-2, bounded retention not at all — the ' +
            'bytes survived on the device against a deletion screen that says none are kept.',
        })
        .not.toContain(programme)
    } finally {
      await context.setOffline(false)
    }

    const after = await storedKeys(page)
    for (const key of neighbours) {
      expect(
        after,
        `${key} went with the expired programme entry. That is \`purge\`'s prefix match rather ` +
          'than `remove`, and it silently costs the attendee an offline copy that was still fresh.',
      ).toContain(key)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T038 (012) — SC-1207: AN OFFLINE COLD START PRESENTING NO CREDENTIAL DISCLOSES NOTHING.**
   *
   * The scenario is a device somebody else used: the previous attendee signed in, read their
   * agenda, and walked away without signing out. Whoever holds the device next opens MyNet with
   * no signal and no session cookie. Before T032 the client resolved the previous attendee from
   * the cached `getCurrent` entry, adopted their identifier as the cache scope, and served their
   * programme, saved sessions and private notes — name and all. This is the one test that
   * crosses the document boundary on purpose, because the boundary is where the disclosure
   * lived: jsdom has no document boundary and no service worker, which is why this cannot be a
   * unit or component test (research R3 names the layers and why each cheaper one fails).
   *
   * The two traps that would make it pass vacuously, handled by name:
   *   - **The service worker must control the page BEFORE going offline** — otherwise the
   *     offline reload serves no application at all, nothing renders, and every "does not
   *     disclose" assertion is true of a blank page. `awaitServiceWorker` plus the navigation
   *     assertion below are what make the page a real one.
   *   - **`clearCookies()` is the difference between this test and FR-215's** — with the cookie
   *     still present the scenario is "the owner reopened their own app", which is a different
   *     case with a different requirement. Here the credential is gone; only the bytes remain.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  test('an offline cold start with NO credential discloses nothing (SC-1207)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    // Seed the cache with real reads, and prove it: a disclosure test against an empty store
    // asserts nothing.
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
    const titles = (await page.getByRole('heading', { level: 3 }).allTextContents()).map((t) =>
      t.trim(),
    )
    expect(titles.length).toBeGreaterThan(0)
    const seeded = await storedKeys(page)
    expect(
      seeded.some((key) => /\|programme$/.test(key)),
      'the programme was never cached, so nothing below could disclose it and this test would pass vacuously',
    ).toBe(true)

    await context.clearCookies()
    await context.setOffline(true)

    try {
      await page.reload()

      // The page is real — the worker served the shell. Without this, a blank error page
      // satisfies every absence below.
      await expect(page.getByRole('navigation')).toBeVisible()

      // No name, no greeting: identity must not resolve from disk (FR-1140).
      await expect(page.getByText(ADA.displayName)).toHaveCount(0)
      await expect(page.getByText(ADA.email)).toHaveCount(0)

      // No programme: the cached conference content is keyed to an identity this document must
      // not learn, so not one seeded session title may render.
      for (const title of titles) {
        await expect(page.getByRole('heading', { level: 3, name: title })).toHaveCount(0)
      }

      // No retrieval stamp either — a stamp is an admission that cached content is being served.
      await expect(page.getByText(/last updated/i)).toHaveCount(0)
      await expect(page.getByText(/saved on this device/i)).toHaveCount(0)
    } finally {
      await context.setOffline(false)
    }
  })
})
