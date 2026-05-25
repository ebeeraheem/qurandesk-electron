import { app } from 'electron'
import { promises as fsp, createWriteStream } from 'node:fs'
import { join, resolve as resolvePath, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as manifest from './manifest'

/**
 * Persistent on-disk cache for reciter photos so the catalog renders the
 * real avatars even when the user is offline.
 *
 * Two paths fill the cache:
 *  1. `precacheAll()` runs in the background after every manifest load /
 *     refresh, fetching every photo that isn't already on disk.
 *  2. The `app://photo/<filename>?from=<url>` protocol handler does a
 *     synchronous fetch as a fallback for any photo the renderer asks for
 *     that the pre-cache hasn't covered yet (e.g. user opened the app while
 *     the pre-cache was still mid-flight).
 *
 * Source validation: `from` URLs must be HTTPS and live on the same host as
 * the manifest's `audio_base_url`. Stops this protocol from being used as an
 * open-proxy to arbitrary URLs.
 */

const SAFE_RECITER_ID = /^[a-z0-9-]+$/
const SAFE_EXT = /^(jpg|jpeg|png|webp|avif|gif)$/
const SAFE_PHOTO_FILE = /^([a-z0-9-]+)\.([a-z0-9]+)$/

let photoRoot = ''
/** Dedupes concurrent downloads of the same file. */
const inflight = new Map<string, Promise<boolean>>()

export function getPhotoRoot(): string {
  return photoRoot
}

/** Compute + ensure the photos dir. Call after `app` is ready. */
export async function initPhotoRoot(): Promise<string> {
  photoRoot = resolvePath(join(app.getPath('userData'), 'photos'))
  await fsp.mkdir(photoRoot, { recursive: true })
  return photoRoot
}

/** Resolved path inside the photo root, or null if the input is unsafe. */
export function photoFilePath(filename: string): string | null {
  const m = SAFE_PHOTO_FILE.exec(filename)
  if (!m) return null
  if (!SAFE_EXT.test(m[2].toLowerCase())) return null
  const resolved = resolvePath(join(photoRoot, filename))
  // Path-traversal guard mirrored from the audio protocol.
  if (resolved !== photoRoot && !resolved.startsWith(photoRoot + sep)) return null
  return resolved
}

/** Compute the cache filename for a reciter based on their photo URL extension. */
export function cacheFilenameForReciter(
  reciterId: string,
  photoUrl: string
): string | null {
  if (!SAFE_RECITER_ID.test(reciterId)) return null
  let pathname: string
  try {
    pathname = new URL(photoUrl).pathname
  } catch {
    return null
  }
  const m = /\.([a-z0-9]+)$/i.exec(pathname)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (!SAFE_EXT.test(ext)) return null
  return `${reciterId}.${ext}`
}

function isAllowedSource(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const m = manifest.getCachedManifest()
  if (!m) return false
  try {
    const expectedHost = new URL(m.audio_base_url).hostname
    return u.hostname === expectedHost
  } catch {
    return false
  }
}

/** Returns true if the photo is on disk (or just got cached). */
export async function ensurePhotoCached(
  filename: string,
  sourceUrl: string
): Promise<boolean> {
  const dest = photoFilePath(filename)
  if (!dest) return false

  // Already cached?
  try {
    const stat = await fsp.stat(dest)
    if (stat.isFile() && stat.size > 0) return true
  } catch {
    /* not cached */
  }

  if (!isAllowedSource(sourceUrl)) return false

  // Dedupe concurrent requests for the same file.
  const existing = inflight.get(filename)
  if (existing) return existing

  const job = downloadOnce(sourceUrl, dest)
  inflight.set(filename, job)
  try {
    return await job
  } finally {
    inflight.delete(filename)
  }
}

async function downloadOnce(url: string, dest: string): Promise<boolean> {
  const partial = `${dest}.partial`
  try {
    const resp = await fetch(url)
    if (!resp.ok || !resp.body) return false
    await pipeline(
      Readable.fromWeb(
        resp.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>
      ),
      createWriteStream(partial)
    )
    await fsp.rename(partial, dest)
    return true
  } catch {
    await fsp.unlink(partial).catch(() => undefined)
    return false
  }
}

/**
 * Background pre-cache for every reciter in the loaded manifest. Idempotent:
 * already-cached files are skipped via the existence check in
 * `ensurePhotoCached`.
 */
export async function precacheAll(): Promise<void> {
  const m = manifest.getCachedManifest()
  if (!m) return
  await Promise.allSettled(
    m.reciters
      .filter((r) => !!r.photo_url)
      .map(async (r) => {
        const filename = cacheFilenameForReciter(r.id, r.photo_url!)
        if (!filename) return
        await ensurePhotoCached(filename, r.photo_url!)
      })
  )
}
