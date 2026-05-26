import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ReciterSummary, StorageUsage } from '@shared/api'
import ReciterAvatar from '../components/ReciterAvatar'
import SurahRow from '../components/SurahRow'
import ConfirmDownloadDialog from '../components/ConfirmDownloadDialog'
import { formatBytes } from '../utils/format'
import { useReciterDownloads } from '../stores/downloads'

export default function ReciterDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const [reciter, setReciter] = useState<ReciterSummary | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const downloads = useReciterDownloads(id)

  const reload = async (reciterId: string): Promise<void> => {
    const list = await globalThis.api.getReciters()
    const found = list.find((r: { id: string }) => r.id === reciterId) ?? null
    setReciter(found)
    if (!found) setNotFound(true)
  }

  useEffect(() => {
    if (!id) return
    // Fetch-on-mount; the subsequent IPC subscriptions also drive setState in
    // their callbacks, which is exactly what those events are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(id)
    const off1 = globalThis.api.on('manifest:updated', () => void reload(id))
    const off2 = globalThis.api.on('download:completed', () => void reload(id))
    return () => {
      off1()
      off2()
    }
  }, [id])

  if (notFound) {
    return (
      <div className="px-10 py-8">
        <Link to="/reciters" className="text-sm text-primary hover:underline">
          ← Back to reciters
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Reciter not found</h1>
        <p className="mt-2 text-sm text-muted">
          The catalog has no reciter with id <span className="font-mono">{id}</span>.
        </p>
      </div>
    )
  }

  if (!reciter) {
    return <div className="px-10 py-8 text-sm text-muted">Loading…</div>
  }

  // Aggregate live counts from the downloads store.
  const downloadedCount = downloads.filter((d) => d.status === 'downloaded').length
  const inFlight = downloads.filter(
    (d) => d.status === 'queued' || d.status === 'active' || d.status === 'failed'
  ).length
  const surahsRemaining = 114 - downloadedCount - inFlight

  // Per-surah estimate from the full-set total (manifest doesn't carry per-surah sizes).
  const estimatedBytes =
    reciter.totalSizeBytes != null && surahsRemaining > 0
      ? Math.round((reciter.totalSizeBytes * surahsRemaining) / 114)
      : undefined

  const openDialog = async (): Promise<void> => {
    try {
      setUsage(await globalThis.api.getStorageUsage())
    } catch {
      setUsage(null)
    }
    setDialogOpen(true)
  }

  return (
    <div className="px-10 py-8">
      <div className="app-drag pb-3">
        <Link to="/reciters" className="app-no-drag text-sm text-primary hover:underline">
          ← Back to reciters
        </Link>
      </div>

      <header className="flex items-end gap-6 pb-6">
        <ReciterAvatar reciter={reciter} className="h-32 w-32 shrink-0" />
        <div className="flex min-w-0 flex-1 items-end justify-between gap-6 pb-1">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold">{reciter.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {reciter.style ?? '—'} · {formatBytes(reciter.totalSizeBytes)} · {downloadedCount} /
              114
              {inFlight > 0 && <span className="ml-1 text-primary">({inFlight} in progress)</span>}
            </p>
          </div>
          <AggregateButton
            downloadedCount={downloadedCount}
            inFlight={inFlight}
            surahsRemaining={surahsRemaining}
            onClick={openDialog}
          />
        </div>
      </header>

      <section className="mt-2 rounded-xl border border-border bg-bg-elev">
        <div className="grid grid-cols-[44px_1fr_auto_84px] gap-4 border-b border-border px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
          <div className="text-right">#</div>
          <div>Surah</div>
          <div className="text-right">العربية</div>
          <div />
        </div>
        <ol className="divide-y divide-border">
          {downloads.map((d) => (
            <li key={d.surahNumber}>
              <SurahRow download={d} reciterId={reciter.id} reciterName={reciter.name} />
            </li>
          ))}
        </ol>
      </section>

      <ConfirmDownloadDialog
        open={dialogOpen}
        reciterName={reciter.name}
        surahsRemaining={surahsRemaining}
        estimatedBytes={estimatedBytes}
        freeBytes={usage?.freeBytes}
        totalBytes={usage?.totalBytes}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => {
          setDialogOpen(false)
          globalThis.api.downloadReciter(reciter.id)
        }}
      />
    </div>
  )
}

function AggregateButton({
  downloadedCount,
  inFlight,
  surahsRemaining,
  onClick
}: Readonly<{
  downloadedCount: number
  inFlight: number
  surahsRemaining: number
  onClick: () => void
}>): React.JSX.Element {
  if (downloadedCount >= 114) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-xs font-semibold text-success">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="size-4"
        >
          <path d="m5 12 5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Downloaded
      </div>
    )
  }

  // Nothing left to add to the queue — already covered by in-flight items.
  if (surahsRemaining === 0) {
    return (
      <div className="rounded-full bg-bg-tint px-5 py-2 text-xs font-semibold text-primary">
        Downloading {inFlight}…
      </div>
    )
  }

  let label: string
  if (inFlight > 0) {
    label = `Add ${surahsRemaining} more`
  } else if (downloadedCount > 0) {
    label = `Resume · ${surahsRemaining} left`
  } else {
    label = 'Download all 114'
  }

  return (
    <button
      onClick={onClick}
      className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
    >
      {label}
    </button>
  )
}
