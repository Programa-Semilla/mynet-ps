import { useEffect, useState } from 'react'

/**
 * The local-instance legend. Present only under `vite dev` — see `mount.tsx`.
 *
 * Props-only and free of any environment access, so it can be rendered in the component suite.
 * Everything environment-specific lives in `mount.tsx`.
 *
 * Colours come from theme tokens like everything else; `mynet/no-colour-literals` applies here
 * exactly as it does to product code, and no exemption is added for it.
 */
const STORAGE_KEY = 'mynet.devLegend.collapsed'

/** Matches the strip's own height, so the shell can reserve exactly that much. */
const HEIGHT = '2.75rem'

export const DevLegend = ({
  branch,
  instance,
  webPort,
  database,
}: {
  branch: string
  instance: string
  webPort: number
  database: string
}) => {
  const [collapsed, setCollapsed] = useState(
    () => globalThis.localStorage?.getItem(STORAGE_KEY) === 'true',
  )

  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(collapsed))
    // Reserves space so the strip never covers the mobile bottom navigation. Zero when
    // collapsed, and always zero in production, where this component does not exist.
    document.documentElement.style.setProperty('--spacing-dev-legend', collapsed ? '0px' : HEIGHT)
  }, [collapsed])

  return (
    <div
      data-dev-legend
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface-inverse px-3 py-1 font-mono text-2xs text-text-inverse"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={
          collapsed ? 'Expand the local instance legend' : 'Collapse the local instance legend'
        }
        className="flex w-full items-center gap-2 text-left"
      >
        <span aria-hidden="true">⎇</span>
        <span>{branch}</span>
        {!collapsed && (
          <span className="text-navy-200">
            {instance} · :{webPort} · db {database}
          </span>
        )}
      </button>
    </div>
  )
}
