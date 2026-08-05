import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './theme/tokens.css'

const container = document.getElementById('root')

if (!container) {
  // Fail loudly rather than rendering nothing. FR-061 forbids a blank page as an outcome.
  throw new Error('Root container #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <p>MyNet</p>
  </StrictMode>,
)
