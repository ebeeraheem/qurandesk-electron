import { app, shell, BrowserWindow, ipcMain } from 'electron'
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
import { buildReciterSummary, getSurahDownloads, reconcileFilesystem } from './downloads'
import { close as closeDb, getDb } from './db'
import * as downloader from './downloader'
import { getStorageUsage } from './storage'
import { getSettings, updateSettings } from './settings'
import { getLastPlayback, setLastPlayback } from './playback'
import type { LastPlayback, Settings } from '../shared/api'

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
    throw new Error(`Invalid reciter id: ${String(id)}`)
  }
  return id
}

function validateSurah(n: unknown): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 114) {
    throw new Error(`Invalid surah number: ${String(n)}`)
  }
  return n
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
    return exists ? audioUrl(r, s) : null
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
    return { cachedAt: s.cachedAt, lastError: s.lastError }
  })
  ipcMain.handle(IPC.getSurahDownloads, async (_e, reciterId: unknown) => {
    return getSurahDownloads(validateReciterId(reciterId))
  })

  // Downloader.
  ipcMain.handle(IPC.downloadSurah, async (_e, reciterId: unknown, surah: unknown) => {
    downloader.enqueueSurah(validateReciterId(reciterId), validateSurah(surah))
  })
  ipcMain.handle(IPC.downloadReciter, async (_e, reciterId: unknown) => {
    downloader.enqueueReciter(validateReciterId(reciterId))
  })
  ipcMain.handle(IPC.cancelDownload, async (_e, reciterId: unknown, surah: unknown) => {
    await downloader.cancelSurah(validateReciterId(reciterId), validateSurah(surah))
  })
  ipcMain.handle(IPC.pauseAll, async () => {
    downloader.pauseAll()
  })
  ipcMain.handle(IPC.resumeAll, async () => {
    downloader.resumeAll()
  })
  ipcMain.handle(IPC.deleteSurah, async (_e, reciterId: unknown, surah: unknown) => {
    await downloader.deleteSurah(validateReciterId(reciterId), validateSurah(surah))
  })
  ipcMain.handle(IPC.deleteReciter, async (_e, reciterId: unknown) => {
    await downloader.deleteReciter(validateReciterId(reciterId))
  })
  ipcMain.handle(IPC.getActiveQueue, async () => {
    return downloader.getActiveQueue()
  })
  ipcMain.handle(IPC.isPaused, async () => {
    return downloader.isPaused()
  })

  // Storage.
  ipcMain.handle(IPC.getStorageUsage, async () => {
    return getStorageUsage()
  })

  // Settings.
  ipcMain.handle(IPC.getSettings, async () => getSettings())
  ipcMain.handle(IPC.updateSettings, async (_e, patch: Partial<Settings>) => updateSettings(patch))

  // Playback persistence.
  ipcMain.handle(IPC.getLastPlayback, async () => getLastPlayback())
  ipcMain.handle(IPC.setLastPlayback, async (_e, state: LastPlayback) => setLastPlayback(state))
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('app.qurandesk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initAudioRoot()
  registerProtocolHandler()
  await manifest.loadCache()
  // Touch the DB now so any startup migrations run before IPC handlers fire.
  getDb()
  await reconcileFilesystem()
  registerIpcHandlers()
  createWindow()

  // Manifest event fan-out.
  manifest.onUpdated(() => broadcast(EVENTS.manifestUpdated))
  manifest.refresh().catch(() => undefined)

  // Downloader event fan-out.
  downloader.onProgress((p) => broadcast(EVENTS.downloadProgress, p))
  downloader.onCompleted((p) => broadcast(EVENTS.downloadCompleted, p))

  // Boot the downloader: demote leftover 'active' rows + resume queue.
  downloader.recoverFromCrash()

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
