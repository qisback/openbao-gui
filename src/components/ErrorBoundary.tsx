// Catches render-time errors anywhere below it so a single broken page shows a
// recoverable message instead of a blank white screen. Class component because
// error boundaries have no hook equivalent.

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log only in dev builds — a render error inside a secret view could otherwise
    // put sensitive props/state into the production console (audit L1).
    if (import.meta.env.DEV) console.error('openbao-gui render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center-page">
          <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
            <h2 className="mb">Something went wrong</h2>
            <p className="muted mb">{this.state.error.message}</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-subtle" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <button className="btn btn-primary" onClick={() => (window.location.href = '/')}>
                Go home
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
