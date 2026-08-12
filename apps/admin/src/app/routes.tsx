import { Navigate, Route, Routes } from 'react-router'

import { ReplaceCredential } from './auth/ReplaceCredential.js'
import { SignIn } from './auth/SignIn.js'
import { ConferenceList } from './conferences/ConferenceList.js'
import { OperatorList } from './conferences/OperatorList.js'
import { ReportQueue } from './reports/ReportQueue.js'
import { useAdminSession } from './session.js'
import { AdminHome } from './shell/AdminHome.js'
import { AdminShell } from './shell/AdminShell.js'

/**
 * T047 (011) — the administrative route table (FR-920).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MIRRORS `apps/web/src/app/navigation.ts`'s CONTRACT WITHOUT REUSING IT, AND THE
 * DUPLICATION IS THE REQUIREMENT.**
 *
 * The attendee client's navigation is an append-only extension point: a destination declares its
 * own element and nested addresses, and `routes.tsx` names no address literally. That design is
 * good and this file follows its spirit — `ADMIN_DESTINATIONS` in `AdminShell.tsx` is the single
 * declaration the rail reads.
 *
 * What it does **not** do is import it. FR-920 says the administrative product reuses none of
 * MyNet's five destinations, Home card registry or navigation contract, and sharing the
 * navigation module would be the shortest route back to one application with two faces —
 * beginning with somebody appending an administrative destination to the attendee list and
 * filtering it out by tier, which is exactly the role-dependent rendering decision 33 forbids.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **There is no route-level tier check here, and that is deliberate.** `/reports` and
 * `/operators` render for an organizer who types the address, and the server answers their
 * requests with a 404 — which is what they see. Adding a client-side redirect would be
 * authorisation-shaped code in the one place FR-980 says authorisation must not live, and it
 * would make the absence of the rail entry look like the control rather than a courtesy.
 */
export const AdminRoutes = () => {
  const { state } = useAdminSession()

  if (state.status === 'loading') {
    return (
      <p className="p-6 text-sm text-text-muted" role="status">
        Loading…
      </p>
    )
  }

  if (state.status === 'signed-out') return <SignIn />

  // FR-992 — the operator is brought here on the FIRST refusal rather than being shown it.
  // `requireOperator` answers every administrative address except the replacement route with a
  // 403 while this stands, and the session provider reads that one 403 (`credential_not_replaced`)
  // rather than surfacing it. So the screen is not the control; it is what makes the control
  // invisible.
  if (state.status === 'must-replace-credential') return <ReplaceCredential />

  return (
    <AdminShell>
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/conferences" element={<ConferenceList />} />
        {/* The queue and one report share a screen, so the detail is a nested address on it. */}
        <Route path="/reports" element={<ReportQueue />} />
        <Route path="/reports/:reportId" element={<ReportQueue />} />
        <Route path="/operators" element={<OperatorList />} />
        {/* Anything else returns to the overview rather than rendering a blank page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminShell>
  )
}
