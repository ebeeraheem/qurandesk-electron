import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { getAudioRoot } from './protocol'
import type { ReciterSummary, SurahDownload } from '../shared/api'
import type { RemoteReciter } from './manifest'

/**
 * Phase-5 implementation of the "what's downloaded" surface. Source of truth
 * is the filesystem (single `readdir` per reciter, regex-match `NNN.mp3`).
 *
 * Phase 6 will swap these implementations to read from a SQLite `downloads`
 * table — the public surface here (`getSurahDownloads`, `buildReciterSummary`)
 * stays stable so callers don't move.
 */

const SURAH_FILE_RX = /^(\d{3})\.mp3$/

async function downloadedSurahsFor(reciterId: string): Promise<Set<number>> {
  const dir = join(getAudioRoot(), reciterId)
  let entries: string[]
  try {
    entries = await fsp.readdir(dir)
  } catch {
    // No directory yet → no downloads.
    return new Set()
  }
  const nums = new Set<number>()
  for (const name of entries) {
    const m = SURAH_FILE_RX.exec(name)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 114) nums.add(n)
  }
  return nums
}

/** Full 114-entry status array for a reciter. */
export async function getSurahDownloads(reciterId: string): Promise<SurahDownload[]> {
  const downloaded = await downloadedSurahsFor(reciterId)
  const result: SurahDownload[] = new Array(114)
  for (let n = 1; n <= 114; n++) {
    result[n - 1] = {
      reciterId,
      surahNumber: n,
      status: downloaded.has(n) ? 'downloaded' : 'not_downloaded'
    }
  }
  return result
}

/** Map a remote reciter to a ReciterSummary including real on-disk download stats. */
export async function buildReciterSummary(r: RemoteReciter): Promise<ReciterSummary> {
  const downloaded = await downloadedSurahsFor(r.id)
  const count = downloaded.size
  const downloadState: ReciterSummary['downloadState'] =
    count === 0 ? 'none' : count >= 114 ? 'complete' : 'partial'
  return {
    id: r.id,
    name: r.name,
    photoUrl: r.photo_url ?? null,
    style: r.style,
    totalSizeBytes: r.total_size_bytes,
    downloadedSurahs: count,
    downloadState
  }
}
