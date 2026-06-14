import type { CurrentTrack, PlaybackSpeedValue } from './stores/player'
import { usePlayerStore } from './stores/player'
import { useSettingsStore, updateSettings } from './stores/settings'
import { useDownloadsStore } from './stores/downloads'
import type { RepeatMode, SurahDownload } from '@shared/api'

/**
 * Imperative wrapper around the single `<audio>` element owned by the
 * `AudioEngine` component.
 *
 * Source-of-truth split:
 *  - `usePlayerStore` holds the *displayed* state (track, status, position,
 *    duration, speed, error).
 *  - The `<audio>` element owns the *actual* playback state. Its events are
 *    what update the store.
 *
 * The store and the element are kept in sync via two paths:
 *  - `applySrc(url, seekTo)` pushes a new URL into the element (and queues
 *    it if the element hasn't mounted yet — that race is rare but real).
 *  - `playTrack` / `restoreLastPlayback` go through `applySrc`.
 *
 * Boot order is:
 *   initSettings() →
 *     restoreLastPlayback() : pre-loads last surah at saved offset (no autoplay)
 *   AudioEngine.useEffect()  : setAudioElement → drains pending load if any
 *
 * That means by the time the user presses Play, `audioEl.src` is already set
 * and `audioEl.play()` works as expected.
 */

let audioEl: HTMLAudioElement | null = null
let pendingSrc: { url: string; seekTo: number } | null = null

const PERSIST_INTERVAL_MS = 5_000
let lastPersistAt = 0

// ---------------------------------------------------------------------------
// Element lifecycle
// ---------------------------------------------------------------------------

export function setAudioElement(el: HTMLAudioElement | null): void {
  audioEl = el
  if (!el) return
  el.playbackRate = usePlayerStore.getState().speed
  // Drain a pre-mount restore.
  if (pendingSrc) {
    applySrc(pendingSrc.url, pendingSrc.seekTo)
    pendingSrc = null
  }
}

/**
 * Push a URL into the audio element. When `seekTo > 0`, we seek once
 * metadata is known. If the element isn't mounted yet, queue the load so
 * `setAudioElement` can apply it on mount.
 */
function applySrc(url: string, seekTo: number): void {
  if (!audioEl) {
    pendingSrc = { url, seekTo }
    return
  }
  if (audioEl.src !== url) {
    audioEl.src = url
  }
  if (seekTo > 0) {
    const onMeta = (): void => {
      if (audioEl) audioEl.currentTime = seekTo
    }
    // `once: true` cleans the listener up automatically. Order: this fires
    // before React's onLoadedMetadata, but both reading and writing
    // currentTime are synchronous so the JSX handler's duration update is
    // unaffected.
    audioEl.addEventListener('loadedmetadata', onMeta, { once: true })
    // If metadata is already there (cached / instant), seek now.
    if (audioEl.readyState >= 1) {
      audioEl.currentTime = seekTo
    }
  }
}

// ---------------------------------------------------------------------------
// Restore on boot
// ---------------------------------------------------------------------------

export async function restoreLastPlayback(): Promise<void> {
  const settings = useSettingsStore.getState().settings
  usePlayerStore.setState({ speed: settings.defaultPlaybackSpeed })

  const last = await globalThis.api.getLastPlayback().catch(() => null)
  if (!last) return

  let reciterName = last.reciterId
  try {
    const reciters = await globalThis.api.getReciters()
    const match = reciters.find((r) => r.id === last.reciterId)
    if (match) reciterName = match.name
  } catch {
    /* catalog not ready; fall back to id */
  }

  usePlayerStore.setState({
    current: {
      reciterId: last.reciterId,
      reciterName,
      surahNumber: last.surahNumber
    },
    status: 'idle',
    position: last.positionSeconds,
    duration: 0,
    errorMessage: null
  })

  // Pre-load so `audioEl.src` is real before the user hits play and so
  // `loadedmetadata` fires (populating duration in the UI).
  const url = await globalThis.api.getAudioUrl(last.reciterId, last.surahNumber).catch(() => null)
  if (url) {
    applySrc(url, last.positionSeconds)
  }
}

// ---------------------------------------------------------------------------
// Imperative controls
// ---------------------------------------------------------------------------

export async function playTrack(track: CurrentTrack): Promise<void> {
  usePlayerStore.setState({
    current: track,
    status: 'loading',
    position: 0,
    duration: 0,
    errorMessage: null,
    pendingTrack: null
  })

  let url: string | null
  try {
    url = await globalThis.api.getAudioUrl(track.reciterId, track.surahNumber)
  } catch {
    handleUnavailable(track)
    return
  }
  if (!url) {
    handleUnavailable(track)
    return
  }

  applySrc(url, 0)
  if (audioEl) {
    audioEl.playbackRate = usePlayerStore.getState().speed
    try {
      await audioEl.play()
    } catch (e) {
      usePlayerStore.setState({
        status: 'paused',
        errorMessage: e instanceof Error && e.name !== 'AbortError' ? e.message : null
      })
    }
  }
}

/**
 * Shared "target surah isn't on disk" handler. Called by `playTrack` (which
 * runs for prev/next + row clicks) so manual navigation behaves the same way
 * as auto-advance hitting a gap.
 *
 *  - Always pauses + clears the audio element so the previously-loaded track
 *    doesn't keep playing under a different surah label in the UI.
 *  - In `'download-then-play'` mode: enqueue the surah and stash it as
 *    `pendingTrack`. The `download:completed` bridge picks it up and plays.
 *  - In `'stop'` mode: leave the missing track selected so the player
 *    surfaces can offer download-and-play.
 */
function handleUnavailable(track: CurrentTrack): void {
  if (audioEl) {
    audioEl.pause()
    // Drop the src so a follow-up `togglePlay` doesn't resume the prior file;
    // togglePlay's defensive branch will re-enter `playTrack(current)` instead,
    // landing back here with the same outcome.
    audioEl.removeAttribute('src')
    audioEl.load()
  }

  const mode = useSettingsStore.getState().settings.autoAdvanceMode
  if (mode === 'download-then-play') {
    usePlayerStore.setState({
      status: 'paused',
      pendingTrack: track,
      errorMessage: null
    })
    void enqueuePendingTrack(track).catch(() => {
      usePlayerStore.setState({ pendingTrack: null, status: 'paused', errorMessage: null })
    })
    return
  }

  usePlayerStore.setState({
    status: 'paused',
    pendingTrack: null,
    errorMessage: null
  })
}

async function enqueuePendingTrack(track: CurrentTrack): Promise<void> {
  const status =
    useDownloadsStore.getState().byReciter[track.reciterId]?.[track.surahNumber]?.status
  if (status === 'failed') {
    await globalThis.api.cancelDownload(track.reciterId, track.surahNumber)
  }
  await globalThis.api.downloadSurah(track.reciterId, track.surahNumber)
}

export async function downloadAndPlay(track: CurrentTrack): Promise<void> {
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  usePlayerStore.setState({
    current: track,
    status: 'paused',
    position: 0,
    duration: 0,
    errorMessage: null,
    pendingTrack: track
  })
  try {
    await enqueuePendingTrack(track)
  } catch {
    usePlayerStore.setState({ pendingTrack: null, status: 'paused', errorMessage: null })
  }
}

export async function cancelTrackDownload(track: CurrentTrack): Promise<void> {
  try {
    await globalThis.api.cancelDownload(track.reciterId, track.surahNumber)
  } catch {
    return
  }
  const { pendingTrack } = usePlayerStore.getState()
  if (
    pendingTrack?.reciterId === track.reciterId &&
    pendingTrack.surahNumber === track.surahNumber
  ) {
    usePlayerStore.setState({ pendingTrack: null, status: 'paused', errorMessage: null })
  }
}

export function togglePlay(): void {
  if (!audioEl) return
  // Defensive: if for some reason the element has no src (rare race we don't
  // hit in practice now, but worth guarding), load the current track.
  if (!audioEl.src) {
    const current = usePlayerStore.getState().current
    if (current) void playTrack(current)
    return
  }
  if (audioEl.paused || audioEl.ended) {
    void audioEl.play().catch(() => undefined)
  } else {
    audioEl.pause()
  }
}

export function pause(): void {
  audioEl?.pause()
}

function prepareCurrentForDeletion(matches: (track: CurrentTrack) => boolean): void {
  const { current } = usePlayerStore.getState()
  if (!current || !matches(current)) return
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  usePlayerStore.setState({
    status: 'paused',
    position: 0,
    duration: 0,
    pendingTrack: null,
    errorMessage: null
  })
}

export function prepareSurahForDeletion(reciterId: string, surahNumber: number): void {
  prepareCurrentForDeletion(
    (track) => track.reciterId === reciterId && track.surahNumber === surahNumber
  )
}

export function prepareReciterForDeletion(reciterId: string): void {
  prepareCurrentForDeletion((track) => track.reciterId === reciterId)
}

export function prepareAllDownloadsForDeletion(): void {
  prepareCurrentForDeletion(() => true)
}

export function seekTo(seconds: number): void {
  if (!audioEl) return
  if (!Number.isFinite(seconds)) return
  const current = usePlayerStore.getState().current
  if (!current) return
  const download = useDownloadsStore.getState().byReciter[current.reciterId]?.[current.surahNumber]
  if (download?.status !== 'downloaded') return
  audioEl.currentTime = Math.max(0, seconds)
  usePlayerStore.setState({ position: audioEl.currentTime })
}

export function setSpeed(speed: PlaybackSpeedValue): void {
  if (audioEl) audioEl.playbackRate = speed
  usePlayerStore.setState({ speed })
}

const SPEED_ORDER: PlaybackSpeedValue[] = [0.75, 1, 1.25, 1.5]

export function cycleSpeed(): void {
  const current = usePlayerStore.getState().speed
  const idx = SPEED_ORDER.indexOf(current)
  const next = SPEED_ORDER[(idx + 1) % SPEED_ORDER.length]
  setSpeed(next)
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function canGoPrev(): boolean {
  const c = usePlayerStore.getState().current
  return c != null && c.surahNumber > 1
}

export function canGoNext(): boolean {
  const c = usePlayerStore.getState().current
  return c != null && c.surahNumber < 114
}

export async function playPrev(): Promise<void> {
  const current = usePlayerStore.getState().current
  if (!current || current.surahNumber <= 1) return
  await playTrack({ ...current, surahNumber: current.surahNumber - 1 })
}

export async function playNext(): Promise<void> {
  const current = usePlayerStore.getState().current
  if (!current || current.surahNumber >= 114) return
  await playTrack({ ...current, surahNumber: current.surahNumber + 1 })
}

// ---------------------------------------------------------------------------
// Repeat / continuous play
// ---------------------------------------------------------------------------

/** Off → One → Off. (Repeat-all isn't a useful Qur'an workflow.) */
export function cycleRepeatMode(): void {
  const current = useSettingsStore.getState().settings.repeatMode
  const next: RepeatMode = current === 'off' ? 'one' : 'off'
  void updateSettings({ repeatMode: next })
}

export function handleEnded(): void {
  const { current } = usePlayerStore.getState()
  if (!current) return

  const { repeatMode } = useSettingsStore.getState().settings

  if (repeatMode === 'one') {
    if (audioEl) {
      audioEl.currentTime = 0
      void audioEl.play().catch(() => undefined)
    }
    return
  }

  // Sequential play.
  const nextNum = current.surahNumber + 1
  if (nextNum > 114) return // end of Qur'an; stop cleanly.

  void playTrack({ ...current, surahNumber: nextNum })
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function persistNow(): void {
  const { current, position } = usePlayerStore.getState()
  if (!current) return
  globalThis.api
    .setLastPlayback({
      reciterId: current.reciterId,
      surahNumber: current.surahNumber,
      positionSeconds: position
    })
    .catch(() => undefined)
  lastPersistAt = Date.now()
}

export function maybePersist(): void {
  if (Date.now() - lastPersistAt >= PERSIST_INTERVAL_MS) persistNow()
}

let pendingWired = false
export function initPendingTrackBridge(): void {
  if (pendingWired) return
  pendingWired = true
  globalThis.api.on('download:completed', ({ reciterId, surah }) => {
    const { pendingTrack } = usePlayerStore.getState()
    if (
      pendingTrack &&
      pendingTrack.reciterId === reciterId &&
      pendingTrack.surahNumber === surah
    ) {
      void playTrack(pendingTrack)
    }
  })
  globalThis.api.on('download:progress', (download: SurahDownload) => {
    if (download.status !== 'not_downloaded') return
    const { current } = usePlayerStore.getState()
    if (
      !current ||
      current.reciterId !== download.reciterId ||
      current.surahNumber !== download.surahNumber
    ) {
      return
    }
    if (audioEl) {
      audioEl.pause()
      audioEl.removeAttribute('src')
      audioEl.load()
    }
    usePlayerStore.setState({
      status: 'paused',
      position: 0,
      duration: 0,
      pendingTrack: null,
      errorMessage: null
    })
  })
}
