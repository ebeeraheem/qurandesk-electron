import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type QuranDeskAPI } from '../shared/api'

const notImplemented = (name: string) => async (): Promise<never> => {
  throw new Error(`IPC handler not yet implemented: ${name}`)
}

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
  pauseAll: () => ipcRenderer.invoke(IPC.pauseAll),
  resumeAll: () => ipcRenderer.invoke(IPC.resumeAll),
  deleteReciter: (reciterId) => ipcRenderer.invoke(IPC.deleteReciter, reciterId),
  deleteSurah: (reciterId, surah) => ipcRenderer.invoke(IPC.deleteSurah, reciterId, surah),
  getActiveQueue: () => ipcRenderer.invoke(IPC.getActiveQueue),
  isPaused: () => ipcRenderer.invoke(IPC.isPaused),

  // Storage
  getStorageUsage: () => ipcRenderer.invoke(IPC.getStorageUsage),

  // Stubs — populated by later phases.
  getSettings: notImplemented('getSettings'),
  updateSettings: notImplemented('updateSettings'),
  checkForUpdates: notImplemented('checkForUpdates'),
  installUpdateOnQuit: notImplemented('installUpdateOnQuit'),

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
