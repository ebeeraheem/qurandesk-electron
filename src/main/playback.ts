import type { LastPlayback } from '../shared/api'
import { getDb } from './db'

/**
 * Singleton row recording the last surah the user listened to and how far
 * they got. The player restores `current` (without autoplay) from this on
 * boot, and writes back on play/pause/ended plus throttled during playback.
 *
 * `id = 1` constraint means there's only ever one row — INSERT OR REPLACE.
 */

const SAFE_RECITER_ID = /^[a-z0-9-]+$/

type PlaybackRow = {
  reciter_id: string | null
  surah_number: number | null
  position_seconds: number
}

export function getLastPlayback(): LastPlayback {
  const row = getDb()
    .prepare(
      'SELECT reciter_id, surah_number, position_seconds FROM playback_state WHERE id = 1'
    )
    .get() as PlaybackRow | undefined
  if (!row || row.reciter_id === null || row.surah_number === null) return null
  return {
    reciterId: row.reciter_id,
    surahNumber: row.surah_number,
    positionSeconds: row.position_seconds
  }
}

export function setLastPlayback(state: LastPlayback): void {
  if (state === null) {
    getDb().prepare('DELETE FROM playback_state WHERE id = 1').run()
    return
  }
  if (!SAFE_RECITER_ID.test(state.reciterId)) return
  if (!Number.isInteger(state.surahNumber) || state.surahNumber < 1 || state.surahNumber > 114) {
    return
  }
  const pos = Number.isFinite(state.positionSeconds) ? Math.max(0, state.positionSeconds) : 0

  getDb()
    .prepare(
      `INSERT INTO playback_state (id, reciter_id, surah_number, position_seconds, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         reciter_id = excluded.reciter_id,
         surah_number = excluded.surah_number,
         position_seconds = excluded.position_seconds,
         updated_at = excluded.updated_at`
    )
    .run(state.reciterId, state.surahNumber, pos, Date.now())
}
