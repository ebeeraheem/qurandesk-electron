import { create } from 'zustand'
import type { UpdateStatus } from '@shared/api'

/**
 * Renderer-side mirror of the auto-updater state. Hydrated on app boot via
 * `initUpdaterBridge`, then driven by the `update:status` event from main.
 */
type UpdaterState = {
  status: UpdateStatus
}

export const useUpdaterStore = create<UpdaterState>(() => ({
  status: { status: 'up-to-date' }
}))

let wired = false
export function initUpdaterBridge(): void {
  if (wired) return
  wired = true
  globalThis.api.on('update:status', (s) => {
    useUpdaterStore.setState({ status: s })
  })
  // Hydrate without triggering another check; main owns the automatic schedule.
  globalThis.api
    .getUpdateStatus()
    .then((s) => useUpdaterStore.setState({ status: s }))
    .catch(() => undefined)
}
