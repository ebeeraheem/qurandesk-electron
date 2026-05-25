import { useEffect } from 'react'
import { create } from 'zustand'
import type { QueueEntry, SurahDownload } from '@shared/api'

/**
 * Renderer-side mirror of the downloader state, hydrated lazily per-reciter
 * and updated live via the `download:progress` / `download:completed` events.
 *
 * Components shouldn't call window.api.getSurahDownloads directly — they
 * `useReciterDownloads(reciterId)` instead, which handles the hydration and
 * keeps the store consistent on re-mount.
 */

type DownloadsState = {
  /** Per-reciter, per-surah state. Sparse — only populated entries live here. */
  byReciter: Record<string, Record<number, SurahDownload>>
  /** Reciters whose `getSurahDownloads` has been requested at least once. */
  hydrated: Set<string>
  /** Flat queue mirror — populated when the Downloads page subscribes. */
  queue: QueueEntry[]
  /** Whether pause-all is toggled. */
  paused: boolean
}

export const useDownloadsStore = create<DownloadsState>(() => ({
  byReciter: {},
  hydrated: new Set(),
  queue: [],
  paused: false
}))

/** Replace one reciter's full download map atomically. */
function setReciter(reciterId: string, downloads: SurahDownload[]): void {
  useDownloadsStore.setState((s) => {
    const map: Record<number, SurahDownload> = {}
    for (const d of downloads) map[d.surahNumber] = d
    const hydrated = new Set(s.hydrated)
    hydrated.add(reciterId)
    return {
      byReciter: { ...s.byReciter, [reciterId]: map },
      hydrated
    }
  })
}

/** Merge a single progress event into the per-reciter map. */
function applyProgress(p: SurahDownload): void {
  useDownloadsStore.setState((s) => {
    const map = { ...(s.byReciter[p.reciterId] ?? {}) }
    if (p.status === 'not_downloaded') {
      delete map[p.surahNumber]
    } else {
      map[p.surahNumber] = p
    }
    // Update queue mirror too.
    let queue = s.queue
    const i = queue.findIndex(
      (q) => q.reciterId === p.reciterId && q.surahNumber === p.surahNumber
    )
    if (p.status === 'queued' || p.status === 'active' || p.status === 'failed') {
      const entry: QueueEntry = {
        reciterId: p.reciterId,
        surahNumber: p.surahNumber,
        status: p.status,
        progressBytes: p.progressBytes ?? 0,
        totalBytes: p.totalBytes ?? 0,
        error: null,
        // Preserve original createdAt so ordering is stable; default to now if new.
        createdAt: i >= 0 ? queue[i].createdAt : Date.now()
      }
      queue = i >= 0 ? queue.map((q, idx) => (idx === i ? entry : q)) : [...queue, entry]
    } else if (i >= 0) {
      queue = queue.filter((_, idx) => idx !== i)
    }
    return { byReciter: { ...s.byReciter, [p.reciterId]: map }, queue }
  })
}

/** Mark a surah as downloaded — fires after `download:completed`. */
function applyCompleted({ reciterId, surah }: { reciterId: string; surah: number }): void {
  useDownloadsStore.setState((s) => {
    const map = { ...(s.byReciter[reciterId] ?? {}) }
    map[surah] = { reciterId, surahNumber: surah, status: 'downloaded' }
    return {
      byReciter: { ...s.byReciter, [reciterId]: map },
      queue: s.queue.filter((q) => !(q.reciterId === reciterId && q.surahNumber === surah))
    }
  })
}

// ---------------------------------------------------------------------------
// Lifecycle — initialise once on app mount.
// ---------------------------------------------------------------------------

let wired = false

/** Wire the global event subscriptions. Idempotent — safe to call from App. */
export function initDownloadsBridge(): void {
  if (wired) return
  wired = true
  window.api.on('download:progress', (p) => applyProgress(p))
  window.api.on('download:completed', (p) => applyCompleted(p))
  void window.api.isPaused().then((paused) => useDownloadsStore.setState({ paused }))
  void window.api.getActiveQueue().then((queue) => useDownloadsStore.setState({ queue }))
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the 114-entry array for a reciter, hydrating from IPC on first use. */
export function useReciterDownloads(reciterId: string | undefined): SurahDownload[] {
  const map = useDownloadsStore((s) => (reciterId ? s.byReciter[reciterId] : undefined))
  const hydrated = useDownloadsStore((s) =>
    reciterId ? s.hydrated.has(reciterId) : false
  )

  useEffect(() => {
    if (!reciterId || hydrated) return
    void window.api.getSurahDownloads(reciterId).then((d) => setReciter(reciterId, d))
  }, [reciterId, hydrated])

  if (!reciterId || !map) {
    // Stable default while loading — caller treats everything as not_downloaded.
    return DEFAULT_DOWNLOADS
  }
  // Materialise the 114-entry array preserving status from the store.
  return Array.from({ length: 114 }, (_, i) => {
    const n = i + 1
    return (
      map[n] ?? {
        reciterId,
        surahNumber: n,
        status: 'not_downloaded' as const
      }
    )
  })
}

const DEFAULT_DOWNLOADS: SurahDownload[] = Array.from({ length: 114 }, (_, i) => ({
  reciterId: '',
  surahNumber: i + 1,
  status: 'not_downloaded' as const
}))
