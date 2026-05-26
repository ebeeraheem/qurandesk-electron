import { DEFAULT_SETTINGS, type Settings } from '../shared/api'
import { getDb } from './db'

/**
 * Flat KV-backed settings. Values are JSON-encoded in a single `settings`
 * table so adding a new field is a no-op migration. Reads fall back to
 * `DEFAULT_SETTINGS` for any key that hasn't been written yet, which means
 * brand-new installs and code that ships a new setting both Just Work.
 */

const VALID_THEME = new Set(['system', 'light', 'dark'])
const VALID_SPEED = new Set([0.75, 1.0, 1.25, 1.5])
const VALID_MODE = new Set(['stop', 'download-then-play'])
const VALID_REPEAT = new Set(['off', 'one'])

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  const stored: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value)
    } catch {
      // Corrupt row — ignore; defaults will fill it in next write.
    }
  }
  // Merge over defaults with type-narrowed lookups so a stale field can't
  // poison the type contract.
  return {
    theme: VALID_THEME.has(stored.theme as string)
      ? (stored.theme as Settings['theme'])
      : DEFAULT_SETTINGS.theme,
    defaultPlaybackSpeed: VALID_SPEED.has(stored.defaultPlaybackSpeed as number)
      ? (stored.defaultPlaybackSpeed as Settings['defaultPlaybackSpeed'])
      : DEFAULT_SETTINGS.defaultPlaybackSpeed,
    repeatMode: VALID_REPEAT.has(stored.repeatMode as string)
      ? (stored.repeatMode as Settings['repeatMode'])
      : DEFAULT_SETTINGS.repeatMode,
    autoAdvanceMode: VALID_MODE.has(stored.autoAdvanceMode as string)
      ? (stored.autoAdvanceMode as Settings['autoAdvanceMode'])
      : DEFAULT_SETTINGS.autoAdvanceMode
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  // Validate inputs at the boundary so a misbehaving renderer can't poison the table.
  const safe: Partial<Settings> = {}
  if (patch.theme !== undefined && VALID_THEME.has(patch.theme)) safe.theme = patch.theme
  if (patch.defaultPlaybackSpeed !== undefined && VALID_SPEED.has(patch.defaultPlaybackSpeed)) {
    safe.defaultPlaybackSpeed = patch.defaultPlaybackSpeed
  }
  if (patch.repeatMode !== undefined && VALID_REPEAT.has(patch.repeatMode)) {
    safe.repeatMode = patch.repeatMode
  }
  if (patch.autoAdvanceMode !== undefined && VALID_MODE.has(patch.autoAdvanceMode)) {
    safe.autoAdvanceMode = patch.autoAdvanceMode
  }

  const upsert = getDb().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  const tx = getDb().transaction((entries: Array<[string, unknown]>) => {
    for (const [k, v] of entries) upsert.run(k, JSON.stringify(v))
  })
  tx(Object.entries(safe))

  return getSettings()
}
