/**
 * The dev-server side of the branch legend (`apply: 'serve'`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The legend is injected into the served HTML, not imported by `main.tsx`.**
 *
 * The obvious construction — a dynamic `import()` in `main.tsx` behind `import.meta.env.DEV` —
 * does not work, and fails in a way worth recording. Rolldown resolves an import specifier
 * while building the module graph, *before* eliminating the dead `if (false)` branch that
 * `import.meta.env.DEV` becomes. So `virtual:mynet-dev-legend` was looked up during every
 * production build, found nothing (this plugin does not run there), and failed the build
 * outright.
 *
 * Injecting a script tag during `serve` instead means the production entry graph contains no
 * reference to any of this. Not "a reference that gets dropped" — no reference. That is a
 * stronger guarantee than the guard it replaces, and `e2e/navigation.spec.ts` checks it
 * against a real production build rather than trusting the reasoning.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'

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

    // The only thing that pulls the legend into the page, and it exists only while serving.
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/src/dev/mount.tsx' },
          injectTo: 'body',
        },
      ]
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
      const watched = path

      /**
       * **Watch the directory, not the file.** `git checkout` does not edit HEAD in place — it
       * writes a temporary file and renames it over the top. An `fs.watch` on the file itself
       * follows the replaced inode and stops reporting anything, so the first checkout appears
       * to work and every one after it is silent. Watching the containing directory and
       * filtering by name survives the rename.
       */
      const watcher = watch(dirname(watched), (_event, filename) => {
        if (filename !== basename(watched)) return

        const next = readBranch(watched)
        if (next === branch) return
        branch = next

        // Updates a page that is already open…
        server.ws.send({ type: 'custom', event: 'mynet:branch', data: { branch } })

        // …and this updates the next one. Without it the transformed module stays cached, so a
        // newly opened tab would confidently show the branch you were on before.
        const module = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (module) server.moduleGraph.invalidateModule(module)
      })

      server.httpServer?.once('close', () => watcher.close())
    },
  }
}
