import { promises as fsp, createWriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import log from 'electron-log/main'
import type { QueueEntry, SurahDownload } from '../shared/api'
import { getDb } from './db'
import { audioFilePath, getAudioRoot } from './protocol'
import * as manifest from './manifest'
import { appError, throwAppError } from './errors'
import { recordDiagnostic } from './diagnostics'

const CATALOG_NOT_LOADED_MSG = "The reciter catalog hasn't loaded yet. Try again in a moment."
const DOWNLOAD_FAILED_MSG = 'Download failed. Check your internet connection and try again.'

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
 *   5. Transient failures retry with capped exponential backoff; permanent
 *      failures are marked `'failed'` with technical detail retained in logs.
 *
 * Explicit single-surah and playback requests have priority over bulk queue
 * items. `cancelSurah` aborts (if active) and deletes both the queue row and
 * the `.partial` file.
 *
 * On boot, `recoverFromCrash()` demotes any leftover `'active'` rows back to
 * `'queued'` so a crash mid-download doesn't strand the row.
 */

const MAX_CONCURRENT = 3
const PROGRESS_EMIT_INTERVAL_MS = 500
const REQUEST_TIMEOUT_MS = 30_000
const STREAM_INACTIVITY_TIMEOUT_MS = 30_000
const MAX_BACKOFF_MS = 60_000
const BACKOFF_DELAYS_MS = [1000, 4000, 16000, 30000, MAX_BACKOFF_MS]

class DownloadError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly retryAfterMs?: number,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'DownloadError'
  }
}

const events = new EventEmitter()
const activeJobs = new Map<string, AbortController>() // key = `${reciterId}:${surah}`
let activeCount = 0
let recovered = false

type QueueRow = {
  id: string
  reciter_id: string
  surah_number: number
  status: 'queued' | 'active' | 'failed'
  progress_bytes: number
  total_bytes: number
  error: string | null
  created_at: number
  priority: number
}

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

export function onLibraryChanged(cb: () => void): () => void {
  events.on('libraryChanged', cb)
  return () => events.off('libraryChanged', cb)
}

function emitProgress(p: SurahDownload): void {
  events.emit('progress', p)
}

function emitCompleted(reciterId: string, surah: number): void {
  events.emit('completed', { reciterId, surah })
}

/**
 * Called from the `getAudioUrl` IPC handler when the DB says a surah is
 * downloaded but the file is no longer on disk. Removes the orphaned row and
 * notifies the renderer so it can flip the row state back to `not_downloaded`.
 */
export function notifyFileMissing(reciterId: string, surahNumber: number): void {
  const result = getDb()
    .prepare('DELETE FROM downloads WHERE reciter_id = ? AND surah_number = ?')
    .run(reciterId, surahNumber)
  if (result.changes === 0) return
  // Flip the row state for live UI (cards, surah row).
  emitProgress({
    reciterId,
    surahNumber,
    status: 'not_downloaded',
    progressBytes: 0,
    totalBytes: 0
  })
  recordDiagnostic('playback/missing-file', 'Downloaded audio file was missing.', {
    reciterId,
    surahNumber
  })
  events.emit('libraryChanged')
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

function getQueuedItem(reciterId: string, surah: number): { id: string; priority: number } | null {
  const row = getDb()
    .prepare('SELECT id, priority FROM download_queue WHERE reciter_id = ? AND surah_number = ?')
    .get(reciterId, surah) as { id: string; priority: number } | undefined
  return row ?? null
}

export function enqueueSurah(
  reciterId: string,
  surah: number,
  options?: { priority?: boolean }
): void {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return
  if (isAlreadyDownloaded(reciterId, surah)) return
  const existing = getQueuedItem(reciterId, surah)
  if (existing) {
    if (options?.priority && existing.priority === 0) {
      getDb().prepare('UPDATE download_queue SET priority = 1 WHERE id = ?').run(existing.id)
      tryStartNext()
    }
    return
  }

  const id = `${reciterId}:${surah}`
  const priority = options?.priority ? 1 : 0
  getDb()
    .prepare(
      `INSERT INTO download_queue (id, reciter_id, surah_number, status, created_at, priority)
       VALUES (?, ?, ?, 'queued', ?, ?)`
    )
    .run(id, reciterId, surah, Date.now(), priority)

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
  if (!m) throwAppError('catalog/not-loaded', CATALOG_NOT_LOADED_MSG)
  if (!m.reciters.some((r) => r.id === reciterId)) {
    throwAppError('catalog/unknown-reciter', "That reciter isn't available anymore.", reciterId)
  }

  // Bulk-insert anything not already downloaded or queued. Transaction keeps
  // it atomic and quick for 114 rows.
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO download_queue
     (id, reciter_id, surah_number, status, created_at, priority)
     VALUES (?, ?, ?, 'queued', ?, 0)`
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
    if (!getQueuedItem(reciterId, n)) continue // race-safety
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
  events.emit('libraryChanged')
}

export async function deleteSurah(reciterId: string, surah: number): Promise<void> {
  const key = `${reciterId}:${surah}`
  activeJobs.get(key)?.abort()
  getDb()
    .prepare('DELETE FROM download_queue WHERE reciter_id = ? AND surah_number = ?')
    .run(reciterId, surah)
  await waitForJobs((jobKey) => jobKey === key)

  const final = audioFilePath(reciterId, surah)
  if (final) {
    await removeFileIfPresent(`${final}.partial`)
    await removeFileIfPresent(final)
  }
  getDb()
    .prepare('DELETE FROM downloads WHERE reciter_id = ? AND surah_number = ?')
    .run(reciterId, surah)
  emitProgress({
    reciterId,
    surahNumber: surah,
    status: 'not_downloaded',
    progressBytes: 0,
    totalBytes: 0
  })
  events.emit('libraryChanged')
}

export async function deleteReciter(reciterId: string): Promise<void> {
  // Cancel every active job for this reciter.
  for (const [key, controller] of [...activeJobs.entries()]) {
    if (key.startsWith(`${reciterId}:`)) controller.abort()
  }

  getDb().prepare('DELETE FROM download_queue WHERE reciter_id = ?').run(reciterId)
  await waitForJobs((key) => key.startsWith(`${reciterId}:`))

  const sampleFinal = audioFilePath(reciterId, 1)
  if (sampleFinal) {
    const folder = dirname(sampleFinal)
    await fsp.rm(folder, { recursive: true, force: true })
  }
  getDb().prepare('DELETE FROM downloads WHERE reciter_id = ?').run(reciterId)

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
  events.emit('libraryChanged')
}

export async function deleteAllDownloads(): Promise<void> {
  const affected = getDb()
    .prepare(
      `SELECT reciter_id, surah_number FROM downloads
       UNION
       SELECT reciter_id, surah_number FROM download_queue`
    )
    .all() as Array<{ reciter_id: string; surah_number: number }>

  for (const controller of activeJobs.values()) controller.abort()
  getDb().prepare('DELETE FROM download_queue').run()
  await waitForJobs(() => true)

  const root = getAudioRoot()
  await fsp.rm(root, { recursive: true, force: true })
  await fsp.mkdir(root, { recursive: true })
  getDb().prepare('DELETE FROM downloads').run()

  for (const row of affected) {
    emitProgress({
      reciterId: row.reciter_id,
      surahNumber: row.surah_number,
      status: 'not_downloaded',
      progressBytes: 0,
      totalBytes: 0
    })
  }
  events.emit('libraryChanged')
}

// ---------------------------------------------------------------------------
// Queue introspection
// ---------------------------------------------------------------------------

export function getActiveQueue(): QueueEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM download_queue ORDER BY priority DESC, created_at ASC')
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
    createdAt: r.created_at
  }
}

// ---------------------------------------------------------------------------
// Boot recovery
// ---------------------------------------------------------------------------

export function recoverFromCrash(): void {
  if (recovered) return
  recovered = true
  // Anything still marked 'active' is leftover from a crash. Legacy paused
  // rows are normalized by the DB migration before the downloader starts.
  getDb().exec(`UPDATE download_queue SET status = 'queued' WHERE status = 'active'`)
  tryStartNext()
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

function tryStartNext(): void {
  while (activeCount < MAX_CONCURRENT) {
    const next = getDb()
      .prepare(
        `SELECT * FROM download_queue
         WHERE status = 'queued'
         ORDER BY priority DESC, created_at ASC
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
    const downloadedBytes = await downloadWithRetries(row, controller.signal)
    if (controller.signal.aborted) throw makeAbort()
    await finalizeSuccess(row, downloadedBytes, controller.signal)
    emitCompleted(row.reciter_id, row.surah_number)
  } catch (e) {
    if (isAbort(e)) {
      // Cancelled — queue row was deleted by cancelSurah; just leave.
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    log.error(`[download/failed] ${row.reciter_id}/${row.surah_number}`, e)
    recordDiagnostic('download/failed', e, {
      reciterId: row.reciter_id,
      surahNumber: row.surah_number
    })
    // If queue row still exists, mark failed.
    const stillThere = getDb().prepare('SELECT 1 FROM download_queue WHERE id = ?').get(row.id)
    if (stillThere) {
      getDb()
        .prepare(
          `UPDATE download_queue
           SET status = 'failed', progress_bytes = 0, total_bytes = 0, error = ?
           WHERE id = ?`
        )
        .run(msg, row.id)
      emitProgress({
        reciterId: row.reciter_id,
        surahNumber: row.surah_number,
        status: 'failed',
        progressBytes: 0,
        totalBytes: 0
      })
    }
  } finally {
    activeJobs.delete(key)
  }
}

async function finalizeSuccess(
  row: QueueRow,
  expectedBytes: number,
  signal: AbortSignal
): Promise<void> {
  // The DB trigger removes the corresponding queue row after this insert.
  const final = audioFilePath(row.reciter_id, row.surah_number)
  if (!final) throw new DownloadError(DOWNLOAD_FAILED_MSG, false)
  // Verify the promoted final file immediately before recording completion.
  let stat: Awaited<ReturnType<typeof fsp.stat>>
  try {
    stat = await fsp.stat(final)
  } catch (error) {
    // File missing — treat as failure path.
    throw new DownloadError(DOWNLOAD_FAILED_MSG, false, undefined, { cause: error })
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size !== expectedBytes) {
    await fsp.unlink(final).catch(() => undefined)
    throw new DownloadError(DOWNLOAD_FAILED_MSG, false)
  }
  if (signal.aborted) throw makeAbort()
  const tx = getDb().transaction(() => {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO downloads (reciter_id, surah_number, file_path, size_bytes, downloaded_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(row.reciter_id, row.surah_number, final, stat.size, Date.now())
  })
  tx()
}

async function downloadWithRetries(row: QueueRow, signal: AbortSignal): Promise<number> {
  let attempt = 0
  while (true) {
    try {
      return await streamDownload(row, signal)
    } catch (e) {
      if (isAbort(e)) throw e
      const error = classifyError(e)
      if (!error.transient) throw error
      const delay =
        error.retryAfterMs ?? BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)]
      markRetrying(row)
      log.warn(`[download/retry] ${row.reciter_id}/${row.surah_number} in ${delay}ms`, error)
      recordDiagnostic('download/retry', error, {
        reciterId: row.reciter_id,
        surahNumber: row.surah_number,
        delayMs: delay
      })
      await sleep(Math.min(delay, MAX_BACKOFF_MS), signal)
      markActive(row)
      attempt++
    }
  }
}

async function streamDownload(row: QueueRow, signal: AbortSignal): Promise<number> {
  const m = manifest.getCachedManifest()
  if (!m) throwAppError('catalog/not-loaded', CATALOG_NOT_LOADED_MSG)
  const url = `${m.audio_base_url}/${row.reciter_id}/${String(row.surah_number).padStart(3, '0')}.mp3`
  const final = audioFilePath(row.reciter_id, row.surah_number)
  if (!final) {
    throwAppError(
      'download/path-invalid',
      "Couldn't save the download to disk.",
      `${row.reciter_id}/${row.surah_number}`
    )
  }
  const partial = `${final}.partial`

  await fsp.mkdir(dirname(final), { recursive: true })

  const resp = await fetchWithTimeout(url, signal)
  if (!resp.ok) {
    const transient = resp.status === 408 || resp.status === 429 || resp.status >= 500
    const retryAfterMs = transient ? parseRetryAfter(resp.headers.get('retry-after')) : undefined
    appError(
      'download/http-failed',
      DOWNLOAD_FAILED_MSG,
      `HTTP ${resp.status} ${resp.statusText} fetching ${url}`
    )
    throw new DownloadError(DOWNLOAD_FAILED_MSG, transient, retryAfterMs)
  }
  if (!resp.body) {
    appError('download/empty-body', DOWNLOAD_FAILED_MSG, `empty body from ${url}`)
    throw new DownloadError(DOWNLOAD_FAILED_MSG, true)
  }

  const totalHeader = resp.headers.get('content-length')
  const totalBytes = totalHeader ? Number(totalHeader) : 0
  if (!Number.isFinite(totalBytes) || totalBytes < 0) {
    throw new DownloadError(DOWNLOAD_FAILED_MSG, true)
  }
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
  const streamController = linkedController(signal)
  let streamTimedOut = false
  let inactivityTimer = setTimeout(() => {
    streamTimedOut = true
    streamController.abort()
  }, STREAM_INACTIVITY_TIMEOUT_MS)

  source.on('data', (chunk: Buffer) => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => {
      streamTimedOut = true
      streamController.abort()
    }, STREAM_INACTIVITY_TIMEOUT_MS)
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
    await pipeline(source, writeStream, { signal: streamController.signal })
  } catch (e) {
    // Best-effort cleanup of the partial file if pipeline errored.
    await fsp.unlink(partial).catch(() => undefined)
    if (signal.aborted) throw makeAbort()
    if (streamTimedOut) throw new DownloadError(DOWNLOAD_FAILED_MSG, true, undefined, { cause: e })
    throw classifyError(e)
  } finally {
    clearTimeout(inactivityTimer)
    streamController.dispose()
  }

  if (downloaded <= 0 || (totalBytes > 0 && downloaded !== totalBytes)) {
    await fsp.unlink(partial).catch(() => undefined)
    throw new DownloadError(DOWNLOAD_FAILED_MSG, true)
  }
  const partialStat = await fsp.stat(partial).catch((error) => {
    throw new DownloadError(DOWNLOAD_FAILED_MSG, false, undefined, { cause: error })
  })
  if (!partialStat.isFile() || partialStat.size !== downloaded) {
    await fsp.unlink(partial).catch(() => undefined)
    throw new DownloadError(DOWNLOAD_FAILED_MSG, true)
  }

  try {
    await fsp.rename(partial, final)
  } catch (error) {
    await fsp.unlink(partial).catch(() => undefined)
    throw new DownloadError(DOWNLOAD_FAILED_MSG, false, undefined, { cause: error })
  }

  // Final progress emit so the UI moves to 100% before download:completed lands.
  emitProgress({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'active',
    progressBytes: downloaded || totalBytes,
    totalBytes
  })
  return downloaded
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function markRetrying(row: QueueRow): void {
  getDb()
    .prepare(
      `UPDATE download_queue
       SET status = 'active', progress_bytes = 0, total_bytes = 0, error = NULL
       WHERE id = ?`
    )
    .run(row.id)
  emitProgress({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'active',
    progressBytes: 0,
    totalBytes: 0
  })
}

async function waitForJobs(matches: (key: string) => boolean): Promise<void> {
  while ([...activeJobs.keys()].some(matches)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function removeFileIfPresent(path: string): Promise<void> {
  try {
    await fsp.unlink(path)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

function markActive(row: QueueRow): void {
  getDb().prepare(`UPDATE download_queue SET status = 'active' WHERE id = ?`).run(row.id)
  emitProgress({
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    status: 'active',
    progressBytes: 0,
    totalBytes: 0
  })
}

async function fetchWithTimeout(url: string, signal: AbortSignal): Promise<Response> {
  const request = linkedController(signal)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    request.abort()
  }, REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: request.signal })
  } catch (error) {
    if (signal.aborted) throw makeAbort()
    if (timedOut) throw new DownloadError(DOWNLOAD_FAILED_MSG, true, undefined, { cause: error })
    throw classifyError(error)
  } finally {
    clearTimeout(timer)
    request.dispose()
  }
}

function linkedController(parent: AbortSignal): AbortController & { dispose: () => void } {
  const controller = new AbortController() as AbortController & { dispose: () => void }
  const abort = (): void => controller.abort()
  if (parent.aborted) controller.abort()
  else parent.addEventListener('abort', abort, { once: true })
  controller.dispose = () => parent.removeEventListener('abort', abort)
  return controller
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()
  if (!Number.isFinite(delay)) return undefined
  return Math.max(0, Math.min(delay, MAX_BACKOFF_MS))
}

function classifyError(error: unknown): DownloadError {
  if (error instanceof DownloadError) return error
  if (isAbort(error)) {
    return new DownloadError(DOWNLOAD_FAILED_MSG, true, undefined, { cause: error })
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (code === 'download/path-invalid') {
      return new DownloadError(DOWNLOAD_FAILED_MSG, false, undefined, { cause: error })
    }
    if (
      [
        'EACCES',
        'EPERM',
        'ENOSPC',
        'EROFS',
        'ENOENT',
        'EISDIR',
        'EMFILE',
        'ENFILE',
        'ENAMETOOLONG'
      ].includes(code)
    ) {
      return new DownloadError(DOWNLOAD_FAILED_MSG, false, undefined, { cause: error })
    }
  }
  return new DownloadError(DOWNLOAD_FAILED_MSG, true, undefined, {
    cause: error instanceof Error ? error : undefined
  })
}

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
    (e instanceof DOMException && (e.name === 'AbortError' || e.code === DOMException.ABORT_ERR)) ||
    (e instanceof Error && e.name === 'AbortError')
  )
}
