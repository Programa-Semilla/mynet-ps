/**
 * The administrative product's name, and the reason it is a second constant (FR-921, FR-924).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `apps/web/src/app/branding.ts` holds `PRODUCT_NAME`, and this file does **not** import it.
 * That looks like duplication and is not: the two names must be able to differ, because the
 * whole point of decision 33 is that an operator can tell at a glance which of the two products
 * they are looking at. Deriving this one from the other would make "MyNet Administration"
 * change whenever the attendee product is renamed, silently.
 *
 * What they share is the *mark*, not the *name*: both draw the same brand asset from the same
 * generator (FR-921), and this application is recognisably MyNet by its appearance rather than
 * by reusing a string.
 *
 * There is no short name and no tagline here. Those exist in the attendee client to feed a web
 * app manifest, and this product has none (FR-923).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const ADMIN_PRODUCT_NAME = 'MyNet Administration'
