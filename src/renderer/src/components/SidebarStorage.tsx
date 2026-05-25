import { useEffect, useState } from 'react'
import type { StorageUsage } from '@shared/api'
import { formatBytes } from '../utils/format'

/**
 * Bottom-of-sidebar block. Polls on a slow interval and re-fetches whenever
 * a download completes — that's the only event that meaningfully shifts the
 * "used by QuranDesk" number for the typical user.
 */
export default function SidebarStorage(): React.JSX.Element {
  const [usage, setUsage] = useState<StorageUsage | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      try {
        const u = await window.api.getStorageUsage()
        if (!cancelled) setUsage(u)
      } catch {
        if (!cancelled) setUsage(null)
      }
    }
    void refresh()
    const off = window.api.on('download:completed', () => void refresh())
    // Sanity poll every 30s — covers external deletions / disk filling up.
    const interval = window.setInterval(() => void refresh(), 30_000)
    return () => {
      cancelled = true
      off()
      window.clearInterval(interval)
    }
  }, [])

  if (!usage || usage.totalBytes === 0) {
    return (
      <div className="px-5 py-5">
        <div className="text-[10px] font-semibold tracking-widest text-faint">STORAGE</div>
        <div className="mt-2 text-xs text-muted">—</div>
        <div className="mt-2 h-1 w-full rounded-full bg-bg-elev" />
      </div>
    )
  }

  const usedByOther = Math.max(0, usage.totalBytes - usage.freeBytes - usage.appUsedBytes)
  const appPct = usage.totalBytes > 0 ? (usage.appUsedBytes / usage.totalBytes) * 100 : 0
  const otherPct = usage.totalBytes > 0 ? (usedByOther / usage.totalBytes) * 100 : 0

  return (
    <div
      className="px-5 py-5"
      title={`Used by QuranDesk: ${formatBytes(usage.appUsedBytes)}\nUsed by other apps: ${formatBytes(usedByOther)}\nFree: ${formatBytes(usage.freeBytes)}`}
    >
      <div className="text-[10px] font-semibold tracking-widest text-faint">STORAGE</div>
      <div className="mt-2 text-xs text-muted">
        <span className="font-semibold text-fg">{formatBytes(usage.appUsedBytes)}</span> of{' '}
        {formatBytes(usage.totalBytes)}
      </div>
      <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-bg-elev">
        {/* QuranDesk slice — primary purple. */}
        <div className="h-full bg-primary transition-all" style={{ width: `${appPct}%` }} />
        {/* Other apps slice — muted, sits on top to show how full the disk is. */}
        <div className="h-full bg-muted/40 transition-all" style={{ width: `${otherPct}%` }} />
      </div>
    </div>
  )
}
