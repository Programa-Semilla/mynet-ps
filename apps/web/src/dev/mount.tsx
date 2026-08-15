/**
 * The only file that touches the virtual module and the dev websocket.
 *
 * Kept apart from `DevLegend.tsx` so the component stays testable: the virtual module does not
 * resolve under Vitest, because the plugin that provides it is not loaded there.
 *
 * Loaded by a script tag that `devBranchLegend()` injects into the served HTML — nothing in
 * `src/` imports this file, which is what keeps it out of the production graph entirely. It
 * therefore runs itself on load rather than waiting to be called.
 */
import { createRoot } from 'react-dom/client'
// @ts-expect-error — provided by `devBranchLegend()` in vite.config.ts, dev server only.
import { initial } from 'virtual:mynet-dev-legend'

import { DevLegend } from './DevLegend.js'

export const mountDevLegend = (): void => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  const render = (branch: string) =>
    root.render(
      <DevLegend
        branch={branch}
        instance={initial.instance}
        webPort={initial.webPort}
        database={initial.database}
      />,
    )

  render(initial.branch)

  // Pushed by the plugin when `.git/HEAD` changes, so checking out another branch updates the
  // strip without a restart or a reload.
  import.meta.hot?.on('mynet:branch', (data: { branch: string }) => render(data.branch))
}

mountDevLegend()
