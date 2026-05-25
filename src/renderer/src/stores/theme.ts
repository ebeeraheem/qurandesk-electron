import { create } from 'zustand'
import type { ThemePreference } from '@shared/api'

const STORAGE_KEY = 'qurandesk:theme'

const mediaQuery = (): MediaQueryList | null =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')

function resolveActive(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return mediaQuery()?.matches ? 'dark' : 'light'
  return pref
}

function applyClass(active: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', active === 'dark')
}

function readPersisted(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

type ThemeState = {
  preference: ThemePreference
  active: 'light' | 'dark'
  setPreference: (pref: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  active: 'light',
  setPreference: (preference) => {
    localStorage.setItem(STORAGE_KEY, preference)
    const active = resolveActive(preference)
    applyClass(active)
    set({ preference, active })
  }
}))

/** Called from main.tsx before first paint. Safe to call once. */
export function initTheme(): void {
  const preference = readPersisted()
  const active = resolveActive(preference)
  applyClass(active)
  useThemeStore.setState({ preference, active })

  // Track system preference changes so 'system' mode follows the OS.
  mediaQuery()?.addEventListener('change', () => {
    const { preference: current } = useThemeStore.getState()
    if (current !== 'system') return
    const next = resolveActive('system')
    applyClass(next)
    useThemeStore.setState({ active: next })
  })
}
