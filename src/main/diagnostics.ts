import { dialog } from 'electron'
import { promises as fsp } from 'node:fs'

type DiagnosticValue = null | boolean | number | string | DiagnosticValue[] | DiagnosticObject
type DiagnosticObject = { [key: string]: DiagnosticValue }

export type DiagnosticEntry = {
  timestamp: string
  operation: string
  error: DiagnosticValue
  context?: DiagnosticValue
}

const MAX_ENTRIES = 50
const MAX_ENTRY_BYTES = 8 * 1024
const MAX_TOTAL_BYTES = 128 * 1024
const MAX_STRING_LENGTH = 1_000
const MAX_DEPTH = 5
const SENSITIVE_KEY =
  /(?:^|[_-])(?:authorization|cookie|credential|credentials|password|secret|token|api[_-]?key|url|uri|path|directory|dir|file)(?:$|[_-])|(?:Url|Uri|Path|Directory|Dir|File)$/i
const URL_RX = /\b(?:https?|ftp):\/\/[^\s"'<>]+/gi
const WINDOWS_PATH_RX = /\b[A-Za-z]:\\[^\r\n]+/g
const UNC_PATH_RX = /\\\\[^\\\s]+\\[^\s]+/g
const UNIX_PATH_RX = /(?:^|[\s("'`])\/(?:Users|home|var|tmp|opt|mnt|Volumes)\/[^\s"'`)]+/g
const CREDENTIAL_RX = /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi
const SECRET_ASSIGNMENT_RX =
  /\b(?:token|secret|password|api[_-]?key|credential)s?\s*[:=]\s*[^\s,;]+/gi

const entries: DiagnosticEntry[] = []

function sanitizeString(value: string): string {
  return value
    .replace(URL_RX, '[redacted-url]')
    .replace(WINDOWS_PATH_RX, '[redacted-path]')
    .replace(UNC_PATH_RX, '[redacted-path]')
    .replace(UNIX_PATH_RX, (match) => `${match[0]}[redacted-path]`)
    .replace(CREDENTIAL_RX, '[redacted-credential]')
    .replace(SECRET_ASSIGNMENT_RX, '[redacted-secret]')
    .slice(0, MAX_STRING_LENGTH)
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth = 0): DiagnosticValue {
  if (depth > MAX_DEPTH) return '[truncated]'
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return sanitizeString(String(value))
  }
  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name),
      message: sanitizeString(value.message),
      ...(value.stack ? { stack: sanitizeString(value.stack) } : {})
    }
  }
  if (!value || typeof value !== 'object') return sanitizeString(String(value))
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, seen, depth + 1))
  }
  const result: DiagnosticObject = {}
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeValue(item, seen, depth + 1)
  }
  return result
}

export function sanitizeDiagnostic(value: unknown): DiagnosticValue {
  try {
    return sanitizeValue(value, new WeakSet())
  } catch {
    return '[unavailable]'
  }
}

export function recordDiagnostic(operation: string, error: unknown, context?: unknown): void {
  try {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      operation: sanitizeString(operation || 'unknown').slice(0, 120),
      error: sanitizeDiagnostic(error),
      ...(context === undefined ? {} : { context: sanitizeDiagnostic(context) })
    }
    if (Buffer.byteLength(JSON.stringify(entry), 'utf8') > MAX_ENTRY_BYTES) {
      entry.error = '[truncated: diagnostic entry exceeded size limit]'
      delete entry.context
    }
    entries.push(entry)
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
    while (
      entries.length > 0 &&
      Buffer.byteLength(JSON.stringify(entries), 'utf8') > MAX_TOTAL_BYTES
    ) {
      entries.shift()
    }
  } catch {
    // Diagnostics must never affect the operation being diagnosed.
  }
}

export function getRecentDiagnostics(): DiagnosticEntry[] {
  return entries.map((entry) => ({ ...entry }))
}

export async function exportDiagnostics(report: unknown): Promise<{ saved: boolean }> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const result = await dialog.showSaveDialog({
      title: 'Export QuranDesk diagnostics',
      defaultPath: `QuranDesk-diagnostics-${timestamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await fsp.writeFile(
      result.filePath,
      JSON.stringify(sanitizeDiagnostic(report), null, 2),
      'utf8'
    )
    return { saved: true }
  } catch (error) {
    recordDiagnostic('diagnostics/export', error)
    return { saved: false }
  }
}
