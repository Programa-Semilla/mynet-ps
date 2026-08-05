import { destinationFor } from '../navigation.js'
import { DestinationPlaceholder } from './Placeholder.js'

/**
 * Network — structurally present, carrying no product content in this slice (FR-023).
 * See `Placeholder.tsx` for why that is the requirement rather than a shortfall.
 *
 * Looked up by address rather than by position, so reordering the navigation cannot silently
 * point this destination at a different one.
 */
export const Network = () => <DestinationPlaceholder destination={destinationFor('/network')!} />
