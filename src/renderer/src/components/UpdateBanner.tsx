import { useUpdaterStore } from '../stores/updater'

/** Quiet until an update is fully downloaded and ready to install. */
export default function UpdateBanner(): React.JSX.Element | null {
  const status = useUpdaterStore((s) => s.status)

  if (status.status !== 'ready') return null

  return (
    <div className="flex items-center justify-center bg-success/15 px-4 py-2 text-xs text-success">
      <span className="font-semibold">Update {status.version} is ready.</span>
      <button
        onClick={() => globalThis.api.installUpdateOnQuit()}
        className="ml-3 rounded-full bg-fg/90 px-3 py-1 text-xs font-semibold text-bg hover:bg-fg"
      >
        Restart
      </button>
      <span className="ml-2 text-fg/60">or close the app to apply later.</span>
    </div>
  )
}
