// Shared IPC contract between main and renderer.
// Keep this file free of Node and DOM types — both sides import it.

export type ReciterSummary = {
  id: string
  name: string
  photoUrl: string | null
  style?: string
  totalSizeBytes?: number
  downloadState: 'none' | 'partial' | 'complete'
  downloadedSurahs: number // 0..114
}

export type SurahDownload = {
  reciterId: string
  surahNumber: number
  status: 'not_downloaded' | 'queued' | 'active' | 'downloaded' | 'failed'
  progressBytes?: number
  totalBytes?: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5

export type AutoAdvanceMode = 'stop' | 'download-then-play'

/**
 * 'off' = sequential continuous play (the default). At end of surah we move
 *         to surah N+1, subject to `autoAdvanceMode` when N+1 isn't on disk.
 *         Stops cleanly at surah 114.
 * 'one' = loop the current surah indefinitely.
 *
 * "Repeat all" (wrap 114→1) isn't included — not a useful Qur'an workflow.
 */
export type RepeatMode = 'off' | 'one'

export type Settings = {
  theme: ThemePreference
  defaultPlaybackSpeed: PlaybackSpeed
  repeatMode: RepeatMode
  /** What to do when the next surah isn't on disk. */
  autoAdvanceMode: AutoAdvanceMode
}

export type LastPlayback = {
  reciterId: string
  surahNumber: number
  positionSeconds: number
} | null

export type UpdateStatus =
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

/**
 * Stable identifiers for every error class the main process can surface. The
 * renderer keys off `code` for behaviour (retry, hide, special copy); the
 * `userMessage` is the only string a human should ever see.
 */
export type AppErrorCode =
  | 'manifest/not-configured'
  | 'manifest/fetch-failed'
  | 'manifest/invalid'
  | 'manifest/unsupported-version'
  | 'catalog/not-loaded'
  | 'catalog/unknown-reciter'
  | 'input/invalid-reciter-id'
  | 'input/invalid-surah'
  | 'download/http-failed'
  | 'download/empty-body'
  | 'download/path-invalid'

export type AppError = {
  code: AppErrorCode
  userMessage: string
  /** Technical context for the log file; never rendered to the user. */
  detail?: string
}

export type StorageUsage = {
  appUsedBytes: number
  totalBytes: number
  freeBytes: number
  downloadDir: string
}

/**
 * Flat row from `download_queue` — used by the Downloads page to render
 * everything that's not yet a completed download.
 */
export type QueueEntry = {
  reciterId: string
  surahNumber: number
  status: 'queued' | 'active' | 'failed'
  progressBytes: number
  totalBytes: number
  error: string | null
  createdAt: number
}

export type LibrarySnapshot = {
  downloads: SurahDownload[]
  queue: QueueEntry[]
}

export type ExportDiagnosticsResult = {
  saved: boolean
}

export type AppInfo = {
  version: string
  platform: NodeJS.Platform
}

export interface QuranDeskAPI {
  // Bootstrap / diagnostics
  getAppInfo: () => Promise<AppInfo>
  ping: () => Promise<'pong'>

  // Catalog (stubs for later phases)
  getReciters: () => Promise<ReciterSummary[]>
  refreshManifest: () => Promise<{ ok: boolean; updatedAt?: string; error?: AppError }>
  getManifestStatus: () => Promise<{
    cachedAt: number | null
    lastError: AppError | null
    fetching: boolean
  }>

  // Surah-level
  getSurahDownloads: (reciterId: string) => Promise<SurahDownload[]>
  getAudioUrl: (reciterId: string, surah: number) => Promise<string | null>

  // Downloads
  downloadSurah: (reciterId: string, surah: number) => Promise<void>
  downloadReciter: (reciterId: string) => Promise<void>
  cancelDownload: (reciterId: string, surah: number) => Promise<void>
  deleteReciter: (reciterId: string) => Promise<void>
  deleteSurah: (reciterId: string, surah: number) => Promise<void>
  deleteAllDownloads: () => Promise<void>
  getActiveQueue: () => Promise<QueueEntry[]>
  refreshLibrary: () => Promise<LibrarySnapshot>

  // Storage
  getStorageUsage: () => Promise<StorageUsage>

  // Settings
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>

  // Playback persistence
  getLastPlayback: () => Promise<LastPlayback>
  setLastPlayback: (state: LastPlayback) => Promise<void>

  // Updates
  getUpdateStatus: () => Promise<UpdateStatus>
  installUpdateOnQuit: () => Promise<void>

  // Diagnostics
  exportDiagnostics: () => Promise<ExportDiagnosticsResult>
  reportDiagnostic: (operation: string, error: string, context?: unknown) => Promise<void>

  // Events — return unsubscribe function
  on: {
    (event: 'download:progress', cb: (p: SurahDownload) => void): () => void
    (event: 'download:completed', cb: (p: { reciterId: string; surah: number }) => void): () => void
    (event: 'manifest:updated', cb: () => void): () => void
    (event: 'library:changed', cb: () => void): () => void
    (event: 'update:status', cb: (s: UpdateStatus) => void): () => void
  }
}

// Channel names for renderer→main events that go via `webContents.send`.
// Kept separate from IPC (which is invoke/handle) so the direction is obvious.
export const EVENTS = {
  downloadProgress: 'download:progress',
  downloadCompleted: 'download:completed',
  manifestUpdated: 'manifest:updated',
  libraryChanged: 'library:changed',
  updateStatus: 'update:status'
} as const

// Channel names used over `ipcRenderer.invoke`. Listed once so main + preload + tests stay in sync.
export const IPC = {
  getAppInfo: 'app:getAppInfo',
  ping: 'app:ping',

  getReciters: 'catalog:getReciters',
  refreshManifest: 'catalog:refreshManifest',
  getManifestStatus: 'catalog:getManifestStatus',

  getSurahDownloads: 'surah:getDownloads',
  getAudioUrl: 'surah:getAudioUrl',

  downloadSurah: 'download:surah',
  downloadReciter: 'download:reciter',
  cancelDownload: 'download:cancel',
  deleteReciter: 'download:deleteReciter',
  deleteSurah: 'download:deleteSurah',
  deleteAllDownloads: 'download:deleteAll',
  getActiveQueue: 'download:getActiveQueue',
  refreshLibrary: 'download:refreshLibrary',

  getStorageUsage: 'storage:getUsage',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  getLastPlayback: 'playback:get',
  setLastPlayback: 'playback:set',

  getUpdateStatus: 'updater:getStatus',
  installUpdateOnQuit: 'updater:installOnQuit',

  exportDiagnostics: 'system:exportDiagnostics',
  reportDiagnostic: 'system:reportDiagnostic'
} as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultPlaybackSpeed: 1,
  repeatMode: 'off',
  autoAdvanceMode: 'stop'
}
