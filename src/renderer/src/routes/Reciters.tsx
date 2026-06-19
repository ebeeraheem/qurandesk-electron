import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppError, ReciterSummary } from '@shared/api'
import ReciterCard from '../components/ReciterCard'
import SegmentedControl from '../components/SegmentedControl'

type ReciterFilter = 'all' | 'downloaded'

const FILTER_OPTIONS: Array<{ value: ReciterFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'downloaded', label: 'Downloaded' }
]

export default function Reciters(): React.JSX.Element {
  const navigate = useNavigate()
  const [reciters, setReciters] = useState<ReciterSummary[]>([])
  const [status, setStatus] = useState<{
    lastError: AppError | null
    fetching: boolean
  }>({ lastError: null, fetching: false })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ReciterFilter>('all')
  const [loaded, setLoaded] = useState(false)

  const reload = async (): Promise<void> => {
    try {
      const [list, status] = await Promise.all([
        globalThis.api.getReciters(),
        globalThis.api.getManifestStatus()
      ])
      setReciters(list.sort((a, b) => a.name.localeCompare(b.name)))
      setStatus({ lastError: status.lastError, fetching: status.fetching })
    } catch {
      setStatus({
        lastError: {
          code: 'catalog/not-loaded',
          userMessage: "Couldn't load the catalog. Please try again."
        },
        fetching: false
      })
    } finally {
      setLoaded(true)
    }
  }

  const refresh = async (): Promise<void> => {
    await globalThis.api.refreshManifest()
    await reload()
  }

  useEffect(() => {
    // Cached catalog renders immediately; refresh continues in the background.
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = reciters
    if (filter === 'downloaded') list = list.filter((reciter) => reciter.downloadState !== 'none')
    if (q) list = list.filter((reciter) => reciter.name.toLowerCase().includes(q))
    return list
  }, [reciters, query, filter])

  return (
    <div className="px-10 py-8">
      <header className="app-drag flex flex-wrap items-end justify-between gap-6 pb-6">
        <h1 className="text-3xl font-bold">Reciters</h1>
        <div className="app-no-drag flex items-center gap-3">
          <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </header>

      {(!loaded || (reciters.length === 0 && status.fetching)) && <CatalogLoading />}

      {loaded && reciters.length === 0 && !status.fetching && (
        <EmptyOrError lastError={status.lastError} onRetry={() => void refresh()} />
      )}

      {reciters.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-elev px-6 py-8 text-center text-sm text-muted">
          {query.trim() ? (
            <>
              No reciters match <span className="font-mono text-fg">{query}</span>.
            </>
          ) : (
            'No downloaded reciters yet — switch to All to browse.'
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-7">
          {filtered.map((reciter) => (
            <li key={reciter.id}>
              <ReciterCard reciter={reciter} onClick={() => navigate(`/reciter/${reciter.id}`)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CatalogLoading(): React.JSX.Element {
  return (
    <div className="grid place-items-center rounded-xl border border-border bg-bg-elev px-6 py-16">
      <div
        className="size-8 animate-spin rounded-full border-2 border-bg border-t-primary"
        role="status"
        aria-label="Loading reciters"
      />
      <div className="mt-3 text-sm text-muted">Loading reciters...</div>
    </div>
  )
}

function SearchInput({
  value,
  onChange
}: Readonly<{
  value: string
  onChange: (value: string) => void
}>): React.JSX.Element {
  return (
    <label className="flex w-72 items-center gap-2 rounded-full border border-border bg-bg-elev px-4 py-2 text-sm focus-within:border-primary">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="size-4 text-muted"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search reciters"
        placeholder="Search reciters..."
        className="flex-1 bg-transparent text-fg placeholder:text-muted focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-muted hover:text-fg"
          aria-label="Clear search"
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
      )}
    </label>
  )
}

function EmptyOrError({
  lastError,
  onRetry
}: Readonly<{
  lastError: AppError | null
  onRetry: () => void
}>): React.JSX.Element {
  return (
    <div className="grid place-items-center rounded-xl border border-border bg-bg-elev px-6 py-16 text-center">
      <div className="text-sm font-semibold text-fg">
        {lastError ? "Couldn't load the catalog" : 'No reciters available'}
      </div>
      <p className="mt-2 max-w-sm text-sm text-muted">
        {lastError?.userMessage ?? 'Refresh the catalog to check again.'}
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white"
      >
        Retry
      </button>
    </div>
  )
}
