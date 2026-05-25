import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

/**
 * Opens (and caches) the SQLite database that backs the downloader.
 *
 * Schema (per spec §3.3) lives in `downloads` and `download_queue` tables.
 * `manifest_cache` is intentionally NOT here — the manifest is still persisted
 * to `manifest.cache.json` from Phase 3. Migrating it into SQLite would touch
 * a working module for no behavioural gain; flagged as a future cleanup.
 *
 * WAL mode lets the renderer-side IPC reads run concurrently with the
 * downloader's writes without blocking either.
 */

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const file = join(app.getPath('userData'), 'qurandesk.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL') // good crash safety with WAL; faster than FULL
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      reciter_id     TEXT    NOT NULL,
      surah_number   INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
      file_path      TEXT    NOT NULL,
      size_bytes     INTEGER NOT NULL,
      downloaded_at  INTEGER NOT NULL,
      PRIMARY KEY (reciter_id, surah_number)
    );

    CREATE TABLE IF NOT EXISTS download_queue (
      id             TEXT    PRIMARY KEY,
      reciter_id     TEXT    NOT NULL,
      surah_number   INTEGER NOT NULL,
      status         TEXT    NOT NULL CHECK (status IN ('queued','active','paused','failed')),
      progress_bytes INTEGER DEFAULT 0,
      total_bytes    INTEGER DEFAULT 0,
      error          TEXT,
      created_at     INTEGER NOT NULL,
      UNIQUE (reciter_id, surah_number)
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_reciter ON download_queue(reciter_id);
    CREATE INDEX IF NOT EXISTS idx_downloads_reciter ON downloads(reciter_id);

    -- Flat KV store for user settings. Values are JSON-encoded so we can
    -- distinguish booleans, numbers, and strings without a separate column.
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Singleton row that records what the user was listening to last so the
    -- player can re-open to that surah at the saved position on next launch.
    CREATE TABLE IF NOT EXISTS playback_state (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      reciter_id       TEXT,
      surah_number     INTEGER,
      position_seconds REAL    NOT NULL DEFAULT 0,
      updated_at       INTEGER NOT NULL
    );
  `)
}

export function close(): void {
  if (db) {
    db.close()
    db = null
  }
}
