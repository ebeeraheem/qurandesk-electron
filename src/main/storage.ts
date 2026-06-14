import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { StorageUsage } from '../shared/api'
import { getDb } from './db'

/**
 * Reports aggregate disk usage for the Downloads header and diagnostics.
 *
 *  - `appUsedBytes` is what the user has actually pulled down: sum of
 *    `size_bytes` from the `downloads` table. This is the truth, not whatever
 *    the filesystem says about the audio folder (which could include `.partial`
 *    files mid-download).
 *  - `freeBytes` / `totalBytes` come from `statfs` on the volume hosting the
 *    audio root. Numbers in bytes; node 20+ returns regular numbers (not
 *    BigInt) for these by default, which is fine since Number.MAX_SAFE_INTEGER
 *    is ~9 exabytes.
 */
export async function getStorageUsage(): Promise<StorageUsage> {
  const downloadDir = join(app.getPath('userData'), 'audio')

  // Make sure the directory exists or statfs may not pick the right mount.
  await fsp.mkdir(downloadDir, { recursive: true }).catch(() => undefined)

  let freeBytes = 0
  let totalBytes = 0
  try {
    const stats = await fsp.statfs(downloadDir)
    freeBytes = Number(stats.bavail) * Number(stats.bsize)
    totalBytes = Number(stats.blocks) * Number(stats.bsize)
  } catch {
    // statfs unavailable — best to surface zeros than fabricate; the UI shows "—".
  }

  const row = getDb()
    .prepare('SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM downloads')
    .get() as { bytes: number }

  return {
    appUsedBytes: row.bytes,
    freeBytes,
    totalBytes
  }
}
