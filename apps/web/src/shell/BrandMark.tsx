/**
 * T037 (010) — the MyNet mark, in the product (FR-820, FR-821).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **The mark ships as an image beside live text, never as a raster lockup, and never in place
 * of an accessible name** (constitution v3.3.0). The board carries a lockup — mark plus wordmark
 * in one artwork — and using it would replace real text with pixels: unselectable, unsearchable,
 * unscalable, and read out by a screen reader only if somebody remembers the alt text. The
 * product name stays a `<span>` or an `<h1>`; this sits next to it.
 *
 * So the mark is **decorative, by construction**. `alt=""` and `aria-hidden` mean nothing here
 * is announced, which is what keeps FR-821 true: no accessible name, heading or landmark changes
 * anywhere this component is added. The name a screen reader reads is the text that was already
 * there.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * **One component, two colourways, and the choice is per surface rather than per theme.** The
 * failure this guards against is subtle: a navy mark on the navy rail is not a *degraded* mark,
 * it is an *absent* one — present in the DOM, correctly sized, correctly hidden from assistive
 * technology, and passing every assertion this project can make about it. Both files come from
 * one alpha matte painted twice, so their shapes cannot drift apart (FR-820b).
 *
 * Sizing is CSS, supplied by the caller. The asset is generously large (96px tall) and rendered
 * small, so it stays crisp on the hidpi displays this product's attendees are using without
 * shipping three variants of it.
 */

/** Which surface the mark is sitting on, named by the colour it must be to be seen there. */
export type BrandMarkColourway = 'coral' | 'navy'

/**
 * The two derived assets, by colourway.
 *
 * Coral is for **inverse** surfaces — the navy rail. Navy is for **light** ones: the raised top
 * bar and the authentication cards.
 */
const MARK_SOURCE: Record<BrandMarkColourway, string> = {
  coral: '/brand/mark-coral.png',
  navy: '/brand/mark-navy.png',
}

/** The generated asset's intrinsic size, declared so the image reserves its box before it loads. */
const INTRINSIC = { width: 91, height: 96 }

export const BrandMark = ({
  colourway,
  className = '',
}: {
  colourway: BrandMarkColourway
  className?: string
}) => (
  <img
    src={MARK_SOURCE[colourway]}
    // Decorative: the product name beside it is the accessible name, and one is enough.
    alt=""
    aria-hidden="true"
    width={INTRINSIC.width}
    height={INTRINSIC.height}
    // `shrink-0` is load-bearing at 320px, where the top bar's controls share one row with this:
    // the label yields first, and no control may move (FR-825).
    className={`w-auto shrink-0 ${className}`}
    data-brand-mark={colourway}
  />
)
