import { app, protocol } from 'electron'
import { promises as fsp, createReadStream } from 'node:fs'
import { join, resolve as resolvePath, sep } from 'node:path'
import { Readable } from 'node:stream'

/**
 * Custom protocol that serves downloaded surah audio from disk.
 *
 * URL shape: `app://audio/<reciter-id>/<NNN>.mp3`
 *
 * Why this exists: HTML5 `<audio>` plays best from URLs that support HTTP
 * Range requests (so seeking works without re-downloading from byte 0).
 * Loading from `file://` does not — Electron blocks it from the renderer
 * anyway under contextIsolation. A custom scheme lets us serve from disk
 * with full Range semantics while keeping a single security boundary at the
 * audio root.
 */

export const APP_SCHEME = 'app'

/** Reciter-id allowlist — matches the IPC validation rule in §8 of the spec. */
const SAFE_RECITER_ID = /^[a-z0-9-]+$/

/** `bytes=START-END`, `bytes=START-`, `bytes=-SUFFIX` */
const RANGE_RX = /^bytes=(\d*)-(\d*)$/i

let audioRoot = ''

export function getAudioRoot(): string {
  return audioRoot
}

/**
 * Register the `app:` scheme as privileged. Must run BEFORE `app.whenReady()`
 * so that Chromium treats responses as standard HTTP-like resources (and so
 * that Range requests are forwarded to our handler at all).
 */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/** Compute + ensure the audio root. Safe to call once `app` is ready. */
export async function initAudioRoot(): Promise<string> {
  audioRoot = resolvePath(join(app.getPath('userData'), 'audio'))
  await fsp.mkdir(audioRoot, { recursive: true })
  return audioRoot
}

/** Build the disk path for a surah file, or null if the inputs are invalid. */
export function audioFilePath(reciterId: string, surah: number): string | null {
  if (!SAFE_RECITER_ID.test(reciterId)) return null
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null

  const filename = `${String(surah).padStart(3, '0')}.mp3`
  const resolved = resolvePath(join(audioRoot, reciterId, filename))

  // Path-traversal guard: the resolved absolute path must live inside the
  // audio root. Compare with a trailing separator to avoid prefix collisions
  // like `/audio` matching `/audio-other/...`.
  if (resolved !== audioRoot && !resolved.startsWith(audioRoot + sep)) return null

  return resolved
}

/** Returns the file path only if it actually exists on disk; null otherwise. */
export async function audioFileIfExists(
  reciterId: string,
  surah: number
): Promise<string | null> {
  const p = audioFilePath(reciterId, surah)
  if (!p) return null
  try {
    const stat = await fsp.stat(p)
    return stat.isFile() ? p : null
  } catch {
    return null
  }
}

/** Build the renderer-facing URL for a surah. Does not check existence. */
export function audioUrl(reciterId: string, surah: number): string {
  return `${APP_SCHEME}://audio/${reciterId}/${String(surah).padStart(3, '0')}.mp3`
}

/** Register the handler. Call AFTER both `app.whenReady()` and `initAudioRoot()`. */
export function registerHandler(): void {
  protocol.handle(APP_SCHEME, handleRequest)
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // We only serve `app://audio/...` for now. Future hosts (e.g. `app://icons/...`)
  // can be added here without changing the validation logic for audio.
  if (url.host !== 'audio') return new Response('Not Found', { status: 404 })

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return new Response('Bad Request', { status: 400 })

  const [reciterId, filename] = parts
  const m = /^(\d{3})\.mp3$/.exec(filename)
  if (!m) return new Response('Bad Request', { status: 400 })

  const surah = parseInt(m[1], 10)
  const filePath = audioFilePath(reciterId, surah)
  if (!filePath) return new Response('Bad Request', { status: 400 })

  let stat: Awaited<ReturnType<typeof fsp.stat>>
  try {
    stat = await fsp.stat(filePath)
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  if (!stat.isFile()) return new Response('Not Found', { status: 404 })

  const size = stat.size
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  }

  // HEAD — let the browser learn size + ranges without a body. <audio> issues
  // these occasionally before deciding what byte range to request.
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  }

  const rangeHeader = request.headers.get('range')

  if (!rangeHeader) {
    return new Response(toWebStream(createReadStream(filePath)), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  }

  const r = RANGE_RX.exec(rangeHeader.trim())
  if (!r) return rangeNotSatisfiable(size)

  let start: number
  let end: number

  if (r[1] === '' && r[2] !== '') {
    // Suffix range — last N bytes.
    const suffix = parseInt(r[2], 10)
    if (suffix === 0) return rangeNotSatisfiable(size)
    start = Math.max(0, size - suffix)
    end = size - 1
  } else if (r[1] !== '') {
    start = parseInt(r[1], 10)
    end = r[2] !== '' ? parseInt(r[2], 10) : size - 1
  } else {
    return rangeNotSatisfiable(size)
  }

  // Clamp end to last byte. Some clients send `bytes=0-` expecting the server
  // to clamp; some send a fixed range past EOF when re-seeking after a tab
  // restore. RFC 7233 says clamp rather than reject when end > size-1.
  if (end >= size) end = size - 1
  if (start > end || start < 0 || start >= size) return rangeNotSatisfiable(size)

  const chunkSize = end - start + 1
  return new Response(toWebStream(createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${size}`
    }
  })
}

function rangeNotSatisfiable(size: number): Response {
  return new Response('Range Not Satisfiable', {
    status: 416,
    headers: { 'Content-Range': `bytes */${size}` }
  })
}

function toWebStream(node: Readable): ReadableStream {
  // Node's typing returns its own ReadableStream<unknown>; Response expects the
  // global (WHATWG) one. The runtime objects are spec-compatible.
  return Readable.toWeb(node) as unknown as ReadableStream
}
