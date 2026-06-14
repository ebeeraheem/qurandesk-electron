import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { QueueEntry, ReciterSummary, StorageUsage } from '@shared/api'
import { getSurah } from '@shared/surahs'
import ReciterAvatar from '../components/ReciterAvatar'
import { refreshLibraryState, useDownloadsStore } from '../stores/downloads'
import { formatBytes } from '../utils/format'
import ConfirmationDialog from '../components/ConfirmationDialog'
import { prepareReciterForDeletion } from '../audioEngine'
import { reciterStatusLabel } from '../utils/reciterStatus'

export default function Downloads(): React.JSX.Element {
  const queue = useDownloadsStore((s) => s.queue)
  const refreshing = useDownloadsStore((s) => s.refreshing)
  const [reciters, setReciters] = useState<ReciterSummary[]>([])
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)

  const reload = async (): Promise<void> => {
    try {
      const [list, u] = await Promise.all([
        globalThis.api.getReciters(),
        globalThis.api.getStorageUsage().catch(() => null)
      ])
      setReciters(list)
      setUsage(u)
    } catch (error) {
      void globalThis.api
        .reportDiagnostic(
          'renderer/downloads-reload',
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        )
        .catch(() => undefined)
    }
  }

  const refresh = async (): Promise<void> => {
    setRefreshFailed(false)
    try {
      await refreshLibraryState()
      await reload()
    } catch {
      setRefreshFailed(true)
    }
  }

  useEffect(() => {
    // Fetch-on-mount + subscribe-to-events. The store updates inside reload()
    // are exactly the synchronisation the effect exists to perform.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    const off1 = globalThis.api.on('manifest:updated', () => void reload())
    const off2 = globalThis.api.on('download:completed', () => void reload())
    const off3 = globalThis.api.on('library:changed', () => void reload())
    return () => {
      off1()
      off2()
      off3()
    }
  }, [])

  const reciterById = useMemo(() => {
    const m = new Map<string, ReciterSummary>()
    for (const r of reciters) m.set(r.id, r)
    return m
  }, [reciters])

  const activeEntries = useMemo(() => queue.filter((q) => q.status !== 'failed'), [queue])
  const failedEntries = useMemo(() => queue.filter((q) => q.status === 'failed'), [queue])

  // Group only work that can still progress; preserve insertion order.
  const activeByReciter = useMemo(() => {
    const m = new Map<string, QueueEntry[]>()
    for (const q of activeEntries) {
      const list = m.get(q.reciterId) ?? []
      list.push(q)
      m.set(q.reciterId, list)
    }
    return m
  }, [activeEntries])

  const onDeviceReciters = reciters.filter((r) => r.downloadState !== 'none')

  return (
    <div className="px-10 py-8">
      <header className="app-drag flex items-start justify-between gap-4 pb-6">
        <div>
          <h1 className="text-3xl font-bold">Downloads</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-fg">
              {usage ? formatBytes(usage.appUsedBytes) : '—'}
            </span>{' '}
            used by QuranDesk
            {activeEntries.length > 0 && (
              <span className="ml-2">· {activeEntries.length} in progress</span>
            )}
            {failedEntries.length > 0 && (
              <span className="ml-2 text-danger">· {failedEntries.length} failed</span>
            )}
          </p>
        </div>
        <button
          disabled={refreshing}
          onClick={() => void refresh()}
          className="app-no-drag rounded-full bg-bg-elev px-4 py-2 text-xs font-semibold text-muted hover:text-fg disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh library'}
        </button>
      </header>

      {refreshFailed && (
        <div role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not refresh the library. Please try again.
        </div>
      )}

      {activeEntries.length === 0 &&
        failedEntries.length === 0 &&
        onDeviceReciters.length === 0 && <EmptyState />}

      {activeByReciter.size > 0 && (
        <Section title="Downloading now">
          <div className="space-y-3">
            {[...activeByReciter.entries()].map(([reciterId, entries]) => (
              <ActiveReciterCard
                key={reciterId}
                reciter={reciterById.get(reciterId)}
                reciterId={reciterId}
                entries={entries}
              />
            ))}
          </div>
        </Section>
      )}

      {failedEntries.length > 0 && (
        <Section title="Failed">
          <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elev">
            {failedEntries.map((q) => (
              <FailedRow
                key={`${q.reciterId}:${q.surahNumber}`}
                entry={q}
                reciter={reciterById.get(q.reciterId)}
              />
            ))}
          </ul>
        </Section>
      )}

      {onDeviceReciters.length > 0 && (
        <Section title="On device">
          <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elev">
            {onDeviceReciters.map((r) => (
              <ReciterLine key={r.id} reciter={r} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  children
}: Readonly<{
  title: string
  children: React.ReactNode
}>): React.JSX.Element {
  return (
    <section className="mt-6">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
        {title}
      </div>
      {children}
    </section>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="grid place-items-center rounded-xl border border-border bg-bg-elev px-6 py-16 text-center">
      <div className="text-sm font-semibold text-fg">No downloads yet</div>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Open a reciter and download individual surahs, or the full set, to use them offline.
      </p>
      <Link
        to="/reciters"
        className="mt-4 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white"
      >
        Browse reciters
      </Link>
    </div>
  )
}

function ActiveReciterCard({
  reciter,
  reciterId,
  entries
}: Readonly<{
  reciter: ReciterSummary | undefined
  reciterId: string
  entries: QueueEntry[]
}>): React.JSX.Element {
  const active = entries.find((e) => e.status === 'active')
  const queued = entries.filter((e) => e.status === 'queued')

  // Per-reciter progress: completed-on-disk + currently-active progress ÷ total scope.
  const downloadedCount = reciter?.downloadedSurahs ?? 0
  const totalRemaining = entries.length
  const totalScope = downloadedCount + totalRemaining
  const activePct =
    active?.totalBytes && active.progressBytes
      ? Math.min(100, (active.progressBytes / active.totalBytes) * 100)
      : 0
  // Combine completed surahs + the active surah's partial contribution.
  const overallPct =
    totalScope === 0 ? 0 : Math.min(100, ((downloadedCount + activePct / 100) / totalScope) * 100)

  const name = reciter?.name ?? reciterId
  const activeSurah = active ? getSurah(active.surahNumber) : null

  return (
    <article className="rounded-xl border border-border bg-bg-elev px-5 py-4">
      <div className="flex items-center gap-4">
        {reciter ? (
          <ReciterAvatar reciter={reciter} className="h-12 w-12 shrink-0" />
        ) : (
          <div className="size-12 shrink-0 rounded-xl bg-bg" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              to={`/reciter/${reciterId}`}
              className="truncate font-semibold hover:text-primary"
            >
              {name}
            </Link>
            <div className="shrink-0 text-xs text-muted">
              <span className="text-primary">{downloadedCount + (active ? 1 : 0)}</span> / 114 ·{' '}
              {Math.round(overallPct)}%
            </div>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${overallPct}%` }}
              role="progressbar"
              aria-label={`${name} download progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(overallPct)}
            />
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            {active ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="size-3 animate-spin text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
                </svg>
                <span>
                  Downloading{' '}
                  <span className="text-fg">
                    {activeSurah?.name_en ?? `Surah ${active.surahNumber}`}
                  </span>
                </span>
              </>
            ) : (
              <>{queued.length > 0 ? <span>{queued.length} queued</span> : <span>—</span>}</>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            // These entries contain only queued and active work.
            for (const e of entries) {
              void globalThis.api.cancelDownload(e.reciterId, e.surahNumber)
            }
          }}
          aria-label="Cancel all"
          title="Cancel all in this reciter"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
          >
            <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </article>
  )
}

function FailedRow({
  entry,
  reciter
}: Readonly<{
  entry: QueueEntry
  reciter: ReciterSummary | undefined
}>): React.JSX.Element {
  const surah = getSurah(entry.surahNumber)
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {reciter ? (
        <ReciterAvatar reciter={reciter} className="h-10 w-10 shrink-0" />
      ) : (
        <div className="size-10 shrink-0 rounded-xl bg-bg" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">
          {reciter?.name ?? entry.reciterId} · {surah?.name_en ?? `Surah ${entry.surahNumber}`}
        </div>
        <div className="truncate text-xs text-danger">Download failed. Try again.</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() =>
            globalThis.api
              .cancelDownload(entry.reciterId, entry.surahNumber)
              .then(() => globalThis.api.downloadSurah(entry.reciterId, entry.surahNumber))
          }
          className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning hover:bg-warning/25"
        >
          Retry
        </button>
        <button
          onClick={() => globalThis.api.cancelDownload(entry.reciterId, entry.surahNumber)}
          className="rounded-full bg-bg px-3 py-1 text-xs font-semibold text-muted hover:text-fg"
        >
          Remove
        </button>
      </div>
    </li>
  )
}

function ReciterLine({ reciter }: Readonly<{ reciter: ReciterSummary }>): React.JSX.Element {
  const [deleteOpen, setDeleteOpen] = useState(false)
  return (
    <>
      <li className="flex items-center gap-3 px-5 py-3">
        <ReciterAvatar reciter={reciter} className="h-10 w-10 shrink-0" />
        <Link to={`/reciter/${reciter.id}`} className="min-w-0 flex-1 hover:text-primary">
          <div className="truncate font-semibold">{reciter.name}</div>
          <div className="text-xs text-muted">{reciterStatusLabel(reciter)}</div>
        </Link>
        <button
          onClick={() => setDeleteOpen(true)}
          title="Delete all downloaded surahs for this reciter"
          aria-label="Delete downloads"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-4"
          >
            <path
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </li>
      <ConfirmationDialog
        open={deleteOpen}
        title={`Delete ${reciter.name}'s downloads?`}
        description="This removes every downloaded surah for this reciter, including unfinished downloads."
        confirmLabel="Delete reciter downloads"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          prepareReciterForDeletion(reciter.id)
          return globalThis.api.deleteReciter(reciter.id)
        }}
      />
    </>
  )
}
