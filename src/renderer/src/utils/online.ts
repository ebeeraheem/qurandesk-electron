import { useEffect, useState } from 'react'

/**
 * Tracks `navigator.onLine` and the matching window events. Not perfectly
 * reliable (a connected wifi network can still be unreachable) but it's the
 * standard signal browsers offer, and good enough to drive the offline banner.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  useEffect(() => {
    const goOnline = (): void => setOnline(true)
    const goOffline = (): void => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
