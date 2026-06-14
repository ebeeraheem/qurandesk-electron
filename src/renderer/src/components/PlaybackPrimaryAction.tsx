import type { SurahDownload } from '@shared/api'
import { cancelTrackDownload, downloadAndPlay, togglePlay } from '../audioEngine'
import type { CurrentTrack } from '../stores/player'

type Props = {
  track: CurrentTrack
  download: SurahDownload
  isPlaying: boolean
  size: 'compact' | 'large'
}

export default function PlaybackPrimaryAction({
  track,
  download,
  isPlaying,
  size
}: Readonly<Props>): React.JSX.Element {
  const queued = download.status === 'queued' || download.status === 'active'
  const label = getActionLabel(download.status, isPlaying)

  const activate = (): void => {
    if (download.status === 'downloaded') {
      togglePlay()
    } else if (queued) {
      void cancelTrackDownload(track)
    } else {
      void downloadAndPlay(track)
    }
  }

  return (
    <button
      onClick={activate}
      className={[
        'grid place-items-center rounded-full bg-primary text-white shadow-sm hover:opacity-90',
        size === 'large' ? 'size-16 shadow-lg' : 'size-10'
      ].join(' ')}
      aria-label={label}
      title={label}
    >
      <ActionIcon status={download.status} isPlaying={isPlaying} size={size} />
    </button>
  )
}

function getActionLabel(status: SurahDownload['status'], isPlaying: boolean): string {
  if (status === 'downloaded') return isPlaying ? 'Pause' : 'Play'
  if (status === 'queued' || status === 'active') return 'Cancel download'
  if (status === 'failed') return 'Retry download and play'
  return 'Download and play'
}

function ActionIcon({
  status,
  isPlaying,
  size
}: Readonly<{
  status: SurahDownload['status']
  isPlaying: boolean
  size: Props['size']
}>): React.JSX.Element {
  const className = size === 'large' ? 'size-7' : 'size-5'
  if (status === 'queued' || status === 'active') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className}
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" strokeLinecap="round" />
        <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" strokeLinecap="round" />
        <path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status !== 'downloaded') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className}
      >
        <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return isPlaying ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
