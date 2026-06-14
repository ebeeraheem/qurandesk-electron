import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ReciterSummary } from '@shared/api'
import ReciterAvatar from '../components/ReciterAvatar'
import SurahRow from '../components/SurahRow'
import { useReciterDownloads } from '../stores/downloads'
import { reciterStatusLabel } from '../utils/reciterStatus'

export default function ReciterDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const [reciter, setReciter] = useState<ReciterSummary | null>(null)
  const [notFound, setNotFound] = useState(false)
  const downloads = useReciterDownloads(id)

  const reload = async (reciterId: string): Promise<void> => {
    const list = await globalThis.api.getReciters()
    const found = list.find((item) => item.id === reciterId) ?? null
    setReciter(found)
    setNotFound(!found)
  }

  useEffect(() => {
    if (!id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(id)
    const off1 = globalThis.api.on('manifest:updated', () => void reload(id))
    const off2 = globalThis.api.on('download:completed', () => void reload(id))
    const off3 = globalThis.api.on('library:changed', () => void reload(id))
    return () => {
      off1()
      off2()
      off3()
    }
  }, [id])

  if (notFound) {
    return (
      <div className="px-10 py-8">
        <Link to="/reciters" className="text-sm text-primary hover:underline">
          ← Back to reciters
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Reciter not found</h1>
        <p className="mt-2 text-sm text-muted">This reciter is not in the current catalog.</p>
      </div>
    )
  }

  if (!reciter) return <div className="px-10 py-8 text-sm text-muted">Loading...</div>

  const downloadedCount = downloads.filter((download) => download.status === 'downloaded').length
  const inFlight = downloads.filter(
    (download) =>
      download.status === 'queued' || download.status === 'active' || download.status === 'failed'
  ).length
  const surahsRemaining = 114 - downloadedCount - inFlight
  const liveReciter: ReciterSummary = {
    ...reciter,
    downloadedSurahs: downloadedCount,
    downloadState: downloadedCount === 0 ? 'none' : downloadedCount >= 114 ? 'complete' : 'partial'
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
            <p
              className={[
                'mt-1 text-sm',
                liveReciter.downloadState === 'complete' ? 'text-success' : 'text-muted'
              ].join(' ')}
            >
              {reciterStatusLabel(liveReciter)}
              {inFlight > 0 && <span className="ml-2 text-primary">· {inFlight} in progress</span>}
            </p>
          </div>
          <BulkDownloadAction
            downloadedCount={downloadedCount}
            inFlight={inFlight}
            surahsRemaining={surahsRemaining}
            onDownload={() => globalThis.api.downloadReciter(reciter.id)}
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
          {downloads.map((download) => (
            <li key={download.surahNumber}>
              <SurahRow download={download} reciterId={reciter.id} reciterName={reciter.name} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function BulkDownloadAction({
  downloadedCount,
  inFlight,
  surahsRemaining,
  onDownload
}: Readonly<{
  downloadedCount: number
  inFlight: number
  surahsRemaining: number
  onDownload: () => Promise<void>
}>): React.JSX.Element | null {
  if (downloadedCount >= 114) return null
  if (surahsRemaining === 0) {
    return (
      <div className="rounded-full bg-bg-tint px-5 py-2 text-xs font-semibold text-primary">
        Downloading {inFlight}...
      </div>
    )
  }

  const label =
    downloadedCount > 0 || inFlight > 0
      ? `Download remaining ${surahsRemaining}`
      : 'Download all 114'
  return (
    <button
      onClick={() => void onDownload()}
      className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
    >
      {label}
    </button>
  )
}
