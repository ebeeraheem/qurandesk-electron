import { useEffect, useRef } from 'react'
import { handleEnded, maybePersist, persistNow, setAudioElement, togglePlay } from '../audioEngine'
import { usePlayerStore } from '../stores/player'

/**
 * Mounts a single hidden `<audio>` element at the app root and binds its
 * events back into the player store + persistence.
 */
export default function AudioEngine(): React.JSX.Element {
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setAudioElement(ref.current)
    return () => setAudioElement(null)
  }, [])

  // Belt-and-braces: write playback state once more when the window is closing.
  useEffect(() => {
    const onUnload = (): void => persistNow()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Global shortcut: Space toggles play/pause when a track is loaded.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return

      // Don't hijack typing or the native activation of focused controls
      // (buttons, the seek slider, etc.).
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        el?.isContentEditable
      ) {
        return
      }

      // Only act when a track is actually loaded.
      if (!usePlayerStore.getState().current) return

      e.preventDefault() // stop the page from scrolling on Space
      togglePlay()
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
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
      onPlay={() => {
        usePlayerStore.setState({ status: 'playing', errorMessage: null })
        persistNow()
      }}
      onPause={() => {
        // `ended` fires before `pause`; don't clobber the ended status.
        if (usePlayerStore.getState().status !== 'ended') {
          usePlayerStore.setState({ status: 'paused' })
        }
        persistNow()
      }}
      onTimeUpdate={(e) => {
        usePlayerStore.setState({ position: e.currentTarget.currentTime })
        maybePersist()
      }}
      onEnded={() => {
        usePlayerStore.setState({ status: 'ended' })
        persistNow()
        handleEnded()
      }}
      onError={() =>
        usePlayerStore.setState({
          status: 'error',
          errorMessage: 'Audio failed to load.'
        })
      }
    >
      <track kind="captions" />
    </audio>
  )
}
