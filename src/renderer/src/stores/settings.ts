import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '@shared/api'

/**
 * Renderer-side mirror of main's settings. Hydrated once at app boot via
 * `initSettings()`; mutations call back through IPC so the DB stays the
 * source of truth across windows / restarts.
 */

type SettingsState = {
  settings: Settings
  hydrated: boolean
}

export const useSettingsStore = create<SettingsState>(() => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false
}))

/** One-shot hydration. Safe to call multiple times. */
let inflight: Promise<void> | null = null
export function initSettings(): Promise<void> {
  if (inflight) return inflight
  inflight = window.api
    .getSettings()
    .then((settings) => {
      useSettingsStore.setState({ settings, hydrated: true })
    })
    .catch(() => {
      // Stay on defaults — the DB will fix itself on next write.
      useSettingsStore.setState({ hydrated: true })
    })
  return inflight
}

/** Optimistically apply locally, then send the patch upstream. */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  useSettingsStore.setState((s) => ({ settings: { ...s.settings, ...patch } }))
  try {
    const next = await globalThis.api.updateSettings(patch)
    useSettingsStore.setState({ settings: next })
  } catch {
    // Network error against IPC is unlikely; fall back to a fresh fetch.
    void initSettings()
  }
}
