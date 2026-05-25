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
  const isPlayingTrack = isCurrent && status === 'playing'
  const isDownloaded = download.status === 'downloaded'

  const onActivate = (): void => {
    if (!isDownloaded) return
    if (isCurrent) togglePlay()
    else void playTrack({ reciterId, reciterName, surahNumber: download.surahNumber })
  }

  if (!surah) return <></>

  // Active downloads fill a subtle background up to their progress percent.
  const activePct =
    download.status === 'active' && download.totalBytes
      ? Math.min(100, (download.progressBytes ?? 0) / download.totalBytes * 100)
      : 0

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
        'relative grid grid-cols-[44px_1fr_auto_84px] items-center gap-4 px-5 py-3 transition-colors',
        isDownloaded ? 'cursor-pointer hover:bg-bg-elev' : 'cursor-default',
        isCurrent && 'bg-bg-tint'
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        download.status === 'active'
          ? {
              backgroundImage: `linear-gradient(to right, var(--color-bg-tint) ${activePct}%, transparent ${activePct}%)`
            }
          : undefined
      }
    >
      {isCurrent && (
        <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-md bg-primary" />
      )}

      <div className="text-right font-mono text-xs text-muted">{download.surahNumber}</div>

      <div className="min-w-0">
        <div
          className={['truncate font-semibold', isCurrent && 'text-primary']
            .filter(Boolean)
            .join(' ')}
        >
          {surah.name_en}
          <span className="ml-2 text-xs font-normal text-muted">· {surah.meaning_en}</span>
        </div>
        <RowStatus download={download} />
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
          download={download}
          isPlayingTrack={isPlayingTrack}
          onPlay={(e) => {
            e.stopPropagation()
            onActivate()
          }}
        />
      </div>
    </div>
  )
}

function RowStatus({ download }: { download: SurahDownload }): React.JSX.Element | null {
  switch (download.status) {
    case 'queued':
      return <div className="mt-0.5 text-[11px] text-muted">Queued</div>
    case 'active': {
      const pct =
        download.totalBytes && download.progressBytes
          ? Math.min(100, Math.round((download.progressBytes / download.totalBytes) * 100))
          : 0
      return (
        <div className="mt-0.5 text-[11px] text-primary">
          Downloading… {pct}%
        </div>
      )
    }
    case 'failed':
      return <div className="mt-0.5 text-[11px] text-danger">Failed — click ↻ to retry</div>
    default:
      return null
  }
}

function ActionButton({
  download,
  isPlayingTrack,
  onPlay
}: {
  download: SurahDownload
  isPlayingTrack: boolean
  onPlay: (e: React.MouseEvent) => void
}): React.JSX.Element {
  switch (download.status) {
    case 'downloaded':
      return (
        <button
          onClick={onPlay}
          className="grid size-8 place-items-center rounded-full bg-primary text-white shadow-sm hover:opacity-90"
          aria-label={isPlayingTrack ? 'Pause' : 'Play'}
        >
          {isPlayingTrack ? (
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

    case 'queued':
    case 'active':
      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            void window.api.cancelDownload(download.reciterId, download.surahNumber)
          }}
          className="grid size-8 place-items-center rounded-full bg-bg-elev text-muted hover:bg-danger/10 hover:text-danger"
          aria-label="Cancel download"
          title="Cancel"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
            <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
          </svg>
        </button>
      )

    case 'failed':
      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            void window.api.cancelDownload(download.reciterId, download.surahNumber).then(() =>
              window.api.downloadSurah(download.reciterId, download.surahNumber)
            )
          }}
          className="grid size-8 place-items-center rounded-full bg-warning/15 text-warning hover:bg-warning/25"
          aria-label="Retry download"
          title="Retry"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" strokeLinecap="round" />
            <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" strokeLinecap="round" />
            <path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )

    default:
      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            void window.api.downloadSurah(download.reciterId, download.surahNumber)
          }}
          className="grid size-8 place-items-center rounded-full text-muted hover:bg-primary/10 hover:text-primary"
          aria-label="Download"
          title="Download"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
            <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )
  }
}
