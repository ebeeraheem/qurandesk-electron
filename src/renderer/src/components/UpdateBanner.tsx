import { useUpdaterStore } from '../stores/updater'

/**
 * Thin strip across the top of the app shell when an update is in flight or
 * ready to install. Hidden when status is `up-to-date` or `error` (errors
 * surface in Settings → About instead, so a flaky network doesn't badger the
 * user every 6 hours).
 */
export default function UpdateBanner(): React.JSX.Element | null {
  const status = useUpdaterStore((s) => s.status)

  if (status.status === 'up-to-date' || status.status === 'error') return null

  if (status.status === 'available') {
    return (
      <Bar tone="info">
        <span className="font-semibold">Update {status.version} found</span>
        <span className="ml-2 text-fg/70">— downloading in the background…</span>
      </Bar>
    )
  }

  if (status.status === 'downloading') {
    return (
      <Bar tone="info">
        <span className="font-semibold">Downloading update…</span>
        <span className="ml-2 text-fg/70">{Math.round(status.percent)}%</span>
      </Bar>
    )
  }

  // status === 'ready'
  return (
    <Bar tone="success">
      <span className="font-semibold">Update {status.version} is ready.</span>
      <button
        onClick={() => void window.api.installUpdateOnQuit()}
        className="ml-3 rounded-full bg-fg/90 px-3 py-1 text-xs font-semibold text-bg hover:bg-fg"
      >
        Restart to install
      </button>
      <span className="ml-2 text-fg/60">or close the app to apply later.</span>
    </Bar>
  )
}

function Bar({
  tone,
  children
}: {
  tone: 'info' | 'success'
  children: React.ReactNode
}): React.JSX.Element {
  const bg = tone === 'success' ? 'bg-success/15 text-success' : 'bg-bg-tint text-primary'
  return (
    <div className={['flex items-center justify-center px-4 py-2 text-xs', bg].join(' ')}>
      {children}
    </div>
  )
}
