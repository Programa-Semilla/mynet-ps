import { useAdminSession } from '../session.js'

/**
 * T069 (013) — the overview, naming the operator and their tier (FR-900, FR-924).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DELIBERATELY NOT A DASHBOARD, AND CERTAINLY NOT A COUNT OF OPEN REPORTS.**
 *
 * The obvious first screen for an administrative product is a summary — *"4 reports waiting, 2
 * conferences unassigned"* — and a count of open reports here would be wrong twice over.
 *
 * A conference organizer may not read reports **at all** (decision 35), so the number would have
 * to be hidden from them; a hidden-for-some number is a surface that renders differently by
 * tier in the one place both tiers land. And for a platform operator it would be a standing
 * count of other people's reported conduct on the screen they leave open all day, which is a
 * disclosure nobody asked for and the queue itself already carries under a decision that bounds
 * *where* it may appear (decision 38, third condition: only in the queue).
 *
 * So this says who you are and what you may reach, and the destinations do the rest.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const AdminHome = () => {
  const { state } = useAdminSession()
  const identity = state.status === 'signed-in' ? state.identity : null

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-text-primary">
        {identity ? `Signed in as ${identity.displayName}` : 'Administration'}
      </h1>

      {identity?.tier === 'platform' ? (
        <p className="mt-3 text-text-body">
          You hold product-wide authority. You can read the abuse-report queue, act on what it
          shows, promote attendees to organize a conference, and end an operator’s access.
        </p>
      ) : (
        <p className="mt-3 text-text-body">
          You organize the conferences listed under Conferences. Your authority reaches those and
          nothing else — and your MyNet account is unchanged in every way.
        </p>
      )}

      {/*
        Stated rather than left to be discovered. An organizer who cannot see Reports needs to
        know that is a permission and not a fault — which is the same reason FR-924 puts the tier
        in the top bar at all times.
      */}
      {identity?.tier === 'organizer' ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700">
          Abuse reports are read by platform operators only. That is deliberate, not a gap in your
          access.
        </p>
      ) : null}
    </div>
  )
}
