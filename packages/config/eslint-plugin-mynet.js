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

    const report = (node, name) => {
      if (NETWORK.has(name)) context.report({ node, messageId: 'network', data: { name } })
      else if (STORAGE.has(name)) context.report({ node, messageId: 'storage', data: { name } })
      else if (PLATFORM.has(name)) context.report({ node, messageId: 'platform', data: { name } })
    }

    return {
      Identifier(node) {
        // Skip property positions that are not member reads (e.g. `{ fetch: … }` keys).
        const parent = node.parent
        if (parent?.type === 'Property' && parent.key === node && !parent.computed) return
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
          report(node, node.name)
          return
        }
        if (parent?.type === 'MemberExpression' && parent.object !== node) return
        report(node, node.name)
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
