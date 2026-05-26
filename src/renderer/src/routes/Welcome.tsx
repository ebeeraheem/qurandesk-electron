import { useEffect, useState } from 'react'
import logo from '../assets/logo.svg'

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; reciterCount: number; updatedAt: string }
  | { kind: 'error'; message: string }

type Props = {
  onContinue: () => void
}

/**
 * First-launch splash. Shown only when there is no cached manifest yet — if the
 * user has launched the app before and we already have a catalog on disk, the
 * gate in App.tsx skips Welcome and goes straight to the catalog.
 */
export default function Welcome({ onContinue }: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  const tryFetch = async (): Promise<void> => {
    setPhase({ kind: 'loading' })
    const result = await window.api.refreshManifest()
    if (!result.ok) {
      setPhase({ kind: 'error', message: result.error ?? 'Unknown error' })
      return
    }
    const reciters = await window.api.getReciters()
    setPhase({
      kind: 'ready',
      reciterCount: reciters.length,
      updatedAt: result.updatedAt ?? ''
    })
  }

  useEffect(() => {
    void tryFetch()
  }, [])

  return (
    <div className="app-drag relative flex h-full w-full items-center justify-center overflow-hidden bg-bg text-fg">
      {/* Soft radial purple glow per the welcome mock */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 35%, rgba(164, 74, 255, 0.18), transparent 55%)'
        }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center px-8 text-center">
        <img src={logo} alt="" className="size-16 drop-shadow-sm" />
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-primary-deep dark:text-fg">
          Welcome to QuranDesk
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A quiet listening room for complete Qur&apos;an recitations. Choose a reciter, download
          the surahs you want, and listen offline.
        </p>

        <div className="app-no-drag mt-8 flex flex-col items-center gap-3">
          {phase.kind === 'loading' && (
            <>
              <div className="size-10 animate-spin rounded-full border-2 border-bg-elev border-t-primary" />
              <div className="text-xs font-medium text-muted">Loading library…</div>
            </>
          )}

          {phase.kind === 'ready' && (
            <>
              <button
                onClick={onContinue}
                className="rounded-full bg-warm px-7 py-3 text-sm font-bold text-fg shadow-sm transition-opacity hover:opacity-90"
              >
                Continue to your library
                <span aria-hidden className="ml-2">
                  ›
                </span>
              </button>
              <div className="text-xs text-muted">
                {phase.reciterCount} reciter{phase.reciterCount === 1 ? '' : 's'} available
                {phase.updatedAt && ` · updated ${formatDate(phase.updatedAt)}`}
              </div>
            </>
          )}

          {phase.kind === 'error' && (
            <>
              <div className="max-w-sm rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                Couldn&apos;t reach the catalog: {phase.message}
              </div>
              <button
                onClick={() => void tryFetch()}
                className="rounded-full bg-primary px-7 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}
