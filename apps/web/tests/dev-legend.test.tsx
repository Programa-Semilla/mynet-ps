import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DevLegend } from '../src/dev/DevLegend.js'

const PROPS = {
  branch: 'spec/production-foundation',
  instance: 'mynet-ps',
  webPort: 5173,
  database: 'mynet_ps',
}

describe('DevLegend', () => {
  it('names the branch and the instance, which is the point of having two tabs open', () => {
    render(<DevLegend {...PROPS} />)
    expect(screen.getByText('spec/production-foundation')).toBeInTheDocument()
    expect(screen.getByText(/mynet-ps/)).toBeInTheDocument()
    expect(screen.getByText(/5173/)).toBeInTheDocument()
    expect(screen.getByText(/mynet_ps/)).toBeInTheDocument()
  })

  it('collapses on click and restores on a second click', async () => {
    const user = userEvent.setup()
    render(<DevLegend {...PROPS} />)

    await user.click(screen.getByRole('button', { name: /collapse/i }))
    expect(screen.queryByText(/mynet_ps/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText(/mynet_ps/)).toBeInTheDocument()
  })

  it('marks itself as developer scaffolding rather than product surface', () => {
    const { container } = render(<DevLegend {...PROPS} />)
    expect(container.querySelector('[data-dev-legend]')).toBeInTheDocument()
  })
})
