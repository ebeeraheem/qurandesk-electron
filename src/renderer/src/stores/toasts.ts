import { create } from 'zustand'
import { getSurah } from '@shared/surahs'

/**
 * Lightweight toast queue. Components call `pushToast` from anywhere; the
 * `<Toaster />` mounted at the app root renders them and auto-dismisses
 * after `durationMs`.
 *
 * The bridge subscribes to main-side events that warrant a toast — currently
 * `download:reverted`, which fires when the downloader notices a row whose
 * file vanished from disk and cleans it up.
 */

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export type Toast = {
  id: string
  kind: ToastKind
  message: string
  /** Milliseconds before auto-dismissal. 0 disables auto-dismissal. */
  durationMs: number
}

type ToastsState = {
  toasts: Toast[]
}

export const useToastsStore = create<ToastsState>(() => ({ toasts: [] }))

let counter = 0

export function pushToast(input: {
  kind?: ToastKind
  message: string
  durationMs?: number
}): string {
  const id = `t${++counter}`
  const toast: Toast = {
    id,
    kind: input.kind ?? 'info',
    message: input.message,
    durationMs: input.durationMs ?? 5000
  }
  useToastsStore.setState((s) => ({ toasts: [...s.toasts, toast] }))
  if (toast.durationMs > 0) {
    setTimeout(() => dismissToast(id), toast.durationMs)
  }
  return id
}

export function dismissToast(id: string): void {
  useToastsStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

let wired = false

/** Subscribes to main-side events that should produce a toast. */
export function initToastsBridge(): void {
  if (wired) return
  wired = true

  globalThis.api.on('download:reverted', ({ surahNumber }) => {
    const name = getSurah(surahNumber)?.name_en ?? `Surah ${surahNumber}`
    pushToast({
      kind: 'error',
      message: `${name} was missing from disk. Removed from your library.`,
      durationMs: 7000
    })
  })
}
