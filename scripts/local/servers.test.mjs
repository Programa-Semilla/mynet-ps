import { describe, expect, it } from 'vitest'

import { renderBanner } from './servers.mjs'

const CONTEXT = {
  branch: 'spec/production-foundation',
  instance: { name: 'mynet-ps', databaseName: 'mynet_ps', webPort: 5173, apiPort: 3000 },
  hostPort: 55432,
}

describe('renderBanner', () => {
  it('leads with the URL, because that is the one thing being copied', () => {
    const lines = renderBanner(CONTEXT)
      .split('\n')
      .filter((line) => line.trim())
    const urlLine = lines.findIndex((line) => line.includes('http://localhost:5173'))
    const branchLine = lines.findIndex((line) => line.includes('spec/production-foundation'))
    expect(urlLine).toBeLessThan(branchLine)
  })

  it('names the branch, instance, database and API', () => {
    const banner = renderBanner(CONTEXT)
    expect(banner).toContain('spec/production-foundation')
    expect(banner).toContain('mynet-ps')
    expect(banner).toContain('mynet_ps on localhost:55432')
    expect(banner).toContain('http://localhost:3000')
  })

  it('prints the seeded credentials, so signing in needs no second document', () => {
    const banner = renderBanner(CONTEXT)
    expect(banner).toContain('ada@example.com')
    expect(banner).toContain('correct-horse-battery-staple')
  })

  it('follows the instance rather than assuming 5173', () => {
    const banner = renderBanner({
      ...CONTEXT,
      instance: { ...CONTEXT.instance, webPort: 5241, apiPort: 3068 },
    })
    expect(banner).toContain('http://localhost:5241')
    expect(banner).toContain('http://localhost:3068')
  })
})
