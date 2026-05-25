import { useEffect, useState } from 'react'
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
 */

const CACHE_KEY = 'qurandesk:theme-cache'

function resolveActive(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return pref
}

function applyClass(active: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', active === 'dark')
}

function readCache(): ThemePreference {
  const raw = localStorage.getItem(CACHE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

let initialized = false

export function initTheme(): void {
  if (initialized) return
  initialized = true

  // 1. First paint — use whatever we cached last time.
  const cached = readCache()
  applyClass(resolveActive(cached))

  // 2. When settings hydrate (and on every subsequent change), apply + cache.
  useSettingsStore.subscribe((state) => {
    const pref = state.settings.theme
    localStorage.setItem(CACHE_KEY, pref)
    applyClass(resolveActive(pref))
  })

  // 3. Follow OS changes while preference is 'system'.
  if (typeof window !== 'undefined') {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (useSettingsStore.getState().settings.theme === 'system') {
          applyClass(resolveActive('system'))
        }
      })
  }
}

/**
 * Hook returning the live theme state. Components that just need the active
 * value (light/dark) for an icon can call this; mutations go through
 * `setPreference`.
 */
export function useThemeStore(): {
  preference: ThemePreference
  active: 'light' | 'dark'
  setPreference: (p: ThemePreference) => void
} {
  const preference = useSettingsStore((s) => s.settings.theme)
  // Track `active` locally so OS preference changes re-render consumers.
  const [active, setActive] = useState<'light' | 'dark'>(() => resolveActive(preference))

  useEffect(() => {
    setActive(resolveActive(preference))
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setActive(resolveActive('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  return {
    preference,
    active,
    setPreference: (p) => void updateSettings({ theme: p })
  }
}
