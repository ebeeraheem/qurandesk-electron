import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

/**
 * Owns the remote reciter catalog: fetch, validate, persist, expose.
 *
 * The manifest lives at `MAIN_VITE_MANIFEST_URL` (set in `.env`) and is cached
 * to `<userData>/manifest.cache.json` so the catalog is available offline on
 * subsequent launches.
 *
 * Validation is intentionally tolerant of optional fields and strict about
 * `schema_version` — an unknown major version is refused with a user-friendly
 * error string so the UI can surface "Update the app to load this catalog."
 */

export type RemoteReciter = {
  id: string
  name: string
  photo_url?: string
  total_size_bytes?: number
  style?: string
}

export type RemoteManifest = {
  schema_version: number
  updated_at: string
  audio_base_url: string
  reciters: RemoteReciter[]
}

export type ManifestStatus = {
  cachedAt: number | null
  lastError: string | null
  fetching: boolean
}

const SUPPORTED_SCHEMA = 1
const SAFE_RECITER_ID = /^[a-z0-9-]+$/

const events = new EventEmitter()
let cached: RemoteManifest | null = null
let cachedAt: number | null = null
let lastError: string | null = null
let fetching = false
let cacheFilePath = ''

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

function validate(payload: unknown): RemoteManifest {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Manifest payload is not an object')
  }
  const m = payload as Record<string, unknown>

  if (typeof m.schema_version !== 'number') {
    throw new Error('Manifest is missing `schema_version`')
  }
  if (m.schema_version !== SUPPORTED_SCHEMA) {
    throw new Error(
      `Unsupported manifest schema_version ${m.schema_version}. This app supports v${SUPPORTED_SCHEMA}. Update QuranDesk to load this catalog.`
    )
  }
  if (typeof m.updated_at !== 'string') {
    throw new Error('Manifest is missing `updated_at`')
  }
  if (typeof m.audio_base_url !== 'string' || !m.audio_base_url.trim()) {
    throw new Error('Manifest is missing `audio_base_url`')
  }
  if (!Array.isArray(m.reciters)) {
    throw new Error('Manifest `reciters` is not an array')
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
          : undefined,
      style: typeof r.style === 'string' ? r.style : undefined
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
  { ok: true; updatedAt: string } | { ok: false; error: string }
> {
  const url = manifestUrl()
  if (!url) {
    lastError = 'Manifest URL is not configured. Set MAIN_VITE_MANIFEST_URL in .env.'
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
      throw new Error(`HTTP ${resp.status} ${resp.statusText} while fetching manifest`)
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
    lastError = e instanceof Error ? e.message : String(e)
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
