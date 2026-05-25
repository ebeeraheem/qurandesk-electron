import type { CurrentTrack, PlaybackSpeedValue } from './stores/player'
import { usePlayerStore } from './stores/player'

/**
 * Imperative wrapper around the single `<audio>` element owned by the
 * `AudioEngine` component. Centralises the "load a URL, then play" dance so
 * callers in the UI don't have to await the IPC themselves.
 *
 * Phase 5 implements: load + play, pause/resume toggle, seek, speed.
 * Phase 8 will add: continuous play (auto-advance), persistence of last
 * position, expanded Now Playing view, prev/next surah handling.
 */

let audioEl: HTMLAudioElement | null = null

export function setAudioElement(el: HTMLAudioElement | null): void {
  audioEl = el
  // Apply the current speed when the element first mounts.
  if (el) el.playbackRate = usePlayerStore.getState().speed
}

/**
 * Load a surah and play it. Optimistic: updates the store before the URL
 * resolves so the player bar shows the new track immediately.
 */
export async function playTrack(track: CurrentTrack): Promise<void> {
  usePlayerStore.setState({
    current: track,
    status: 'loading',
    position: 0,
    duration: 0,
    errorMessage: null
  })

  let url: string | null
  try {
    url = await window.api.getAudioUrl(track.reciterId, track.surahNumber)
  } catch (e) {
    usePlayerStore.setState({
      status: 'error',
      errorMessage: e instanceof Error ? e.message : String(e)
    })
    return
  }

  if (!url) {
    usePlayerStore.setState({
      status: 'error',
      errorMessage: 'File is not on disk yet.'
    })
    return
  }

  if (!audioEl) return // engine not mounted yet — bail; user can retry
  audioEl.src = url
  audioEl.playbackRate = usePlayerStore.getState().speed
  try {
    await audioEl.play()
  } catch (e) {
    // Browsers throw if autoplay is blocked or the load is interrupted.
    // We still want the source loaded so the user can press play themselves.
    usePlayerStore.setState({
      status: 'paused',
      errorMessage: e instanceof Error && e.name !== 'AbortError' ? e.message : null
    })
  }
}

export function togglePlay(): void {
  if (!audioEl) return
  if (audioEl.paused || audioEl.ended) {
    void audioEl.play().catch(() => {
      /* surfaced by onError */
    })
  } else {
    audioEl.pause()
  }
}

export function pause(): void {
  audioEl?.pause()
}

/** Seek to an absolute position in seconds. */
export function seekTo(seconds: number): void {
  if (!audioEl) return
  if (!Number.isFinite(seconds)) return
  audioEl.currentTime = Math.max(0, seconds)
  // Push an immediate position update so the scrubber doesn't snap back to the
  // old value before the audio element catches up on the next `timeupdate`.
  usePlayerStore.setState({ position: audioEl.currentTime })
}

export function setSpeed(speed: PlaybackSpeedValue): void {
  if (audioEl) audioEl.playbackRate = speed
  usePlayerStore.setState({ speed })
}

const SPEED_ORDER: PlaybackSpeedValue[] = [0.75, 1.0, 1.25, 1.5]

export function cycleSpeed(): void {
  const current = usePlayerStore.getState().speed
  const idx = SPEED_ORDER.indexOf(current)
  const next = SPEED_ORDER[(idx + 1) % SPEED_ORDER.length]
  setSpeed(next)
}
