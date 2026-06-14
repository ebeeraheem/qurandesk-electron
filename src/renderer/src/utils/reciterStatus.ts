import type { ReciterSummary } from '@shared/api'
import { formatBytes } from './format'

export function reciterStatusLabel(
  reciter: Pick<ReciterSummary, 'downloadState' | 'downloadedSurahs' | 'totalSizeBytes'>
): string {
  const size = formatBytes(reciter.totalSizeBytes)
  switch (reciter.downloadState) {
    case 'complete':
      return 'Downloaded'
    case 'partial':
      return `${reciter.downloadedSurahs} / 114 · ${size}`
    default:
      return `Not downloaded · ${size}`
  }
}
