import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminApp } from './app/AdminApp.js'
import { ADMIN_PRODUCT_NAME } from './app/branding.js'
import { createAdminServices } from './app/services.js'
import './theme/index.css'

/**
 * T044 (013) — the administrative bootstrap.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO `registerSW()` CALL IN THIS FILE, AND ITS ABSENCE IS FR-923.**
 *
 * Compare `apps/web/src/main.tsx`, which imports `virtual:pwa-register` and calls it explicitly
 * — 007 moved that registration into source precisely so the worker would exist under `vite dev`
 * as well as `vite preview`, because Web Push is impossible without one.
 *
 * The administrative product has no notifications, no offline behaviour and no install, so it
 * has no worker to register. That is enforced from three directions rather than asserted here:
 * `vite.config.ts` loads no PWA plugin, `apps/admin/tests/unit/no-service-worker.test.ts` scans
 * this source tree for the identifier, and `mynet/no-direct-platform-access` reports
 * `serviceWorker` as a capability reference — this file being the one place that rule is off
 * makes the unit test the guard that actually covers it.
 *
 * **This file also imports nothing from `apps/web`.** A shared bootstrap would be the shortest
 * route back to one application with two faces, which is the arrangement decision 33 forbids.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const container = document.getElementById('root')

if (!container) {
  // Fail loudly rather than rendering nothing — the attendee client's reasoning for FR-061,
  // which Principle IV binds here in full (FR-922).
  throw new Error('Root container #root is missing from index.html')
}

document.title = ADMIN_PRODUCT_NAME

createRoot(container).render(
  <StrictMode>
    <AdminApp services={createAdminServices()} />
  </StrictMode>,
)
