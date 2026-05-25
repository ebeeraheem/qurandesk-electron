import { ElectronAPI } from '@electron-toolkit/preload'
import type { QuranDeskAPI } from '../shared/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: QuranDeskAPI
  }
}
