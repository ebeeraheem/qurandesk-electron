import { create } from 'zustand'

export type PlaybackSpeedValue = 0.75 | 1.0 | 1.25 | 1.5

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export type CurrentTrack = {
  reciterId: string
  reciterName: string
  surahNumber: number
}

type PlayerState = {
  current: CurrentTrack | null
  status: PlayerStatus
  position: number // seconds — driven by audio `timeupdate`
  duration: number // seconds — driven by audio `loadedmetadata`
  speed: PlaybackSpeedValue
  errorMessage: string | null
}

/**
 * Source of truth for "what's playing" and the displayed player state.
 *
 * Imperative audio commands (play/pause/seek/setSpeed) live in
 * `audioEngine.ts` so the store doesn't need to know about the DOM. The
 * AudioEngine component writes back into this store from the underlying
 * `<audio>` element's events.
 */
export const usePlayerStore = create<PlayerState>(() => ({
  current: null,
  status: 'idle',
  position: 0,
  duration: 0,
  speed: 1.0,
  errorMessage: null
}))
