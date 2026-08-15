/**
 * The single branding constant (FR-049, SC-013).
 *
 * The installed name, the document title, and the package identity all read from here. One
 * constant means the product cannot be called MyNet in one place and something else in
 * another — which is not hypothetical, given the prototype still says "EventLink" and the
 * name change is a recorded owner decision of 2026-08-04.
 */
export const PRODUCT_NAME = 'MyNet'

export const PRODUCT_TAGLINE =
  'What is happening next, who to meet, and where your conversations live.'

/** Used by the manifest (T096) and by `document.title`. */
export const PRODUCT_SHORT_NAME = 'MyNet'
