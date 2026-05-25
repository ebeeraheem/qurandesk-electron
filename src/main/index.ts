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
import { buildReciterSummary, getSurahDownloads } from './downloads'

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

/** Broadcast a renderer event to every open window. */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.ping, async () => 'pong' as const)
  ipcMain.handle(IPC.getAppInfo, async () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    audioDir: getAudioRoot()
  }))

  // Audio protocol ↔ IPC.
  ipcMain.handle(IPC.getAudioUrl, async (_e, reciterId: string, surah: number) => {
    const exists = await audioFileIfExists(reciterId, surah)
    return exists ? audioUrl(reciterId, surah) : null
  })

  // Catalog.
  ipcMain.handle(IPC.getReciters, async () => {
    const m = manifest.getCachedManifest()
    if (!m) return []
    // Resolve each reciter's on-disk download stats in parallel.
    return Promise.all(m.reciters.map(buildReciterSummary))
  })
  ipcMain.handle(IPC.getSurahDownloads, async (_e, reciterId: string) => {
    return getSurahDownloads(reciterId)
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
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('app.qurandesk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Order matters here:
  //  1. Audio dir + protocol handler so the renderer can resolve URLs from first paint
  //  2. Load any cached manifest from disk so the renderer skips Welcome on returning launches
  //  3. Register IPC handlers
  //  4. Create the window (renderer may call getReciters() during mount)
  //  5. Wire manifest event fan-out
  //  6. Fire-and-forget a background refresh
  await initAudioRoot()
  registerProtocolHandler()
  await manifest.loadCache()
  registerIpcHandlers()
  createWindow()

  manifest.onUpdated(() => broadcast(EVENTS.manifestUpdated))
  manifest.refresh().catch(() => {
    // Errors are already captured into manifest.getStatus().lastError and broadcast
    // via `manifest:updated`; nothing more to do here.
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
