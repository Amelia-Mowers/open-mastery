/** Catches a content fault — a template that cannot render, a widget that
 * cannot draw — and shows an honest error with a reload, rather than a
 * lesson with its content missing.
 *
 * NO SILENT FALLBACKS: rendering "{a*b}", a placeholder, or an empty space
 * where the maths belongs is worse than stopping, because it looks like
 * teaching. The student is told the app broke, not shown broken material.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** reported so a real deployment can alert on it */
  onError?: (error: Error, info: ErrorInfo) => void
}

export class ContentErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
    // eslint-disable-next-line no-console
    console.error('content error', error, info)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <main className="shell">
        <section className="card" role="alert">
          <h1>Something went wrong with this lesson</h1>
          <p className="muted">
            That is a problem on our side, not yours — your progress is saved. Reload to carry on
            with something else.
          </p>
          <div className="answer-row">
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
          <p className="muted content-error-detail">{error.message}</p>
        </section>
      </main>
    )
  }
}
