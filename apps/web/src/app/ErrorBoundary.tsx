import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * T063a — FR-061.
 *
 * An unexpected client error keeps the shell and offers a route back to a working state.
 * **Never a blank page.** A white screen is the one failure mode with no recovery path for
 * the attendee: nothing to read, nothing to click, no way to tell a crash from a slow network.
 *
 * Still a class component, because React has no hook equivalent for `componentDidCatch`.
 */
interface Props {
  readonly children: ReactNode
  /**
   * How to get back to a working state (FR-061).
   *
   * Injected rather than performed here. Recovering means a full reload, which is a platform
   * action, and this is presentation code — the composition root supplies it, the same way it
   * supplies every other platform capability.
   */
  readonly onRecover: () => void
}

interface State {
  readonly error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // FR-060's client-side counterpart: enough to diagnose, nothing sensitive. The component
    // stack names components, not attendee data.
    console.error('Unhandled client error:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div role="alert" className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card">
          <h1 className="mb-2 font-display text-xl font-semibold text-text-primary">
            Something went wrong on this screen
          </h1>
          <p className="mb-4 text-sm text-text-body">
            The rest of MyNet is still working. Your data has not been lost — nothing was saved from
            this screen.
          </p>
          <button
            type="button"
            // A full reload rather than clearing the error: whatever state produced the crash
            // is gone, so re-rendering the same tree would likely crash again. The action is
            // injected because performing it means touching the platform, and this is
            // presentation code (FR-045).
            onClick={this.props.onRecover}
            className="rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse"
          >
            Go to Home
          </button>
        </div>
      </main>
    )
  }
}
