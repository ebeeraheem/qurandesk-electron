import { useThemeStore } from '../stores/theme'
import { usePlayerStore } from '../stores/player'
import { cycleSpeed, seekTo, togglePlay } from '../audioEngine'
import { getSurah } from '@shared/surahs'
import { formatTime } from '../utils/format'

/**
 * Persistent mini player. Phase 5 wires play/pause, seek, and speed cycling
 * to the audio engine. Previous / next / continuous / expand stay visual-only
 * until Phase 8 builds out continuous play and the Now Playing view.
 */
export default function PlayerBar(): React.JSX.Element {
  const { active, preference, setPreference } = useThemeStore()
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)
  const duration = usePlayerStore((s) => s.duration)
  const position = usePlayerStore((s) => s.position)
  const speed = usePlayerStore((s) => s.speed)

  const surah = current ? getSurah(current.surahNumber) : null
  const isPlaying = status === 'playing'
  const hasTrack = current !== null

  const cycleTheme = (): void => {
    const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
    const next = order[(order.indexOf(preference) + 1) % order.length]
    setPreference(next)
  }

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>): void => {
    seekTo(Number(e.target.value))
  }

  // Display percent — when no track, render a hairline so the bar slot is visible.
  const seekMax = duration > 0 ? duration : 1
  const seekValue = duration > 0 ? position : 0

  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t border-border bg-bg px-5">
      {/* Now-playing summary */}
      <div className="flex min-w-[240px] items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-bg-elev text-muted">
          {hasTrack ? (
            <span
              className="text-base font-bold text-fg/80"
              style={{ fontFamily: 'var(--font-arabic, serif)' }}
            >
              {surah?.name_ar.slice(0, 1) ?? '·'}
            </span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
              <path d="M9 19V5l10-2v14" />
              <circle cx="6" cy="19" r="3" />
              <circle cx="16" cy="17" r="3" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          {hasTrack && surah ? (
            <>
              <div className="flex items-baseline gap-2 truncate">
                <span className="truncate text-sm font-semibold text-fg">{surah.name_en}</span>
                <span
                  dir="rtl"
                  className="text-xs text-muted"
                  style={{ fontFamily: 'var(--font-arabic, serif)' }}
                >
                  {surah.name_ar}
                </span>
              </div>
              <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                {isPlaying && (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-3 text-primary">
                    <rect x="3" y="10" width="3" height="10" rx="1" />
                    <rect x="9" y="6" width="3" height="14" rx="1" />
                    <rect x="15" y="12" width="3" height="8" rx="1" />
                  </svg>
                )}
                <span className="truncate">{current.reciterName}</span>
              </div>
            </>
          ) : (
            <>
              <div className="truncate text-sm font-semibold text-muted">Nothing playing</div>
              <div className="truncate text-xs text-faint">Choose a surah to begin</div>
            </>
          )}
        </div>
      </div>

      {/* Controls (centered) */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 text-muted">
          <button
            disabled
            title="Continuous play (coming in Phase 8)"
            className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-50"
            aria-label="Toggle continuous play"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button
            disabled
            title="Previous surah (coming in Phase 8)"
            className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-50"
            aria-label="Previous surah"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M6 6h2v12H6zM10 12l10-6v12z" />
            </svg>
          </button>
          <button
            onClick={togglePlay}
            disabled={!hasTrack}
            className="grid size-10 place-items-center rounded-full bg-primary text-white shadow-sm hover:opacity-90 disabled:opacity-40"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            disabled
            title="Next surah (coming in Phase 8)"
            className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-50"
            aria-label="Next surah"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M16 6h2v12h-2zM4 6v12l10-6z" />
            </svg>
          </button>
          <button
            onClick={cycleSpeed}
            className="rounded-md bg-bg-elev px-2 py-1 text-xs font-semibold text-muted hover:text-fg"
            aria-label="Playback speed"
          >
            {speed.toFixed(2).replace(/\.?0+$/, '')}×
          </button>
        </div>
        <div className="flex w-full max-w-2xl items-center gap-2 text-[11px] text-faint">
          <span className="tabular-nums">{formatTime(position)}</span>
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.1}
            value={seekValue}
            onChange={onSeek}
            disabled={!hasTrack || duration === 0}
            aria-label="Seek"
            className="seek-bar h-1 flex-1 cursor-pointer appearance-none rounded-full bg-bg-elev accent-primary disabled:cursor-not-allowed"
            style={
              hasTrack && duration > 0
                ? {
                    background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(seekValue / seekMax) * 100}%, var(--color-bg-elev) ${(seekValue / seekMax) * 100}%, var(--color-bg-elev) 100%)`
                  }
                : undefined
            }
          />
          <span className="tabular-nums">{formatTime(duration)}</span>
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
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
        <button
          disabled
          title="Expand Now Playing (coming in Phase 8)"
          className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-50"
          aria-label="Expand now playing"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </footer>
  )
}
