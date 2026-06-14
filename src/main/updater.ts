import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import { EventEmitter } from 'node:events'
import type { UpdateStatus } from '../shared/api'
import { recordDiagnostic } from './diagnostics'

/**
 * Wraps `electron-updater` and normalises its loose event surface into our
 * `UpdateStatus` discriminated union so the renderer only sees one shape.
 *
 * Behaviour:
 *  - On launch, fire one `checkForUpdates`. Then every 6 hours.
 *  - Updates download automatically in the background.
 *  - If the user clicks "Restart" in the banner, we `quitAndInstall` now.
 *  - Otherwise `autoInstallOnAppQuit = true` lands the update on next launch.
 *  - In a dev / unpacked build, `autoUpdater` can't actually install anything,
 *    so we short-circuit checks to `'up-to-date'`.
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h per spec §9.3

const events = new EventEmitter()
let lastStatus: UpdateStatus = { status: 'up-to-date' }
let initialized = false

export function getLastStatus(): UpdateStatus {
  return lastStatus
}

export function onStatus(cb: (s: UpdateStatus) => void): () => void {
  events.on('status', cb)
  return () => events.off('status', cb)
}

function emit(s: UpdateStatus): void {
  lastStatus = s
  events.emit('status', s)
}

export function initUpdater(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Route electron-updater's chatty logs into our log file so a failed update
  // leaves a paper trail. console.* is already piped to electron-log by main.
  autoUpdater.logger = log

  autoUpdater.on('update-available', (info) => {
    emit({ status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    emit({ status: 'up-to-date' })
  })
  autoUpdater.on('download-progress', (progress) => {
    emit({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, progress.percent ?? 0))
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    emit({ status: 'ready', version: info.version })
  })
  autoUpdater.on('error', (e) => {
    recordDiagnostic('updater/event', e)
    emit({ status: 'error', message: e?.message ?? String(e) })
  })

  // Kick off the first check + interval. We don't await — the events drive the UI.
  void checkForUpdates()
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ status: 'up-to-date' })
    return lastStatus
  }
  try {
    await autoUpdater.checkForUpdates()
    return lastStatus
  } catch (e) {
    recordDiagnostic('updater/check', e)
    const status: UpdateStatus = {
      status: 'error',
      message: e instanceof Error ? e.message : String(e)
    }
    emit(status)
    return status
  }
}

/**
 * Invoked when the user clicks "Restart" in the update banner. The name
 * matches our IPC contract (settled in Phase 1); the actual behaviour is
 * "quit and install now". If they ignore the banner, `autoInstallOnAppQuit`
 * lands the update on the next natural quit anyway.
 */
export function installUpdateOnQuit(): void {
  if (lastStatus.status !== 'ready') return
  // Args: (isSilent, isForceRunAfter). The forceRunAfter makes the app
  // reopen after the installer finishes on Windows.
  autoUpdater.quitAndInstall(false, true)
}
