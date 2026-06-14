import { useEffect } from 'react'
import { create } from 'zustand'
import type { LibrarySnapshot, QueueEntry, SurahDownload } from '@shared/api'

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
  refreshing: boolean
}

export const useDownloadsStore = create<DownloadsState>(() => ({
  byReciter: {},
  hydrated: new Set(),
  queue: [],
  refreshing: false
}))

let liveRevision = 0
let refreshPromise: Promise<void> | null = null

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
  liveRevision++
  useDownloadsStore.setState((s) => {
    const map = { ...s.byReciter[p.reciterId] }
    if (p.status === 'not_downloaded') {
      delete map[p.surahNumber]
    } else {
      map[p.surahNumber] = p
    }
    // Update queue mirror too.
    let queue = s.queue
    const i = queue.findIndex((q) => q.reciterId === p.reciterId && q.surahNumber === p.surahNumber)
    if (p.status === 'queued' || p.status === 'active' || p.status === 'failed') {
      const entry: QueueEntry = {
        reciterId: p.reciterId,
        surahNumber: p.surahNumber,
        status: p.status,
        progressBytes: p.progressBytes ?? 0,
        totalBytes: p.totalBytes ?? 0,
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
  liveRevision++
  useDownloadsStore.setState((s) => {
    const map = { ...s.byReciter[reciterId] }
    map[surah] = { reciterId, surahNumber: surah, status: 'downloaded' }
    return {
      byReciter: { ...s.byReciter, [reciterId]: map },
      queue: s.queue.filter((q) => !(q.reciterId === reciterId && q.surahNumber === surah))
    }
  })
}

function applySnapshot(snapshot: LibrarySnapshot): void {
  useDownloadsStore.setState((s) => {
    const byReciter: Record<string, Record<number, SurahDownload>> = {}
    for (const download of snapshot.downloads) {
      const map = byReciter[download.reciterId] ?? {}
      map[download.surahNumber] = download
      byReciter[download.reciterId] = map
    }
    for (const entry of snapshot.queue) {
      const map = byReciter[entry.reciterId] ?? {}
      map[entry.surahNumber] = {
        reciterId: entry.reciterId,
        surahNumber: entry.surahNumber,
        status: entry.status,
        progressBytes: entry.progressBytes,
        totalBytes: entry.totalBytes
      }
      byReciter[entry.reciterId] = map
    }
    return { byReciter, queue: snapshot.queue, hydrated: new Set(s.hydrated) }
  })
}

export function refreshLibraryState(): Promise<void> {
  if (refreshPromise) return refreshPromise
  useDownloadsStore.setState({ refreshing: true })
  refreshPromise = (async () => {
    while (true) {
      const revision = liveRevision
      const snapshot = await globalThis.api.refreshLibrary()
      if (revision !== liveRevision) continue
      applySnapshot(snapshot)
      return
    }
  })().finally(() => {
    refreshPromise = null
    useDownloadsStore.setState({ refreshing: false })
  })
  return refreshPromise
}

// ---------------------------------------------------------------------------
// Lifecycle — initialise once on app mount.
// ---------------------------------------------------------------------------

let wired = false

/** Wire the global event subscriptions. Idempotent — safe to call from App. */
export function initDownloadsBridge(): void {
  if (wired) return
  wired = true
  globalThis.api.on('download:progress', (p: SurahDownload) => applyProgress(p))
  globalThis.api.on('download:completed', (p: { reciterId: string; surah: number }) =>
    applyCompleted(p)
  )
  globalThis.api.getActiveQueue().then((queue) => useDownloadsStore.setState({ queue }))
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the 114-entry array for a reciter, hydrating from IPC on first use. */
export function useReciterDownloads(reciterId: string | undefined): SurahDownload[] {
  const map = useDownloadsStore((s) => (reciterId ? s.byReciter[reciterId] : undefined))
  const hydrated = useDownloadsStore((s) => (reciterId ? s.hydrated.has(reciterId) : false))

  useEffect(() => {
    if (!reciterId || hydrated) return
    globalThis.api
      .getSurahDownloads(reciterId)
      .then((d: SurahDownload[]) => setReciter(reciterId, d))
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

export function useTrackDownload(
  reciterId: string | undefined,
  surahNumber: number | undefined
): SurahDownload | null {
  const downloads = useReciterDownloads(reciterId)
  if (!reciterId || !surahNumber) return null
  return downloads[surahNumber - 1] ?? null
}

const DEFAULT_DOWNLOADS: SurahDownload[] = Array.from({ length: 114 }, (_, i) => ({
  reciterId: '',
  surahNumber: i + 1,
  status: 'not_downloaded' as const
}))
