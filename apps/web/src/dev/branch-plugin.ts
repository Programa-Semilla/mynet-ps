/**
 * The dev-server side of the branch legend (`apply: 'serve'`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `apply: 'serve'` is the guarantee, not a convenience. The virtual module resolves only while
 * the dev server is running, so if the `import.meta.env.DEV` guard in `main.tsx` were ever
 * removed, `pnpm build` fails to resolve it — loudly, in CI — rather than shipping a developer
 * badge to an attendee.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, watch } from 'node:fs'

import type { Plugin } from 'vite'

import { branchFromHead } from './head.js'

const VIRTUAL_ID = 'virtual:mynet-dev-legend'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * A linked worktree's `.git` is a *file* pointing at the real git directory, so the HEAD to
 * watch cannot be assumed to be `.git/HEAD`. `rev-parse --git-path` answers correctly in both
 * layouts, which is the only reason this shells out at all.
 */
const headPath = (root: string): string | undefined => {
  try {
    return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return undefined
  }
}

const readBranch = (path: string | undefined): string => {
  if (!path) return 'unknown'
  try {
    return branchFromHead(readFileSync(path, 'utf8'))
  } catch {
    return 'unknown'
  }
}

export const devBranchLegend = (): Plugin => {
  let path: string | undefined
  let branch = 'unknown'

  return {
    name: 'mynet:dev-branch-legend',
    apply: 'serve',

    configResolved(config) {
      path = headPath(config.root)
      branch = readBranch(path)
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },

    load(id) {
      if (id !== RESOLVED_ID) return undefined

      // Everything but the branch is fixed for the life of the server, so it is inlined here
      // and only the branch travels over the websocket.
      return `export const initial = ${JSON.stringify({
        branch,
        instance: process.env['MYNET_INSTANCE_NAME'] ?? 'local',
        webPort: Number(process.env['MYNET_WEB_PORT'] ?? 5173),
        database: process.env['MYNET_DATABASE_NAME'] ?? 'unknown',
      })}`
    },

    configureServer(server) {
      if (!path) return

      // `git checkout` replaces HEAD rather than editing it in place, so `fs.watch` on the file
      // reports a rename. Re-reading on any event covers both.
      const watcher = watch(path, () => {
        const next = readBranch(path)
        if (next === branch) return
        branch = next
        server.ws.send({ type: 'custom', event: 'mynet:branch', data: { branch } })
      })

      server.httpServer?.once('close', () => watcher.close())
    },
  }
}
