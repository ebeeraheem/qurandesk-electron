import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReciterSummary } from '@shared/api'
import { getSurah } from '@shared/surahs'
import ReciterAvatar from '../components/ReciterAvatar'
import { RepeatIcon } from '../components/PlayerBar'
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
import { formatTime } from '../utils/format'

/**
 * Expanded Now Playing view. Replaces the PlayerBar when navigated to.
 */
export default function NowPlaying(): React.JSX.Element {
  const navigate = useNavigate()
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const speed = usePlayerStore((s) => s.speed)
  const pendingTrack = usePlayerStore((s) => s.pendingTrack)
  const errorMessage = usePlayerStore((s) => s.errorMessage)
  const repeatMode = useSettingsStore((s) => s.settings.repeatMode)
  const [reciter, setReciter] = useState<ReciterSummary | null>(null)

  // No track — bounce back. (Happens if the URL is opened directly with nothing playing.)
  useEffect(() => {
    if (!current) navigate('/reciters', { replace: true })
  }, [current, navigate])

  // Extracted so exhaustive-deps tracks the primitive instead of the whole
  // `current` object (which gets a fresh reference on every store write).
  const reciterId = current?.reciterId
  useEffect(() => {
    if (!reciterId) return
    void window.api.getReciters().then((list) => {
      setReciter(list.find((r) => r.id === reciterId) ?? null)
    })
  }, [reciterId])

  if (!current) return <></>
  const surah = getSurah(current.surahNumber)
  if (!surah) return <></>

  // Bismillah is omitted for Surah 1 (it IS the surah) and Surah 9 (the only
  // surah that begins without it).
  const showBismillah = current.surahNumber !== 1 && current.surahNumber !== 9
  const isPlaying = status === 'playing'
  const isRepeatOne = repeatMode === 'one'
  const seekMax = duration > 0 ? duration : 1
  const seekValue = duration > 0 ? position : 0
  const seekPct = seekMax > 0 ? (seekValue / seekMax) * 100 : 0

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="app-drag flex items-center justify-between px-10 py-5">
        <span className="app-no-drag text-[10px] font-semibold uppercase tracking-widest text-muted">
          Now Playing
        </span>
        <button
          onClick={() => navigate(-1)}
          aria-label="Collapse"
          className="app-no-drag rounded-full p-2 text-muted hover:bg-bg-elev hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center px-10 pb-10">
        <div className="mt-4 w-full max-w-[280px]">
          {reciter ? (
            <ReciterAvatar reciter={reciter} className="w-full shadow-xl" />
          ) : (
            <div className="aspect-square w-full rounded-2xl bg-bg-elev" />
          )}
        </div>

        <div className="mt-10 text-center">
          {showBismillah && (
            <div
              dir="rtl"
              className="text-lg text-muted"
              style={{ fontFamily: 'var(--font-arabic, serif)' }}
            >
              بسم الله الرحمن الرحيم
            </div>
          )}
          <div
            dir="rtl"
            className="mt-2 text-4xl font-bold text-fg"
            style={{ fontFamily: 'var(--font-arabic, serif)' }}
          >
            {surah.name_ar}
          </div>
          <div className="mt-3 text-lg font-semibold text-fg">
            {surah.name_en} <span className="text-muted">· {surah.meaning_en}</span>
          </div>
          <div className="mt-1 text-sm text-muted">
            {current.reciterName} · Surah {current.surahNumber} of 114
          </div>
        </div>

        <div className="mt-10 w-full max-w-2xl">
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.1}
            value={seekValue}
            onChange={(e) => seekTo(Number(e.target.value))}
            disabled={duration === 0}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-bg-elev accent-primary disabled:cursor-not-allowed"
            style={
              duration > 0
                ? {
                    background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${seekPct}%, var(--color-bg-elev) ${seekPct}%, var(--color-bg-elev) 100%)`
                  }
                : undefined
            }
          />
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-faint">
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-5 text-muted">
          <button
            onClick={cycleRepeatMode}
            title={isRepeatOne ? 'Repeat surah' : 'Sequential play'}
            aria-label="Toggle repeat"
            aria-pressed={isRepeatOne}
            className={[
              'grid size-11 place-items-center rounded-full bg-bg-elev hover:text-fg',
              isRepeatOne && 'text-primary hover:text-primary'
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <RepeatIcon repeatOne={isRepeatOne} className="size-5" />
          </button>
          <button
            onClick={() => void playPrev()}
            disabled={!canGoPrev()}
            className="grid size-11 place-items-center rounded-full hover:bg-bg-elev hover:text-fg disabled:opacity-30"
            aria-label="Previous surah"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
              <path d="M6 6h2v12H6zM10 12l10-6v12z" />
            </svg>
          </button>
          <button
            onClick={togglePlay}
            className="grid size-16 place-items-center rounded-full bg-primary text-white shadow-lg hover:opacity-90"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-7">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-7">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => void playNext()}
            disabled={!canGoNext()}
            className="grid size-11 place-items-center rounded-full hover:bg-bg-elev hover:text-fg disabled:opacity-30"
            aria-label="Next surah"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
              <path d="M16 6h2v12h-2zM4 6v12l10-6z" />
            </svg>
          </button>
          <button
            onClick={cycleSpeed}
            aria-label="Playback speed"
            className="rounded-md bg-bg-elev px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg"
          >
            {speed.toFixed(2).replace(/\.?0+$/, '')}×
          </button>
        </div>

        {(pendingTrack || (errorMessage && (status === 'ended' || status === 'error'))) && (
          <div
            className={['mt-4 text-xs', status === 'error' ? 'text-danger' : 'text-muted'].join(
              ' '
            )}
          >
            {pendingTrack ? 'Downloading next surah…' : errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
