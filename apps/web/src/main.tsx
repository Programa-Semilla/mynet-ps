import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { PRODUCT_NAME } from './app/branding.js'
import { ErrorBoundary } from './app/ErrorBoundary.js'
import { createServices } from './app/services.js'
import './theme/tokens.css'

/**
 * The bootstrap.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * This file and `app/services.ts` are the only two in the client permitted to touch a platform
 * API, and both are exempted by name in the lint configuration rather than by pattern — so the
 * exemption is two reviewable lines rather than a habit.
 *
 * Everything the DOM is needed for lives here: finding the mount point, setting the document
 * title, and knowing how to recover from a crash. `App` and everything below it receive what
 * they need and never reach past an interface (FR-045, SC-008).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const container = document.getElementById('root')

if (!container) {
  // Fail loudly rather than rendering nothing. FR-061 forbids a blank page as an outcome.
  throw new Error('Root container #root is missing from index.html')
}

// FR-049 — from the single branding constant. Set once at boot rather than in a React effect:
// it is a property of the document, not of any component.
document.title = PRODUCT_NAME

createRoot(container).render(
  <StrictMode>
    {/*
      Outermost, and above `App`, so that a failure anywhere below — including in the providers
      themselves — still renders a working shell rather than a blank page (FR-061).
    */}
    <ErrorBoundary onRecover={() => window.location.assign('/')}>
      <App services={createServices()} />
    </ErrorBoundary>
  </StrictMode>,
)
