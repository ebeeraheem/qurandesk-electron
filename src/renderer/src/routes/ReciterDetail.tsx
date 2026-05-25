import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ReciterSummary, SurahDownload } from '@shared/api'
import ReciterAvatar from '../components/ReciterAvatar'
import SurahRow from '../components/SurahRow'
import { formatBytes } from '../utils/format'

export default function ReciterDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const [reciter, setReciter] = useState<ReciterSummary | null>(null)
  const [downloads, setDownloads] = useState<SurahDownload[]>([])
  const [notFound, setNotFound] = useState(false)

  const reload = async (reciterId: string): Promise<void> => {
    const [list, dl] = await Promise.all([
      window.api.getReciters(),
      window.api.getSurahDownloads(reciterId)
    ])
    const found = list.find((r) => r.id === reciterId) ?? null
    setReciter(found)
    setDownloads(dl)
    if (!found) setNotFound(true)
  }

  useEffect(() => {
    if (!id) return
    void reload(id)
    // Re-fetch whenever the manifest changes (e.g. background refresh, refresh button).
    const unsubscribe = window.api.on('manifest:updated', () => void reload(id))
    return unsubscribe
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
              {reciter.style ?? '—'} · {formatBytes(reciter.totalSizeBytes)} · {reciter.downloadedSurahs}{' '}
              / 114 on disk
            </p>
          </div>
          <AggregateButton reciter={reciter} />
        </div>
      </header>

      <section className="mt-2 rounded-xl border border-border bg-bg-elev">
        <div className="grid grid-cols-[44px_1fr_auto_44px] gap-4 border-b border-border px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
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
    </div>
  )
}

/**
 * Header CTA. Phase 5 renders the three states (Download all / Resume /
 * Downloaded) but the buttons that trigger downloads are disabled until the
 * downloader lands in Phase 6.
 */
function AggregateButton({ reciter }: { reciter: ReciterSummary }): React.JSX.Element {
  switch (reciter.downloadState) {
    case 'complete':
      return (
        <div className="flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-xs font-semibold text-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4">
            <path d="m5 12 5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Downloaded
        </div>
      )
    case 'partial':
      return (
        <button
          disabled
          title="Resume downloads (coming in Phase 6)"
          className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          Resume · {114 - reciter.downloadedSurahs} left
        </button>
      )
    default:
      return (
        <button
          disabled
          title="Download all (coming in Phase 6)"
          className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          Download all 114
        </button>
      )
  }
}
