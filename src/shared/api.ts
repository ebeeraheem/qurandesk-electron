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

export type PlaybackSpeed = 0.75 | 1.0 | 1.25 | 1.5

export type AutoAdvanceMode = 'stop' | 'download-then-play'

export type Settings = {
  theme: ThemePreference
  defaultReciterId: string | null
  defaultPlaybackSpeed: PlaybackSpeed
  autoAdvanceMode: AutoAdvanceMode
}

export type UpdateStatus =
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export type StorageUsage = {
  appUsedBytes: number
  totalBytes: number
  freeBytes: number
  downloadDir: string
}

export type AppInfo = {
  version: string
  platform: NodeJS.Platform
  userDataPath: string
  audioDir: string
}

export interface QuranDeskAPI {
  // Bootstrap / diagnostics
  getAppInfo: () => Promise<AppInfo>
  ping: () => Promise<'pong'>

  // Catalog (stubs for later phases)
  getReciters: () => Promise<ReciterSummary[]>
  refreshManifest: () => Promise<{ ok: boolean; updatedAt?: string; error?: string }>
  getManifestStatus: () => Promise<{ cachedAt: number | null; lastError: string | null }>

  // Surah-level
  getSurahDownloads: (reciterId: string) => Promise<SurahDownload[]>
  getAudioUrl: (reciterId: string, surah: number) => Promise<string | null>

  // Downloads
  downloadSurah: (reciterId: string, surah: number) => Promise<void>
  downloadReciter: (reciterId: string) => Promise<void>
  cancelDownload: (reciterId: string, surah: number) => Promise<void>
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  deleteReciter: (reciterId: string) => Promise<void>
  deleteSurah: (reciterId: string, surah: number) => Promise<void>

  // Storage
  getStorageUsage: () => Promise<StorageUsage>

  // Settings
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>

  // Updates
  checkForUpdates: () => Promise<UpdateStatus>
  installUpdateOnQuit: () => Promise<void>

  // Events — return unsubscribe function
  on: {
    (event: 'download:progress', cb: (p: SurahDownload) => void): () => void
    (event: 'download:completed', cb: (p: { reciterId: string; surah: number }) => void): () => void
    (event: 'manifest:updated', cb: () => void): () => void
    (event: 'update:status', cb: (s: UpdateStatus) => void): () => void
  }
}

// Channel names for renderer→main events that go via `webContents.send`.
// Kept separate from IPC (which is invoke/handle) so the direction is obvious.
export const EVENTS = {
  downloadProgress: 'download:progress',
  downloadCompleted: 'download:completed',
  manifestUpdated: 'manifest:updated',
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
  pauseAll: 'download:pauseAll',
  resumeAll: 'download:resumeAll',
  deleteReciter: 'download:deleteReciter',
  deleteSurah: 'download:deleteSurah',

  getStorageUsage: 'storage:getUsage',

  getSettings: 'settings:get',
  updateSettings: 'settings:update',

  checkForUpdates: 'updater:check',
  installUpdateOnQuit: 'updater:installOnQuit'
} as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultReciterId: null,
  defaultPlaybackSpeed: 1.0,
  autoAdvanceMode: 'stop'
}
