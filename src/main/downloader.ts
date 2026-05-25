import { promises as fsp, createWriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { QueueEntry, SurahDownload } from '../shared/api'
import { getDb } from './db'
import { audioFilePath } from './protocol'
import * as manifest from './manifest'

/**
 * Streamed downloader with persistent queue.
 *
 * Lifecycle:
 *   1. `enqueueSurah` / `enqueueReciter` insert rows into `download_queue`
 *      with status `'queued'` and emit a `download:progress` event so the UI
 *      flips to "queued" immediately.
 *   2. `tryStartNext()` walks the queue and starts up to MAX_CONCURRENT jobs.
 *      Each job marks its row `'active'`, AbortController is registered.
 *   3. `streamDownload` fetches the audio, pipes it to `<file>.mp3.partial`,
 *      throttles progress emits to ~2/sec, then atomically renames to its
 *      final name on success.
 *   4. On success: insert into `downloads`, delete the queue row, emit
 *      `download:completed`.
 *   5. On retryable failure: exponential backoff 1 / 4 / 16 s. After three
 *      attempts the row is marked `'failed'` with the error.
 *
 * `pauseAll` / `resumeAll` toggle a process-wide flag so no new jobs start;
 * in-flight downloads keep running. `cancelSurah` aborts (if active) and
 * deletes both the queue row and the `.partial` file.
 *
 * On boot, `recoverFromCrash()` demotes any leftover `'active'` rows back to
 * `'queued'` so a crash mid-download doesn't strand the row.
 */

const MAX_CONCURRENT = 3
const PROGRESS_EMIT_INTERVAL_MS = 500
const BACKOFF_DELAYS_MS = [1000, 4000, 16000]

const events = new EventEmitter()
const activeJobs = new Map<string, AbortController>() // key = `${reciterId}:${surah}`
let activeCount = 0
let paused = false
let recovered = false

type QueueRow = {
  id: string
  reciter_id: string
  surah_number: number
  status: 'queued' | 'active' | 'paused' | 'failed'
  progress_bytes: number
  total_bytes: number
  error: string | null
  created_at: number
}

const SURAH_FILE_RX = /^(\d{3})\.mp3$/

// ---------------------------------------------------------------------------
// Event API
// ---------------------------------------------------------------------------

export function onProgress(cb: (p: SurahDownload) => void): () => void {
  events.on('progress', cb)
  return () => events.off('progress', cb)
}

export function onCompleted(cb: (p: { reciterId: string; surah: number }) => void): () => void {
  events.on('completed', cb)
  return () => events.off('completed', cb)
}

function emitProgress(p: SurahDownload): void {
  events.emit('progress', p)
}

function emitCompleted(reciterId: string, surah: number): void {
  events.emit('completed', { reciterId, surah })
}

// ---------------------------------------------------------------------------
// Enqueue / cancel / delete
// ---------------------------------------------------------------------------

function isAlreadyDownloaded(reciterId: string, surah: number): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM downloads WHERE reciter_id = ? AND surah_number = ?')
    .get(reciterId, surah)
  return row !== undefined
}

function isInQueue(reciterId: string, surah: number): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM download_queue WHERE reciter_id = ? AND surah_number = ?')
    .get(reciterId, surah)
  return row !== undefined
}

export function enqueueSurah(reciterId: string, surah: number): void {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return
  if (isAlreadyDownloaded(reciterId, surah)) return
  if (isInQueue(reciterId, surah)) return

  const id = `${reciterId}:${surah}`
  getDb()
    .prepare(
      `INSERT INTO download_queue (id, reciter_id, surah_number, status, created_at)
       VALUES (?, ?, ?, 'queued', ?)`
    )
    .run(id, reciterId, surah, Date.now())

  emitProgress({
    reciterId,
    surahNumber: surah,
    status: 'queued',
    progressBytes: 0,
    totalBytes: 0
  })
  tryStartNext()
}

export function enqueueReciter(reciterId: string): number {
  const m = manifest.getCachedManifest()
  if (!m) throw new Error('Catalog not loaded')
  if (!m.reciters.some((r) => r.id === reciterId)) {
    throw new Error(`Unknown reciter id: ${reciterId}`)
  }

  // Bulk-insert anything not already downloaded or queued. Transaction keeps
  // it atomic and quick for 114 rows.
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO download_queue (id, reciter_id, surah_number, status, created_at)
     VALUES (?, ?, ?, 'queued', ?)`
  )
  const downloaded = new Set(
    (
      getDb()
        .prepare('SELECT surah_number FROM downloads WHERE reciter_id = ?')
        .all(reciterId) as Array<{ surah_number: number }>
    ).map((r) => r.surah_number)
  )
  const now = Date.now()

  const tx = getDb().transaction(() => {
    let added = 0
    for (let n = 1; n <= 114; n++) {
      if (downloaded.has(n)) continue
      const res = insert.run(`${reciterId}:${n}`, reciterId, n, now + n) // +n so order is stable
      if (res.changes > 0) added++
    }
    return added
  })
  const addedCount = tx()

  // Tell the UI about every enqueued row at once.
  for (let n = 1; n <= 114; n++) {
    if (downloaded.has(n)) continue
    if (!isInQueue(reciterId, n)) continue // race-safety
    emitProgress({
      reciterId,
      surahNumber: n,
      status: 'queued',
      progressBytes: 0,
      totalBytes: 0
    })
  }

  tryStartNext()
  return addedCount
}

export async function cancelSurah(reciterId: string, surah: number): Promise<void> {
  const key = `${reciterId}:${surah}`
  const controller = activeJobs.get(key)
  if (controller) controller.abort()

  getDb()
    .prepare('DELETE FROM download_queue WHERE reciter_id = ? AND surah_number = ?')
    .run(reciterId, surah)

  // Best-effort: remove a leftover .partial file.
  const final = audioFilePath(reciterId, surah)
  if (final) {
    await fsp.unlink(`${final}.partial`).catch(() => undefined)
  }

  emitProgress({
    reciterId,
    surahNumber: surah,
    status: 'not_downloaded',
    progressBytes: 0,
    totalBytes: 0
  })
}

export async function deleteSurah(reciterId: string, surah: number): Promise<void> {
  // Cancel any in-flight job first.
  await cancelSurah(reciterId, surah)
  getDb()
    .prepare('DELETE FROM downloads WHERE reciter_id = ? AND surah_number = ?')
    .run(reciterId, surah)
  const final = audioFilePath(reciterId, surah)
  if (final) {
    await fsp.unlink(final).catch(() => undefined)
  }
  emitProgress({
    reciterId,
    surahNumber: surah,
    status: 'not_downloaded',
    progressBytes: 0,
    totalBytes: 0
  })
}

export async function deleteReciter(reciterId: string): Promise<void> {
  // Cancel every active job for this reciter.
  for (const [key, controller] of [...activeJobs.entries()]) {
    if (key.startsWith(`${reciterId}:`)) controller.abort()
  }

  getDb().prepare('DELETE FROM download_queue WHERE reciter_id = ?').run(reciterId)
  getDb().prepare('DELETE FROM downloads WHERE reciter_id = ?').run(reciterId)

  // Best-effort: remove the audio folder for this reciter.
  const sampleFinal = audioFilePath(reciterId, 1)
  if (sampleFinal) {
    const folder = dirname(sampleFinal)
    await fsp.rm(folder, { recursive: true, force: true }).catch(() => undefined)
  }

  // Tell the UI every row reset.
  for (let n = 1; n <= 114; n++) {
    emitProgress({
      reciterId,
      surahNumber: n,
      status: 'not_downloaded',
      progressBytes: 0,
      totalBytes: 0
    })
  }
}

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

export function pauseAll(): void {
  paused = true
}

export function resumeAll(): void {
  paused = false
  tryStartNext()
}

export function isPaused(): boolean {
  return paused
}

// ---------------------------------------------------------------------------
// Queue introspection
// ---------------------------------------------------------------------------

export function getActiveQueue(): QueueEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM download_queue ORDER BY created_at ASC')
    .all() as QueueRow[]
  return rows.map(rowToEntry)
}

function rowToEntry(r: QueueRow): QueueEntry {
  return {
    reciterId: r.reciter_id,
    surahNumber: r.surah_number,
    status: r.status,
    progressBytes: r.progress_bytes,
    totalBytes: r.total_bytes,
    error: r.error,
    createdAt: r.created_at
  }
}

// ---------------------------------------------------------------------------
// Boot recovery
// ---------------------------------------------------------------------------

export function recoverFromCrash(): void {
  if (recovered) return
  recovered = true
  // Anything still marked 'active' is leftover from a crash. Demote so the
  // worker loop picks it up again.
  getDb().exec(`UPDATE download_queue SET status = 'queued' WHERE status = 'active'`)
  // Treat paused (UI didn't ship pause-individual) as queued too.
  getDb().exec(`UPDATE download_queue SET status = 'queued' WHERE status = 'paused'`)
  tryStartNext()
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

function tryStartNext(): void {
  while (!paused && activeCount < MAX_CONCURRENT) {
    const next = getDb()
      .prepare(
        `SELECT * FROM download_queue
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get() as QueueRow | undefined
    if (!next) break

    // Mark active synchronously so the next loop iteration doesn't pick the same row.
    getDb().prepare(`UPDATE download_queue SET status = 'active' WHERE id = ?`).run(next.id)
    activeCount++
    void runJob({ ...next, status: 'active' }).finally(() => {
      activeCount--
      tryStartNext()
    })
  }
}

async function runJob(row: QueueRow): Promise<void> {
  const key = `${row.reciter_id}:${row.surah_number}`
  const controller = new AbortController()
  activeJobs.set(key, controller)

  emitProgress({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'active',
    progressBytes: row.progress_bytes,
    totalBytes: row.total_bytes
  })

  try {
    await downloadWithRetries(row, controller.signal)
    finalizeSuccess(row)
    emitCompleted(row.reciter_id, row.surah_number)
  } catch (e) {
    if (isAbort(e)) {
      // Cancelled — queue row was deleted by cancelSurah; just leave.
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    // If queue row still exists, mark failed.
    const stillThere = getDb()
      .prepare('SELECT 1 FROM download_queue WHERE id = ?')
      .get(row.id)
    if (stillThere) {
      getDb()
        .prepare(`UPDATE download_queue SET status = 'failed', error = ? WHERE id = ?`)
        .run(msg, row.id)
      emitProgress({
        reciterId: row.reciter_id,
        surahNumber: row.surah_number,
        status: 'failed',
        progressBytes: row.progress_bytes,
        totalBytes: row.total_bytes
      })
    }
  } finally {
    activeJobs.delete(key)
  }
}

function finalizeSuccess(row: QueueRow): void {
  // Insert into downloads, delete from queue. Atomic.
  const final = audioFilePath(row.reciter_id, row.surah_number)
  if (!final) return // shouldn't happen — protocol module agreed on the path
  // size_bytes is filled in by streamDownload via the stat below; do it sync here.
  let size = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    size = require('node:fs').statSync(final).size as number
  } catch {
    // File missing — treat as failure path.
    return
  }
  const tx = getDb().transaction(() => {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO downloads (reciter_id, surah_number, file_path, size_bytes, downloaded_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(row.reciter_id, row.surah_number, final, size, Date.now())
    getDb().prepare('DELETE FROM download_queue WHERE id = ?').run(row.id)
  })
  tx()
}

async function downloadWithRetries(row: QueueRow, signal: AbortSignal): Promise<void> {
  let attempt = 0
  let lastError: unknown
  // 1 attempt + len(BACKOFF_DELAYS_MS) retries
  while (attempt <= BACKOFF_DELAYS_MS.length) {
    if (attempt > 0) {
      await sleep(BACKOFF_DELAYS_MS[attempt - 1], signal)
    }
    try {
      await streamDownload(row, signal)
      return
    } catch (e) {
      if (isAbort(e)) throw e
      lastError = e
    }
    attempt++
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function streamDownload(row: QueueRow, signal: AbortSignal): Promise<void> {
  const m = manifest.getCachedManifest()
  if (!m) throw new Error('Catalog not loaded')
  const url = `${m.audio_base_url}/${row.reciter_id}/${String(row.surah_number).padStart(3, '0')}.mp3`
  const final = audioFilePath(row.reciter_id, row.surah_number)
  if (!final) throw new Error('Invalid file path')
  const partial = `${final}.partial`

  await fsp.mkdir(dirname(final), { recursive: true })

  const resp = await fetch(url, { signal })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  if (!resp.body) throw new Error('Empty response body')

  const totalHeader = resp.headers.get('content-length')
  const totalBytes = totalHeader ? Number(totalHeader) : 0
  getDb()
    .prepare(`UPDATE download_queue SET total_bytes = ?, progress_bytes = 0 WHERE id = ?`)
    .run(totalBytes, row.id)

  let downloaded = 0
  let lastEmit = 0
  // Throttle DB writes too — every 500ms is fine for crash-resume granularity.
  const updateProgress = getDb().prepare(
    `UPDATE download_queue SET progress_bytes = ? WHERE id = ?`
  )

  const writeStream = createWriteStream(partial)
  // Use a wrapping stream so we can count bytes + throttle emits while still
  // benefiting from `pipeline`'s back-pressure and error propagation.
  const source = Readable.fromWeb(
    resp.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>
  )

  source.on('data', (chunk: Buffer) => {
    downloaded += chunk.length
    const now = Date.now()
    if (now - lastEmit >= PROGRESS_EMIT_INTERVAL_MS) {
      lastEmit = now
      try {
        updateProgress.run(downloaded, row.id)
      } catch {
        // Row may have been deleted by a concurrent cancel; ignore.
      }
      emitProgress({
        reciterId: row.reciter_id,
        surahNumber: row.surah_number,
        status: 'active',
        progressBytes: downloaded,
        totalBytes
      })
    }
  })

  try {
    await pipeline(source, writeStream, { signal })
  } catch (e) {
    // Best-effort cleanup of the partial file if pipeline errored.
    await fsp.unlink(partial).catch(() => undefined)
    throw e
  }

  // Atomic rename — anything not `.partial` is guaranteed complete and playable.
  await fsp.rename(partial, final)

  // Final progress emit so the UI moves to 100% before download:completed lands.
  emitProgress({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'active',
    progressBytes: downloaded || totalBytes,
    totalBytes
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(makeAbort())
    const t = setTimeout(() => resolve(), ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(makeAbort())
      },
      { once: true }
    )
  })
}

function makeAbort(): Error {
  return new DOMException('Aborted', 'AbortError')
}

function isAbort(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'AbortError' || e.code === DOMException.ABORT_ERR)
  ) || (e instanceof Error && e.name === 'AbortError')
}

// ---------------------------------------------------------------------------
// Filesystem reconciliation (called from downloads.ts buildReciterSummary)
// ---------------------------------------------------------------------------

/** True if a finalised file exists for this surah on disk. */
export function existsOnDisk(reciterId: string, surah: number): boolean {
  const final = audioFilePath(reciterId, surah)
  if (!final) return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').statSync(final)
    return true
  } catch {
    return false
  }
}

export { SURAH_FILE_RX }
