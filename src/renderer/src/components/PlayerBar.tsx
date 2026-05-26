import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'
import {
  canGoNext,
  canGoPrev,
  cycleRepeatMode,
  cycleSpeed,
  playNext,
  playPrev,
  seekTo,
  togglePlay
} from '../audioEngine'
import { getSurah } from '@shared/surahs'
import { formatTime } from '../utils/format'
import type { RepeatMode } from '@shared/api'

export default function PlayerBar(): React.JSX.Element {
  const navigate = useNavigate()
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)
  const duration = usePlayerStore((s) => s.duration)
  const position = usePlayerStore((s) => s.position)
  const speed = usePlayerStore((s) => s.speed)
  const pendingTrack = usePlayerStore((s) => s.pendingTrack)
  const errorMessage = usePlayerStore((s) => s.errorMessage)
  const repeatMode = useSettingsStore((s) => s.settings.repeatMode)

  const surah = current ? getSurah(current.surahNumber) : null
  const isPlaying = status === 'playing'
  const hasTrack = current !== null

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>): void => {
    seekTo(Number(e.target.value))
  }

  const seekMax = duration > 0 ? duration : 1
  const seekValue = duration > 0 ? position : 0

  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t border-border bg-bg px-5">
      <button
        onClick={() => hasTrack && navigate('/now-playing')}
        disabled={!hasTrack}
        className="flex min-w-[240px] items-center gap-3 rounded-lg p-1 text-left hover:bg-bg-elev disabled:hover:bg-transparent"
        aria-label="Open Now Playing"
      >
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-bg-elev text-muted">
          {hasTrack && surah ? (
            <span
              className="text-base font-bold text-fg/80"
              style={{ fontFamily: 'var(--font-arabic, serif)' }}
            >
              {surah.name_ar.slice(0, 1)}
            </span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-5"
            >
              <path d="M9 19V5l10-2v14" />
              <circle cx="6" cy="19" r="3" />
              <circle cx="16" cy="17" r="3" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          {hasTrack && surah && current ? (
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
      </button>

      {/* Controls */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 text-muted">
          <RepeatButton repeatMode={repeatMode} />
          <button
            onClick={() => void playPrev()}
            disabled={!canGoPrev()}
            className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-30"
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
            onClick={() => void playNext()}
            disabled={!canGoNext()}
            className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-30"
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
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-bg-elev accent-primary disabled:cursor-not-allowed"
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

        {(pendingTrack || (errorMessage && (status === 'ended' || status === 'error'))) && (
          <div
            className={['text-[10px]', status === 'error' ? 'text-danger' : 'text-muted'].join(' ')}
          >
            {pendingTrack ? `Downloading next surah…` : errorMessage}
          </div>
        )}
      </div>

      <ExpandButton hasTrack={hasTrack} />
    </footer>
  )
}

/**
 * Repeat-mode button. 'off' (default) = sequential play; 'one' = loop the
 * current surah. Skipping 'all' since wrapping 114 → 1 isn't useful here.
 */
export function RepeatButton({
  repeatMode
}: Readonly<{ repeatMode: RepeatMode }>): React.JSX.Element {
  const isOn = repeatMode === 'one'
  return (
    <button
      onClick={cycleRepeatMode}
      title={isOn ? 'Repeat surah' : 'Sequential play'}
      aria-label="Toggle repeat"
      aria-pressed={isOn}
      className={[
        'rounded-full p-2 hover:bg-bg-elev',
        isOn ? 'text-primary' : 'text-muted hover:text-fg'
      ].join(' ')}
    >
      <RepeatIcon repeatOne={isOn} />
    </button>
  )
}

export function RepeatIcon({
  repeatOne,
  className = 'size-4'
}: Readonly<{
  repeatOne: boolean
  className?: string
}>): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" />
      <path d="M7 23l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" />
      {repeatOne && (
        <text
          x="12"
          y="15.5"
          fontSize="7"
          fontWeight="700"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
        >
          1
        </text>
      )}
    </svg>
  )
}

function ExpandButton({ hasTrack }: Readonly<{ hasTrack: boolean }>): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <div className="flex shrink-0 items-center gap-2 text-muted">
      <button
        onClick={() => hasTrack && navigate('/now-playing')}
        disabled={!hasTrack}
        title="Expand Now Playing"
        className="rounded-full p-2 hover:bg-bg-elev hover:text-fg disabled:opacity-50"
        aria-label="Expand now playing"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-4"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
