import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void globalThis.api
      .reportDiagnostic('renderer/render', error.stack ?? error.message, {
        componentStack: info.componentStack
      })
      .catch(() => undefined)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid h-full w-full place-items-center bg-bg px-6 text-center text-fg">
        <div className="max-w-md rounded-2xl border border-border bg-bg-elev px-8 py-10">
          <h1 className="text-2xl font-bold">QuranDesk hit an unexpected problem</h1>
          <p className="mt-3 text-sm text-muted">
            Your downloads and settings are safe. Try loading the app again.
          </p>
          <button
            onClick={() => this.setState({ failed: false })}
            className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      </main>
    )
  }
}
