import { Route, Routes } from 'react-router'

import { AppShell } from '../shell/AppShell.js'
import { NotFound } from '../shell/NotFound.js'
import { Home } from './destinations/Home.js'
import { DestinationPlaceholder } from './destinations/Placeholder.js'
import { DESTINATIONS, HOME } from './navigation.js'
import { RequireAuth } from './RequireAuth.js'

/**
 * T069, T070 — five individually addressable destinations (FR-012, FR-013, FR-014, FR-015).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Recorded override.** `GroundZero/requirements.md` describes a "single-route" product demo
 * and the prototype switches destinations through `useState` in a 1,400-line `App.tsx`. The
 * project owner decided on 2026-08-04 that each destination is individually addressable, and
 * constitution v2.0.0 classifies "single-route" as a HOW statement that does not bind. This
 * file is that decision; it was not inferred (Principle I).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The routes are generated from `DESTINATIONS`, not written again here.** They used to be
 * literal `path` props, with each destination module looking its own address up a third time
 * through `destinationFor('/agenda')!`. Changing an address in one place type-checked cleanly
 * and turned that non-null assertion into a runtime crash inside the shell — the blank page
 * FR-061 exists to prevent. One list, one source.
 *
 * Nesting is what makes FR-014 fall out rather than needing to be implemented: a direct load of
 * `/discover` matches the child directly, so the destination renders active on first paint
 * without passing through Home. There is no redirect and no "default then correct" step that a
 * shared link could be seen flickering through.
 *
 * The guard wraps the shell rather than each destination, so `*` is guarded too — an
 * unauthenticated visitor at a nonsense address is asked to sign in rather than being told what
 * does and does not exist.
 */
export const AppRoutes = () => (
  <Routes>
    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        {DESTINATIONS.map((destination) => {
          // Home is the only destination whose address is the index rather than a segment.
          if (destination.path === HOME.path) {
            return <Route key={destination.path} index element={<Home />} />
          }

          // ─────────────────────────────────────────────────────────────────────────────
          // T017 (005) — **the destination says what renders it; this file names no address**
          // (FR-233).
          //
          // This used to read `destination.path === '/agenda' ? <Agenda /> : …`. Four more
          // features would each have added a branch to that expression, so the router would
          // have become the shared file every destination feature edits — the contention
          // 002's per-domain splits exist to remove.
          //
          // A destination with no element yet is not broken: Discover, Messages and Network
          // legitimately render the placeholder, which is a real state rather than a missing
          // one.
          // ─────────────────────────────────────────────────────────────────────────────
          return (
            <Route
              key={destination.path}
              path={destination.path.slice(1)}
              element={destination.element ?? <DestinationPlaceholder destination={destination} />}
            >
              {/*
                Nested addresses the destination declares for itself — today, Agenda's session
                detail panel. Rendered generically: this file still names no address, so 009
                extending that panel and 006–008 gaining their own nested views change
                `navigation.ts` and never the router.
              */}
              {destination.children?.map((child) => (
                <Route key={child.path} path={child.path} element={child.element} />
              ))}
            </Route>
          )
        })}

        {/* FR-015 — inside the shell, so the navigation stays available. Never a blank screen. */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>
  </Routes>
)
