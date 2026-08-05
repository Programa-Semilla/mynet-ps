# Brainstorm Overview

Last updated: 2026-08-04

## Sessions

| # | Date | Topic | Status | Spec | Issue |
|---|------|-------|--------|------|-------|
| 01 | 2026-08-04 | foundation-slice | active | - | - |

## Open Threads

- Real brand mark and application icons — no logo exists in the repository; the slice ships
  visibly provisional placeholders and the client must supply the real mark (from #01)
- What "PS" denotes in the repository name `mynet-ps` (from #01)
- Constitution amendment required to record the MyNet product-name decision and strike the entry
  from the Open Questions Register (from #01)
- Stale "EventLink" naming in `GroundZero/requirements.md` and the prototype UI; correction path
  undecided, and requirements.md is the priority-1 authoritative source (from #01)
- Abstraction layer shape — root-injected registry versus React context provider per service;
  deferred to the plan phase (from #01)
- `SecureStorage` stub semantics — demo scope resets on reload, but the name implies durability
  (from #01)
- Package manager choice — prototype carries `pnpm-workspace.yaml` but no lockfile (from #01)
- Cloudflare Pages preview URLs are publicly reachable by default, which would expose preview
  builds of a private client repository unless Cloudflare Access is placed in front (from #01)
- Desktop and tablet layouts remain unvalidated by the client; the approved prototype is
  mobile-only at a fixed 390×844 (from #01)
- Server-side branch protection unavailable (private repo on a free personal account; APIs return
  403); enforcement is client-side and bypassable with `--no-verify` (from #01)

## Parked Ideas

None.
