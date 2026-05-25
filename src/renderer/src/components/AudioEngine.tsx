import { useEffect, useRef } from 'react'
import { setAudioElement } from '../audioEngine'
import { usePlayerStore } from '../stores/player'

/**
 * Mounts a single hidden `<audio>` element at the app root and binds its
 * events back into the player store. Imperative control lives in
 * `audioEngine.ts` — components call `playTrack` / `togglePlay` / `seekTo`
 * there rather than touching the DOM element directly.
 */
export default function AudioEngine(): React.JSX.Element {
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setAudioElement(ref.current)
    return () => setAudioElement(null)
  }, [])

  return (
    <audio
      ref={ref}
      preload="metadata"
      onLoadedMetadata={(e) => {
        usePlayerStore.setState({
          duration: e.currentTarget.duration,
          status: e.currentTarget.paused ? 'paused' : 'playing'
        })
      }}
      onPlay={() => usePlayerStore.setState({ status: 'playing', errorMessage: null })}
      onPause={() => {
        // Don't overwrite an 'ended' status — ended fires before pause in some browsers.
        if (usePlayerStore.getState().status !== 'ended') {
          usePlayerStore.setState({ status: 'paused' })
        }
      }}
      onTimeUpdate={(e) => {
        usePlayerStore.setState({ position: e.currentTarget.currentTime })
      }}
      onEnded={() => usePlayerStore.setState({ status: 'ended' })}
      onError={() =>
        usePlayerStore.setState({
          status: 'error',
          errorMessage: 'Audio failed to load.'
        })
      }
    />
  )
}
