import { useThemeStore } from '../stores/theme'

/**
 * Persistent mini player. v1 of the bootstrap is structural only —
 * no real audio source yet. Controls are visual placeholders so the
 * layout doesn't shift when the audio engine lands in the player phase.
 */
export default function PlayerBar(): React.JSX.Element {
  const { active, preference, setPreference } = useThemeStore()

  const cycleTheme = (): void => {
    const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
    const next = order[(order.indexOf(preference) + 1) % order.length]
    setPreference(next)
  }

  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t border-border bg-bg px-5">
      {/* Now-playing summary */}
      <div className="flex min-w-[220px] items-center gap-3">
        <div className="grid size-12 place-items-center rounded-lg bg-bg-elev text-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
            <path d="M9 19V5l10-2v14" />
            <circle cx="6" cy="19" r="3" />
            <circle cx="16" cy="17" r="3" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-muted">Nothing playing</div>
          <div className="truncate text-xs text-faint">Choose a reciter to begin</div>
        </div>
      </div>

      {/* Controls (centered) */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 text-muted">
          <button className="rounded-full p-2 hover:bg-bg-elev hover:text-fg" aria-label="Toggle continuous play">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button className="rounded-full p-2 hover:bg-bg-elev hover:text-fg" aria-label="Previous surah">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M6 6h2v12H6zM10 12l10-6v12z" />
            </svg>
          </button>
          <button
            className="grid size-10 place-items-center rounded-full bg-primary text-white shadow-sm hover:opacity-90"
            aria-label="Play"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button className="rounded-full p-2 hover:bg-bg-elev hover:text-fg" aria-label="Next surah">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M16 6h2v12h-2zM4 6v12l10-6z" />
            </svg>
          </button>
          <button className="rounded-md bg-bg-elev px-2 py-1 text-xs font-semibold text-muted hover:text-fg" aria-label="Playback speed">
            1.0×
          </button>
        </div>
        <div className="flex w-full max-w-2xl items-center gap-2 text-[11px] text-faint">
          <span>0:00</span>
          <div className="relative h-1 flex-1 rounded-full bg-bg-elev">
            <div className="absolute inset-y-0 left-0 w-0 rounded-full bg-primary" />
          </div>
          <span>0:00</span>
        </div>
      </div>

      {/* Right cluster — theme toggle + expand */}
      <div className="flex shrink-0 items-center gap-2 text-muted">
        <button
          onClick={cycleTheme}
          title={`Theme: ${preference} (active: ${active})`}
          className="rounded-full p-2 hover:bg-bg-elev hover:text-fg"
          aria-label="Cycle theme"
        >
          {active === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
        <button className="rounded-full p-2 hover:bg-bg-elev hover:text-fg" aria-label="Expand now playing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </footer>
  )
}
