import { app, shell, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main'
import type { Settings, LastPlayback } from '../shared/api'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { EVENTS, IPC } from '../shared/api'
import {
  audioFileIfExists,
  audioUrl,
  getAudioRoot,
  initAudioRoot,
  registerHandler as registerProtocolHandler,
  registerScheme as registerProtocolScheme
} from './protocol'
import * as manifest from './manifest'
import * as photos from './photos'
import {
  buildReciterSummary,
  getCompletedDownloads,
  getSurahDownloads,
  reconcileFilesystem
} from './downloads'
import { close as closeDb, getDb } from './db'
import * as downloader from './downloader'
import { getStorageUsage } from './storage'
import { getSettings, updateSettings } from './settings'
import { getLastPlayback, setLastPlayback } from './playback'
import * as updater from './updater'
import { throwAppError } from './errors'
import { exportDiagnostics, getRecentDiagnostics, recordDiagnostic } from './diagnostics'

// Logging — set up before anything else so even startup errors land on disk.
// File path is electron-log's default: <userData>/logs/main.log per platform.
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = is.dev ? 'debug' : 'warn'
// Route bare console.* calls (ours and from libs) through the same transports.
Object.assign(console, log.functions)

// Privileged scheme registration MUST happen before app is ready.
registerProtocolScheme()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'QuranDesk',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function validateReciterId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
    throwAppError('input/invalid-reciter-id', 'Something went wrong. Please try again.', String(id))
  }
  return id
}

function validateSurah(n: unknown): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 114) {
    throwAppError('input/invalid-surah', 'Something went wrong. Please try again.', String(n))
  }
  return n
}

async function buildDiagnosticsReport(): Promise<unknown> {
  const catalog = manifest.getStatus()
  const cachedManifest = manifest.getCachedManifest()
  const storage = await getStorageUsage()
  const completed = getDb()
    .prepare(
      `SELECT COUNT(*) AS files, COUNT(DISTINCT reciter_id) AS reciters,
              COALESCE(SUM(size_bytes), 0) AS bytes
       FROM downloads`
    )
    .get()
  const queueRows = getDb()
    .prepare('SELECT status, COUNT(*) AS count FROM download_queue GROUP BY status')
    .all() as Array<{ status: string; count: number }>
  return {
    generatedAt: new Date().toISOString(),
    app: {
      version: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged
    },
    catalog: {
      loaded: cachedManifest !== null,
      reciterCount: cachedManifest?.reciters.length ?? 0,
      cachedAt: catalog.cachedAt ? new Date(catalog.cachedAt).toISOString() : null,
      ageMs: catalog.cachedAt ? Math.max(0, Date.now() - catalog.cachedAt) : null,
      fetching: catalog.fetching,
      lastError: catalog.lastError
        ? { code: catalog.lastError.code, userMessage: catalog.lastError.userMessage }
        : null
    },
    settings: getSettings(),
    downloads: {
      completed,
      queue: Object.fromEntries(queueRows.map((row) => [row.status, row.count]))
    },
    storage: {
      appUsedBytes: storage.appUsedBytes,
      totalBytes: storage.totalBytes,
      freeBytes: storage.freeBytes
    },
    update: updater.getLastStatus(),
    recentErrors: getRecentDiagnostics()
  }
}

function registerIpcHandlers(): void {
  // Bootstrap.
  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getAppInfo, async () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    audioDir: getAudioRoot()
  }))

  // Audio protocol.
  ipcMain.handle(IPC.getAudioUrl, async (_e, reciterId: unknown, surah: unknown) => {
    const r = validateReciterId(reciterId)
    const s = validateSurah(surah)
    const exists = await audioFileIfExists(r, s)
    if (exists) return audioUrl(r, s)
    // File isn't on disk. If the DB thinks it is, reconcile and notify the
    // renderer so its player and download state can recover.
    const dbHasIt = !!getDb()
      .prepare('SELECT 1 FROM downloads WHERE reciter_id = ? AND surah_number = ?')
      .get(r, s)
    if (dbHasIt) downloader.notifyFileMissing(r, s)
    return null
  })

  // Catalog.
  ipcMain.handle(IPC.getReciters, async () => {
    const m = manifest.getCachedManifest()
    if (!m) return []
    return m.reciters.map(buildReciterSummary)
  })
  ipcMain.handle(IPC.refreshManifest, async () => {
    const result = await manifest.refresh()
    if (result.ok) return { ok: true, updatedAt: result.updatedAt }
    return { ok: false, error: result.error }
  })
  ipcMain.handle(IPC.getManifestStatus, async () => {
    const s = manifest.getStatus()
    return { cachedAt: s.cachedAt, lastError: s.lastError, fetching: s.fetching }
  })
  ipcMain.handle(IPC.getSurahDownloads, async (_e, reciterId: unknown) => {
    return getSurahDownloads(validateReciterId(reciterId))
  })

  // Downloader.
  ipcMain.handle(IPC.downloadSurah, async (_e, reciterId: unknown, surah: unknown) => {
    downloader.enqueueSurah(validateReciterId(reciterId), validateSurah(surah), { priority: true })
  })
  ipcMain.handle(IPC.downloadReciter, async (_e, reciterId: unknown) => {
    downloader.enqueueReciter(validateReciterId(reciterId))
  })
  ipcMain.handle(IPC.cancelDownload, async (_e, reciterId: unknown, surah: unknown) => {
    await downloader.cancelSurah(validateReciterId(reciterId), validateSurah(surah))
  })
  ipcMain.handle(IPC.deleteSurah, async (_e, reciterId: unknown, surah: unknown) => {
    await downloader.deleteSurah(validateReciterId(reciterId), validateSurah(surah))
  })
  ipcMain.handle(IPC.deleteReciter, async (_e, reciterId: unknown) => {
    await downloader.deleteReciter(validateReciterId(reciterId))
  })
  ipcMain.handle(IPC.deleteAllDownloads, async () => {
    await downloader.deleteAllDownloads()
  })
  ipcMain.handle(IPC.getActiveQueue, async () => {
    return downloader.getActiveQueue()
  })
  ipcMain.handle(IPC.refreshLibrary, async () => {
    try {
      await reconcileFilesystem()
      return {
        downloads: getCompletedDownloads(),
        queue: downloader.getActiveQueue()
      }
    } catch (error) {
      recordDiagnostic('library/refresh', error)
      throw error
    }
  })

  // Storage.
  ipcMain.handle(IPC.getStorageUsage, async () => {
    return getStorageUsage()
  })
  ipcMain.handle(IPC.revealDownloadsFolder, async () => {
    // No renderer-provided path — we always open the audio root we control.
    // Avoids any chance of arbitrary-path opens via this IPC.
    const dir = getAudioRoot()
    if (dir) await shell.openPath(dir)
  })

  // Settings.
  ipcMain.handle(IPC.getSettings, async () => getSettings())
  ipcMain.handle(IPC.updateSettings, async (_e, patch: Partial<Settings>) => updateSettings(patch))

  // Playback persistence.
  ipcMain.handle(IPC.getLastPlayback, async () => getLastPlayback())
  ipcMain.handle(IPC.setLastPlayback, async (_e, state: LastPlayback) => setLastPlayback(state))

  // Auto-updater.
  ipcMain.handle(IPC.checkForUpdates, async () => updater.checkForUpdates())
  ipcMain.handle(IPC.installUpdateOnQuit, async () => updater.installUpdateOnQuit())

  // Diagnostics.
  ipcMain.handle(IPC.exportDiagnostics, async () => {
    try {
      return await exportDiagnostics(await buildDiagnosticsReport())
    } catch (error) {
      recordDiagnostic('diagnostics/build-report', error)
      return { saved: false }
    }
  })
  ipcMain.handle(
    IPC.reportDiagnostic,
    async (_e, operation: unknown, error: unknown, context: unknown) => {
      recordDiagnostic(
        typeof operation === 'string' ? operation : 'renderer/unknown',
        typeof error === 'string' ? error : 'Unknown renderer error',
        context
      )
    }
  )
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('app.qurandesk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initAudioRoot()
  await photos.initPhotoRoot()
  registerProtocolHandler()
  await manifest.loadCache()
  // Touch the DB now so any startup migrations run before IPC handlers fire.
  getDb()
  await reconcileFilesystem()
  registerIpcHandlers()
  createWindow()

  // Manifest event fan-out — and kick off a background photo pre-cache
  // whenever the catalog changes so the offline catalog has avatars.
  manifest.onUpdated(() => {
    broadcast(EVENTS.manifestUpdated)
    void photos.precacheAll()
  })
  manifest.refresh().catch((error) => recordDiagnostic('manifest/background-refresh', error))
  // If we restored a cached manifest above, pre-cache its photos immediately
  // (refresh() will re-run this too, but we want the cache to start filling
  // even before the network round-trip finishes).
  void photos.precacheAll()

  // Downloader event fan-out.
  downloader.onProgress((p) => broadcast(EVENTS.downloadProgress, p))
  downloader.onCompleted((p) => broadcast(EVENTS.downloadCompleted, p))
  downloader.onLibraryChanged(() => broadcast(EVENTS.libraryChanged))

  // Boot the downloader: demote leftover 'active' rows and resume the queue.
  downloader.recoverFromCrash()

  // Auto-updater event fan-out + initial check. No-op in unpacked dev.
  updater.onStatus((s) => broadcast(EVENTS.updateStatus, s))
  updater.initUpdater()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
