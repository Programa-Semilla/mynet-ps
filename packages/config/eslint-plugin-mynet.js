/**
 * Project-local ESLint rules.
 *
 * These exist because two of the spec's success criteria are stated as counts that must be
 * zero (SC-008, SC-009). A count that only a reviewer can produce is not a gate — it is a
 * habit. These rules make both machine-checked.
 */

/**
 * Colour literals, in the notations that actually appear in real code.
 *
 * Named CSS colours (`red`, `navy`, …) are deliberately NOT matched. They cannot be
 * distinguished from ordinary prose or identifiers without a parser per language, and the
 * false-positive rate would push people toward disable comments — which would cost more than
 * the rule is worth. Hex and functional notation are what a designer-to-code handoff actually
 * produces, and they are what the prototype used (navy `#1b2340`, coral `#e8634d`, …).
 */
const COLOUR_PATTERNS = [
  // #rgb, #rgba, #rrggbb, #rrggbbaa — with a boundary so `#abcdefg` or an id selector fragment
  // does not match.
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  // Functional notation, any spacing: rgb( rgba( hsl( hsla( hwb( lab( lch( oklab( oklch( color(
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/g,
]

/**
 * `SC-009: zero colour literals outside the token definition file.`
 *
 * Implemented against raw source text rather than an AST, on purpose: the same rule then
 * applies to CSS (via @eslint/css) and to TypeScript/TSX with one implementation and one set
 * of patterns. An AST-based version would need separate node handling per language and would
 * still miss template literals and inline style strings.
 */
const noColourLiterals = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow colour literals outside the single token definition file (FR-008, SC-009)',
    },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      colourLiteral:
        'Colour literal "{{ match }}" is not permitted here. Every colour is a design token in apps/web/src/theme/tokens.css (FR-008, SC-009). Use the token, or add the colour to the token file if it is genuinely new.',
    },
  },
  create(context) {
    const allow = context.options[0]?.allow ?? []
    const filename = context.filename ?? context.getFilename()
    const normalised = filename.split('\\').join('/')

    if (allow.some((suffix) => normalised.endsWith(suffix))) {
      return {}
    }

    const scanWholeFile = () => {
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const text = sourceCode.getText()

      for (const pattern of COLOUR_PATTERNS) {
        // Patterns are module-level and carry /g, so lastIndex must be reset per file.
        pattern.lastIndex = 0
        let match
        while ((match = pattern.exec(text)) !== null) {
          context.report({
            loc: {
              start: sourceCode.getLocFromIndex(match.index),
              end: sourceCode.getLocFromIndex(match.index + match[0].length),
            },
            messageId: 'colourLiteral',
            data: { match: match[0] },
          })
        }
      }
    }

    // Two root node types, because this rule deliberately spans two languages: `Program` is
    // the JavaScript/TypeScript root, `StyleSheet` is @eslint/css's. Registering only the
    // first is a silent no-op on CSS — the rule loads, matches nothing, and reports a clean
    // run. That failure mode is exactly what SC-010 warns about, so both are named here.
    return {
      Program: scanWholeFile,
      StyleSheet: scanWholeFile,
    }
  },
}

/**
 * `SC-008: zero direct platform or network calls in feature code.`
 *
 * Constitution Principle V requires feature and presentation code to reach devices and data
 * through project-owned interfaces. This rule is the count. It is registered in Phase 7
 * (T106) against feature directories; the interfaces and their implementations in
 * `packages/platform` and `packages/data` are exempt, because implementing the interface is
 * precisely where the real call belongs.
 */
const noDirectPlatformAccess = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct browser, device, and network access in feature code (FR-045, SC-008)',
    },
    schema: [],
    messages: {
      network:
        'Direct network call ({{ name }}) in feature code. Data is reached through a repository interface from packages/data (FR-045, SC-008).',
      platform:
        'Direct platform API ({{ name }}) in feature code. Device capabilities are reached through the interfaces in packages/platform (FR-045, SC-008).',
      storage:
        'Direct storage access ({{ name }}) in feature code. Use SecureStorage from packages/platform (FR-045, SC-008).',
      dom: 'Direct DOM global ({{ name }}) in feature code. Reach the platform through an interface from packages/platform, or move this to the composition root (FR-045, SC-008).',
    },
  },
  create(context) {
    const NETWORK = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'])
    const STORAGE = new Set(['localStorage', 'sessionStorage', 'indexedDB', 'cookieStore'])
    const PLATFORM = new Set([
      'Notification',
      'geolocation',
      'mediaDevices',
      'clipboard',
      'share',
      'serviceWorker',
      'permissions',
      'credentials',
    ])
    /**
     * The ambient DOM globals.
     *
     * These were missing, and their absence is why the count was zero: feature code was calling
     * `document.title`, `window.location.assign`, and `document.getElementById` in files that
     * are not the exempted composition root, and the rule could not see any of them. SC-009's
     * count read zero because the detector was narrow, not because the violations were absent —
     * the "gate that passes while not checking" this codebase warns about elsewhere.
     *
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **016 (review finding A3) — THE OBSERVER AND LAYOUT GLOBALS, AND WHY LEAVING THEM OUT WAS
     * THE SAME MISTAKE THIS COMMENT ALREADY DESCRIBES.**
     *
     * `getComputedStyle` and `MutationObserver` were reached by `useDisplayed.ts` and reported by
     * nothing, while `window.getComputedStyle(element)` — the identical call, written the other
     * way — already failed. The asymmetry inside one feature is what makes the point: US5 needed
     * **constitution v5.1.0 and an eighth device capability** because `matchMedia` happens to be
     * on this list, and the only difference between the two cases is which identifiers somebody
     * thought to enumerate. SC-008's "zero direct platform calls" was a count of what this set
     * knew rather than of what was true.
     *
     * `ResizeObserver`, `IntersectionObserver` and `requestAnimationFrame` are added in the same
     * change although nothing reaches for the last two today. A list naming only the calls that
     * have already been made is the boundary that keeps discovering itself one violation late —
     * the same reasoning `mynet/vendor-boundary` records for listing Mailgun's package names
     * before anybody imports them.
     *
     * **These are NOT all viewport access, and the rule deliberately does not try to tell the two
     * apart.** Measuring a node the component itself rendered is legitimate — `Composer.tsx` and
     * `Thread.tsx` do it with `scrollHeight`, which is a property access this rule never sees.
     * The judgement belongs at the call site, written down, and `useDisplayed.ts` is the one
     * place that currently makes it: three per-line exemptions, each argued in that file's
     * header, rather than a config entry exempting the whole file from every DOM global forever.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    const DOM = new Set([
      'document',
      'window',
      'location',
      'history',
      'navigator',
      'matchMedia',
      'alert',
      'confirm',
      'caches',
      'getComputedStyle',
      'MutationObserver',
      'ResizeObserver',
      'IntersectionObserver',
      'requestAnimationFrame',
    ])

    /**
     * Objects whose *properties* name a capability, rather than the object being one.
     *
     * `navigator.share` is a violation; a domain object that happens to have a `share` field is
     * not. Restricting the property check to these objects is what tells the two apart.
     */
    const CAPABILITY_OBJECTS = new Set(['navigator', 'window'])

    /**
     * Resolved against the global scope rather than matched by name.
     *
     * Matching bare identifiers reported `event.location` on a domain object and a local
     * variable named `alert` — false positives that would have taught people to reach for
     * disable comments, which costs more than the rule is worth. An unresolved reference in the
     * global scope is, by definition, the ambient global.
     */
    const globalReferences = () => {
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const scope = sourceCode.scopeManager.globalScope
      if (!scope) return []

      // Two sources, and both are needed. `through` holds references that resolve to nothing at
      // all; `variables` with no `defs` are the environment globals the config declares (this
      // project sets `globals.browser` for the client), which resolve and so never appear in
      // `through`. Checking only one of the two silently misses half the violations.
      const references = [...scope.through]
      for (const variable of scope.variables) {
        if (variable.defs.length === 0) references.push(...variable.references)
      }
      return references
    }

    return {
      'Program:exit'() {
        for (const reference of globalReferences()) {
          const node = reference.identifier
          const name = node.name

          if (NETWORK.has(name)) {
            context.report({ node, messageId: 'network', data: { name } })
            continue
          }
          if (STORAGE.has(name)) {
            context.report({ node, messageId: 'storage', data: { name } })
            continue
          }
          if (PLATFORM.has(name)) {
            context.report({ node, messageId: 'platform', data: { name } })
            continue
          }

          if (DOM.has(name)) {
            // `navigator.mediaDevices` is reported as a platform capability rather than twice.
            const parent = node.parent
            const property =
              parent?.type === 'MemberExpression' && parent.object === node && !parent.computed
                ? parent.property.name
                : undefined

            if (CAPABILITY_OBJECTS.has(name) && property && PLATFORM.has(property)) {
              context.report({
                node: parent.property,
                messageId: 'platform',
                data: { name: `${name}.${property}` },
              })
              continue
            }

            context.report({ node, messageId: 'dom', data: { name } })
          }
        }
      },
    }
  },
}

export default {
  meta: { name: 'eslint-plugin-mynet', version: '0.0.0' },
  rules: {
    'no-colour-literals': noColourLiterals,
    'no-direct-platform-access': noDirectPlatformAccess,
  },
}
