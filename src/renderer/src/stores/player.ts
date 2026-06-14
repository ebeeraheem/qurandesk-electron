import { create } from 'zustand'

export type PlaybackSpeedValue = 0.75 | 1 | 1.25 | 1.5

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export type CurrentTrack = {
  reciterId: string
  reciterName: string
  surahNumber: number
}

type PlayerState = {
  current: CurrentTrack | null
  status: PlayerStatus
  /** Seconds — driven by audio `timeupdate`. */
  position: number
  /** Seconds — driven by audio `loadedmetadata`. */
  duration: number
  speed: PlaybackSpeedValue
  errorMessage: string | null
  /**
   * Set when the selected track should play after its priority download
   * completes. Cleared whenever the user manually moves the track or cancels.
   */
  pendingTrack: CurrentTrack | null
}

export const usePlayerStore = create<PlayerState>(() => ({
  current: null,
  status: 'idle',
  position: 0,
  duration: 0,
  speed: 1,
  errorMessage: null,
  pendingTrack: null
}))
