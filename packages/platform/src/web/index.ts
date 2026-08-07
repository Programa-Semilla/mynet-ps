/**
 * The web implementations of the device capability interfaces.
 *
 * Imported only by the composition root in `apps/web/src/app/services.ts`. Feature code imports
 * from `@mynet/platform` — the interfaces — and never from here, which is what makes every one
 * of these substitutable without touching a component (FR-047).
 */
export { WebConnectivityService } from './connectivity.js'
export { webDevices } from './devices.js'
// 005 — client-side storage for cached conference content (research D2). Reached through the
// `LocalCache` interface; nothing in `apps/web` names IndexedDB.
export { prefixBounds, resetLocalCacheForTests, WebLocalCache } from './local-cache.js'
