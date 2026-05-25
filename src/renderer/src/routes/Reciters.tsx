import { useEffect, useState } from 'react'

/**
 * Catalog page — currently a bootstrap placeholder that proves the IPC bridge works.
 * Phase 3 will replace this with the manifest-driven reciter grid.
 */
export default function Reciters(): React.JSX.Element {
  const [pingResult, setPingResult] = useState<string>('…')
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null)

  useEffect(() => {
    window.api.ping().then(setPingResult).catch((e: Error) => setPingResult(`error: ${e.message}`))
    window.api.getAppInfo().then(setAppInfo).catch(() => setAppInfo(null))
  }, [])

  return (
    <div className="px-10 py-8">
      <div className="app-drag pb-4">
        <h1 className="text-3xl font-bold">Reciters</h1>
        <p className="text-sm text-muted">
          0 reciters · catalog will load here once the manifest is wired
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-bg-elev px-6 py-5">
        <div className="text-[10px] font-semibold tracking-widest text-faint">BOOTSTRAP CHECK</div>
        <div className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-muted">IPC ping</div>
          <div className="font-mono text-success">{pingResult}</div>
          <div className="text-muted">App version</div>
          <div className="font-mono">{appInfo?.version ?? '—'}</div>
          <div className="text-muted">Platform</div>
          <div className="font-mono">{appInfo?.platform ?? '—'}</div>
        </div>
        <p className="mt-4 text-xs text-muted">
          When all three rows read sensibly, the main ↔ preload ↔ renderer bridge is healthy.
        </p>
      </div>
    </div>
  )
}
