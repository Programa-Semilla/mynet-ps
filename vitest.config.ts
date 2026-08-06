import { defineConfig } from 'vitest/config'

import { componentProject, integrationProject, unitProject } from './packages/config/vitest.base.js'

/**
 * The three test layers FR-005 names, addressable individually so the pipeline can report
 * each as its own required check (FR-063).
 */
export default defineConfig({
  test: {
    projects: [unitProject, componentProject, integrationProject],
  },
})
