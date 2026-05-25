import type { SurahDownload } from '@shared/api'
import { getSurah } from '@shared/surahs'
import { playTrack, togglePlay } from '../audioEngine'
import { usePlayerStore } from '../stores/player'

type Props = {
  download: SurahDownload
  reciterId: string
  reciterName: string
}

export default function SurahRow({ download, reciterId, reciterName }: Props): React.JSX.Element {
  const surah = getSurah(download.surahNumber)
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)

  const isCurrent =
    current?.reciterId === reciterId && current?.surahNumber === download.surahNumber
  const isPlaying = isCurrent && status === 'playing'
  const isDownloaded = download.status === 'downloaded'

  const onActivate = (): void => {
    if (!isDownloaded) return
    if (isCurrent) togglePlay()
    else void playTrack({ reciterId, reciterName, surahNumber: download.surahNumber })
  }

  // Bail safely if the bundled list ever disagrees with the surah number.
  if (!surah) return <></>

  return (
    <div
      onClick={onActivate}
      role={isDownloaded ? 'button' : undefined}
      tabIndex={isDownloaded ? 0 : -1}
      onKeyDown={(e) => {
        if (!isDownloaded) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
      className={[
        'relative grid grid-cols-[44px_1fr_auto_44px] items-center gap-4 px-5 py-3 transition-colors',
        isDownloaded ? 'cursor-pointer hover:bg-bg-elev' : 'cursor-default',
        isCurrent && 'bg-bg-tint'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Currently-playing marker (uses Primary per palette spec) */}
      {isCurrent && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-1 rounded-r-md bg-primary"
        />
      )}

      <div className="text-right font-mono text-xs text-muted">{download.surahNumber}</div>

      <div className="min-w-0">
        <div className={['truncate font-semibold', isCurrent && 'text-primary'].filter(Boolean).join(' ')}>
          {surah.name_en}
          <span className="ml-2 text-xs font-normal text-muted">· {surah.meaning_en}</span>
        </div>
      </div>

      <div
        dir="rtl"
        className="text-xl text-fg/80"
        style={{ fontFamily: 'var(--font-arabic, serif)' }}
      >
        {surah.name_ar}
      </div>

      <div className="flex justify-end">
        <ActionButton
          downloaded={isDownloaded}
          isPlaying={isPlaying}
          onClick={(e) => {
            e.stopPropagation()
            onActivate()
          }}
        />
      </div>
    </div>
  )
}

function ActionButton({
  downloaded,
  isPlaying,
  onClick
}: {
  downloaded: boolean
  isPlaying: boolean
  onClick: (e: React.MouseEvent) => void
}): React.JSX.Element {
  if (!downloaded) {
    // Download placeholder — Phase 6 wires the real download.
    return (
      <button
        disabled
        title="Download (coming in Phase 6)"
        className="grid size-8 place-items-center rounded-full text-muted/70"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
          <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full bg-primary text-white shadow-sm hover:opacity-90"
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  )
}
