import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type { AppError } from '../shared/api'
import { appError, isAppError } from './errors'

/**
 * Owns the remote reciter catalog: fetch, validate, persist, expose.
 *
 * The manifest lives at `MAIN_VITE_MANIFEST_URL` (set in `.env`) and is cached
 * to `<userData>/manifest.cache.json` so the catalog is available offline on
 * subsequent launches.
 *
 * Validation is intentionally tolerant of optional fields and strict about
 * `schema_version` — an unknown major version is refused as an AppError so the
 * UI can surface "This catalog is newer than your version of QuranDesk." The
 * raw schema mismatch lands in the log file via `appError`.
 */

export type RemoteReciter = {
  id: string
  name: string
  photo_url?: string
  total_size_bytes?: number
}

export type RemoteManifest = {
  schema_version: number
  updated_at: string
  audio_base_url: string
  reciters: RemoteReciter[]
}

export type ManifestStatus = {
  cachedAt: number | null
  lastError: AppError | null
  fetching: boolean
}

const SUPPORTED_SCHEMA = 1
const SAFE_RECITER_ID = /^[a-z0-9-]+$/

const events = new EventEmitter()
let cached: RemoteManifest | null = null
let cachedAt: number | null = null
let lastError: AppError | null = null
let fetching = false
let cacheFilePath = ''

const INVALID_USER_MSG =
  'The catalog data looks corrupted. Please update QuranDesk or try again later.'

function cacheFile(): string {
  if (!cacheFilePath) {
    cacheFilePath = join(app.getPath('userData'), 'manifest.cache.json')
  }
  return cacheFilePath
}

function manifestUrl(): string | null {
  // electron-vite exposes MAIN_VITE_* env vars to the main bundle via
  // import.meta.env. Empty / unset → null so callers can show a friendly error.
  const url = import.meta.env.MAIN_VITE_MANIFEST_URL as string | undefined
  return url && url.trim() ? url.trim() : null
}

function invalid(detail: string): never {
  throw Object.assign(
    new Error(INVALID_USER_MSG),
    appError('manifest/invalid', INVALID_USER_MSG, detail)
  )
}

function validate(payload: unknown): RemoteManifest {
  if (!payload || typeof payload !== 'object') {
    invalid('payload is not an object')
  }
  const m = payload as Record<string, unknown>

  if (typeof m.schema_version !== 'number') {
    invalid('missing schema_version')
  }
  if (m.schema_version !== SUPPORTED_SCHEMA) {
    const userMessage =
      'This catalog is newer than your version of QuranDesk. Please update the app.'
    throw Object.assign(
      new Error(userMessage),
      appError(
        'manifest/unsupported-version',
        userMessage,
        `saw v${m.schema_version}, app supports v${SUPPORTED_SCHEMA}`
      )
    )
  }
  if (typeof m.updated_at !== 'string') {
    invalid('missing updated_at')
  }
  if (typeof m.audio_base_url !== 'string' || !m.audio_base_url.trim()) {
    invalid('missing audio_base_url')
  }
  if (!Array.isArray(m.reciters)) {
    invalid('reciters is not an array')
  }

  // Permissive on individual entries: skip malformed reciters rather than
  // failing the whole load. The catalog is more useful partial than absent.
  const reciters: RemoteReciter[] = []
  for (const raw of m.reciters as unknown[]) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !SAFE_RECITER_ID.test(r.id)) continue
    if (typeof r.name !== 'string' || !r.name.trim()) continue
    reciters.push({
      id: r.id,
      name: r.name.trim(),
      photo_url: typeof r.photo_url === 'string' ? r.photo_url : undefined,
      total_size_bytes:
        typeof r.total_size_bytes === 'number' && Number.isFinite(r.total_size_bytes)
          ? r.total_size_bytes
          : undefined
    })
  }

  return {
    schema_version: m.schema_version,
    updated_at: m.updated_at,
    audio_base_url: m.audio_base_url.trim().replace(/\/+$/, ''),
    reciters
  }
}

/** Load any previously-persisted manifest from disk. Idempotent. */
export async function loadCache(): Promise<boolean> {
  try {
    const text = await fsp.readFile(cacheFile(), 'utf8')
    const wrapper = JSON.parse(text) as { payload: unknown; fetchedAt: number }
    cached = validate(wrapper.payload)
    cachedAt = typeof wrapper.fetchedAt === 'number' ? wrapper.fetchedAt : null
    lastError = null
    return true
  } catch {
    // No cache yet, or it's corrupt — treat as a clean slate. The next refresh
    // will populate it.
    return false
  }
}

/** Fetch from network, validate, persist, broadcast `manifest:updated`. */
export async function refresh(): Promise<
  { ok: true; updatedAt: string } | { ok: false; error: AppError }
> {
  const url = manifestUrl()
  if (!url) {
    lastError = appError(
      'manifest/not-configured',
      "QuranDesk isn't fully set up: the catalog server isn't configured. Please reinstall or contact support.",
      'MAIN_VITE_MANIFEST_URL is unset at build time'
    )
    events.emit('updated')
    return { ok: false, error: lastError }
  }

  fetching = true
  events.emit('updated')

  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Bypass any HTTP caching for refreshes — we have our own on-disk cache.
      cache: 'no-store'
    })
    if (!resp.ok) {
      throw Object.assign(
        new Error("Couldn't reach the catalog. Check your internet connection and try again."),
        appError(
          'manifest/fetch-failed',
          "Couldn't reach the catalog. Check your internet connection and try again.",
          `HTTP ${resp.status} ${resp.statusText} while fetching ${url}`
        )
      )
    }
    const payload = (await resp.json()) as unknown
    const validated = validate(payload)
    const now = Date.now()
    await fsp.writeFile(
      cacheFile(),
      JSON.stringify({ payload: validated, fetchedAt: now }, null, 2),
      'utf8'
    )
    cached = validated
    cachedAt = now
    lastError = null
    fetching = false
    events.emit('updated')
    return { ok: true, updatedAt: validated.updated_at }
  } catch (e) {
    // Errors thrown from validate/fetch-not-ok above carry AppError fields on
    // the Error object — copy them into a plain object so IPC structured-clone
    // serializes cleanly. Anything else (network / JSON parse) is wrapped as a
    // generic fetch-failed.
    lastError = isAppError(e)
      ? { code: e.code, userMessage: e.userMessage }
      : appError(
          'manifest/fetch-failed',
          "Couldn't reach the catalog. Check your internet connection and try again.",
          e
        )
    fetching = false
    events.emit('updated')
    return { ok: false, error: lastError }
  }
}

export function getCachedManifest(): RemoteManifest | null {
  return cached
}

export function getStatus(): ManifestStatus {
  return { cachedAt, lastError, fetching }
}

/** Subscribe to manifest changes. Returns an unsubscribe function. */
export function onUpdated(cb: () => void): () => void {
  events.on('updated', cb)
  return () => {
    events.off('updated', cb)
  }
}
