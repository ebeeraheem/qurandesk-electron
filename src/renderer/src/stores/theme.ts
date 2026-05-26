import { useSyncExternalStore } from 'react'
import type { ThemePreference } from '@shared/api'
import { useSettingsStore, updateSettings } from './settings'

/**
 * Theme is derived from settings (single source of truth in SQLite).
 * `localStorage` only acts as a first-paint cache so we don't flash the
 * wrong palette while `getSettings` IPC is in flight on boot.
 *
 *  - `initTheme()` applies a class to `<html>` from the cache before paint,
 *    then subscribes to the settings store so subsequent changes propagate.
 *  - `useThemeStore()` is a hook for components — returns `{ preference,
 *    active, setPreference }`. Mutations go through `updateSettings`.
 *
 * The OS dark-mode media query is read via `useSyncExternalStore` rather
 * than `useEffect + useState` so React re-renders consumers automatically
 * when the OS preference flips, with zero "setState-in-effect" cascade.
 */

const CACHE_KEY = 'qurandesk:theme-cache'

function resolveActive(pref: ThemePreference, osDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return osDark ? 'dark' : 'light'
  return pref
}

function applyClass(active: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', active === 'dark')
}

function readCache(): ThemePreference {
  const raw = localStorage.getItem(CACHE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

// ---------------------------------------------------------------------------
// External-store glue for `useSyncExternalStore`. Lives at module scope so
// every consumer shares the same subscriber list — React handles fan-out.
// ---------------------------------------------------------------------------

function subscribeToOSScheme(callback: () => void): () => void {
  if (globalThis.window === undefined) return () => undefined
  const mq = globalThis.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function getOSDark(): boolean {
  if (globalThis.window === undefined) return false
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches
}

// ---------------------------------------------------------------------------
// Boot-time init: keep <html> class + localStorage cache in sync with both
// settings changes and OS scheme changes. No React involvement here — runs
// before the renderer's first React paint.
// ---------------------------------------------------------------------------

let initialized = false

export function initTheme(): void {
  if (initialized) return
  initialized = true

  // First paint — use whatever we cached last time.
  const cached = readCache()
  applyClass(resolveActive(cached, getOSDark()))

  // When settings hydrate (and on every subsequent change), apply + cache.
  useSettingsStore.subscribe((state) => {
    const pref = state.settings.theme
    localStorage.setItem(CACHE_KEY, pref)
    applyClass(resolveActive(pref, getOSDark()))
  })

  // Follow OS changes while preference is 'system'.
  if (globalThis.window !== undefined) {
    globalThis.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const pref = useSettingsStore.getState().settings.theme
      if (pref === 'system') applyClass(resolveActive('system', getOSDark()))
    })
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Returns `{ preference, active, setPreference }`. `active` recomputes
 * automatically when either the user's preference or the OS scheme flips.
 */
export function useThemeStore(): {
  preference: ThemePreference
  active: 'light' | 'dark'
  setPreference: (p: ThemePreference) => void
} {
  const preference = useSettingsStore((s) => s.settings.theme)
  const osDark = useSyncExternalStore(subscribeToOSScheme, getOSDark, getOSDark)
  const active = resolveActive(preference, osDark)

  return {
    preference,
    active,
    setPreference: (p) => void updateSettings({ theme: p })
  }
}
