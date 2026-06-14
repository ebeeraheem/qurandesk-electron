import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { ReciterSummary, SurahDownload } from '../shared/api'
import type { RemoteReciter } from './manifest'
import { getDb } from './db'
import { getAudioRoot } from './protocol'

/**
 * Read-side view over the SQLite `downloads` + `download_queue` tables.
 *
 * Source of truth = DB. The filesystem is reconciled into the DB once on
 * boot (`reconcileFilesystem`) so files dropped in by hand during earlier
 * testing — or files left over from a previous install — still appear in the
 * UI without forcing the user to re-download.
 */

const SURAH_FILE_RX = /^(\d{3})\.mp3$/

type QueueRow = {
  reciter_id: string
  surah_number: number
  status: 'queued' | 'active' | 'failed'
  progress_bytes: number
  total_bytes: number
  error: string | null
}

/** Full 114-entry status array for a reciter. */
export function getSurahDownloads(reciterId: string): SurahDownload[] {
  const downloaded = new Set(
    (
      getDb()
        .prepare('SELECT surah_number FROM downloads WHERE reciter_id = ?')
        .all(reciterId) as Array<{ surah_number: number }>
    ).map((r) => r.surah_number)
  )
  const queueRows = getDb()
    .prepare(
      `SELECT surah_number, status, progress_bytes, total_bytes
       FROM download_queue WHERE reciter_id = ?`
    )
    .all(reciterId) as Array<{
    surah_number: number
    status: QueueRow['status']
    progress_bytes: number
    total_bytes: number
  }>
  const byNumber = new Map(queueRows.map((q) => [q.surah_number, q]))

  const result: SurahDownload[] = new Array(114)
  for (let n = 1; n <= 114; n++) {
    if (downloaded.has(n)) {
      result[n - 1] = {
        reciterId,
        surahNumber: n,
        status: 'downloaded'
      }
      continue
    }
    const q = byNumber.get(n)
    if (q) {
      result[n - 1] = {
        reciterId,
        surahNumber: n,
        status: q.status,
        progressBytes: q.progress_bytes,
        totalBytes: q.total_bytes
      }
      continue
    }
    result[n - 1] = {
      reciterId,
      surahNumber: n,
      status: 'not_downloaded'
    }
  }
  return result
}

/** Sparse snapshot of every completed download, for full-library refreshes. */
export function getCompletedDownloads(): SurahDownload[] {
  const rows = getDb()
    .prepare('SELECT reciter_id, surah_number FROM downloads ORDER BY reciter_id, surah_number')
    .all() as Array<{ reciter_id: string; surah_number: number }>
  return rows.map((row) => ({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'downloaded'
  }))
}

/** Aggregate stats for a single reciter, derived from the downloads table. */
export function getReciterStats(reciterId: string): {
  downloadedSurahs: number
  downloadState: ReciterSummary['downloadState']
  bytesOnDisk: number
} {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM downloads WHERE reciter_id = ?`
    )
    .get(reciterId) as { count: number; bytes: number }
  const count = row.count
  return {
    downloadedSurahs: count,
    downloadState: count === 0 ? 'none' : count >= 114 ? 'complete' : 'partial',
    bytesOnDisk: row.bytes
  }
}

/** Build a ReciterSummary including real on-disk download stats. */
export function buildReciterSummary(r: RemoteReciter): ReciterSummary {
  const stats = getReciterStats(r.id)
  return {
    id: r.id,
    name: r.name,
    photoUrl: r.photo_url ?? null,
    style: r.style,
    totalSizeBytes: r.total_size_bytes,
    downloadedSurahs: stats.downloadedSurahs,
    downloadState: stats.downloadState
  }
}

/**
 * Two-way boot-time reconciliation between the `downloads` table and disk:
 *
 *  1. Files present that the DB doesn't know about → INSERT a row (lets
 *     hand-placed audio show up; also catches files we wrote successfully
 *     but didn't get a chance to record before a crash).
 *  2. Rows present that the file is no longer there → DELETE the row
 *     (handles external deletion / corruption / a wiped audio folder).
 *
 * Step 2 runs silently — no toast at boot, since the user hasn't done
 * anything yet. The on-play reconciliation in `getAudioUrl` is where the
 * user-facing toast lives, for the case where a file goes missing during a
 * running session.
 */
export async function reconcileFilesystem(): Promise<void> {
  const root = getAudioRoot()

  // Step 1: insert files we find on disk that the DB doesn't know about.
  let reciterDirs: string[]
  try {
    reciterDirs = await fsp.readdir(root)
  } catch {
    reciterDirs = []
  }

  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO downloads
     (reciter_id, surah_number, file_path, size_bytes, downloaded_at)
     VALUES (?, ?, ?, ?, ?)`
  )

  for (const reciterId of reciterDirs) {
    if (!/^[a-z0-9-]+$/.test(reciterId)) continue
    const dir = join(root, reciterId)
    let entries: string[]
    try {
      entries = await fsp.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      const m = SURAH_FILE_RX.exec(name)
      if (!m) continue
      const n = parseInt(m[1], 10)
      if (n < 1 || n > 114) continue
      const full = join(dir, name)
      let size = 0
      try {
        const stat = await fsp.stat(full)
        if (!stat.isFile()) continue
        size = stat.size
      } catch {
        continue
      }
      insert.run(reciterId, n, full, size, Date.now())
    }
  }

  // Step 2: delete rows whose files are no longer on disk.
  const rows = getDb()
    .prepare('SELECT reciter_id, surah_number, file_path FROM downloads')
    .all() as Array<{ reciter_id: string; surah_number: number; file_path: string }>
  const remove = getDb().prepare('DELETE FROM downloads WHERE reciter_id = ? AND surah_number = ?')
  for (const r of rows) {
    try {
      const stat = await fsp.stat(r.file_path)
      if (stat.isFile() && stat.size > 0) continue
    } catch {
      /* fall through to remove */
    }
    remove.run(r.reciter_id, r.surah_number)
  }
}
