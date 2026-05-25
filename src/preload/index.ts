import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type QuranDeskAPI } from '../shared/api'

// Maps the public API surface (one method per IPC.*) to ipcRenderer.invoke.
// Feature methods are wired here; in early phases the main side may not implement them yet,
// in which case calls reject — that's expected.
const notImplemented = (name: string) => async () => {
  throw new Error(`IPC handler not yet implemented: ${name}`)
}

const api: QuranDeskAPI = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  ping: () => ipcRenderer.invoke(IPC.ping),

  // Stubs — Phase 3+ will wire these on the main side.
  getReciters: notImplemented('getReciters'),
  refreshManifest: notImplemented('refreshManifest'),
  getManifestStatus: notImplemented('getManifestStatus'),
  getSurahDownloads: notImplemented('getSurahDownloads'),
  getAudioUrl: notImplemented('getAudioUrl'),
  downloadSurah: notImplemented('downloadSurah'),
  downloadReciter: notImplemented('downloadReciter'),
  cancelDownload: notImplemented('cancelDownload'),
  pauseAll: notImplemented('pauseAll'),
  resumeAll: notImplemented('resumeAll'),
  deleteReciter: notImplemented('deleteReciter'),
  deleteSurah: notImplemented('deleteSurah'),
  getStorageUsage: notImplemented('getStorageUsage'),
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
