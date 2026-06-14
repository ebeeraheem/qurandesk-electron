import type { SurahDownload } from '@shared/api'

export function getPlaybackAvailabilityLabel(download: SurahDownload): string | null {
  switch (download.status) {
    case 'not_downloaded':
      return 'Download this surah to play'
    case 'queued':
      return 'Waiting to download. Click to cancel.'
    case 'active': {
      const pct =
        download.totalBytes && download.progressBytes
          ? Math.min(100, Math.round((download.progressBytes / download.totalBytes) * 100))
          : 0
      return `Downloading... ${pct}% - click to cancel`
    }
    case 'failed':
      return 'Download failed. Click to retry.'
    default:
      return null
  }
}
