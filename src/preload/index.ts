import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type QuranDeskAPI } from '../shared/api'

const api: QuranDeskAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  ping: () => ipcRenderer.invoke(IPC.ping),

  // Catalog
  getReciters: () => ipcRenderer.invoke(IPC.getReciters),
  refreshManifest: () => ipcRenderer.invoke(IPC.refreshManifest),
  getManifestStatus: () => ipcRenderer.invoke(IPC.getManifestStatus),

  // Surah-level
  getSurahDownloads: (reciterId) => ipcRenderer.invoke(IPC.getSurahDownloads, reciterId),
  getAudioUrl: (reciterId, surah) => ipcRenderer.invoke(IPC.getAudioUrl, reciterId, surah),

  // Downloads
  downloadSurah: (reciterId, surah) => ipcRenderer.invoke(IPC.downloadSurah, reciterId, surah),
  downloadReciter: (reciterId) => ipcRenderer.invoke(IPC.downloadReciter, reciterId),
  cancelDownload: (reciterId, surah) => ipcRenderer.invoke(IPC.cancelDownload, reciterId, surah),
  deleteReciter: (reciterId) => ipcRenderer.invoke(IPC.deleteReciter, reciterId),
  deleteSurah: (reciterId, surah) => ipcRenderer.invoke(IPC.deleteSurah, reciterId, surah),
  deleteAllDownloads: () => ipcRenderer.invoke(IPC.deleteAllDownloads),
  getActiveQueue: () => ipcRenderer.invoke(IPC.getActiveQueue),
  refreshLibrary: () => ipcRenderer.invoke(IPC.refreshLibrary),

  // Storage
  getStorageUsage: () => ipcRenderer.invoke(IPC.getStorageUsage),
  revealDownloadsFolder: () => ipcRenderer.invoke(IPC.revealDownloadsFolder),

  // Settings + playback persistence
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  getLastPlayback: () => ipcRenderer.invoke(IPC.getLastPlayback),
  setLastPlayback: (state) => ipcRenderer.invoke(IPC.setLastPlayback, state),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  installUpdateOnQuit: () => ipcRenderer.invoke(IPC.installUpdateOnQuit),

  // Diagnostics
  exportDiagnostics: () => ipcRenderer.invoke(IPC.exportDiagnostics),
  reportDiagnostic: (operation, error, context) =>
    ipcRenderer.invoke(IPC.reportDiagnostic, operation, error, context),

  on: ((event: string, cb: (...args: unknown[]) => void) => {
    const listener = (_: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }) as QuranDeskAPI['on']
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
