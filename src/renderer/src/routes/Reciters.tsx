import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReciterSummary } from '@shared/api'
import ReciterCard from '../components/ReciterCard'
import { formatRelativeTime } from '../utils/format'

export default function Reciters(): React.JSX.Element {
  const navigate = useNavigate()
  const [reciters, setReciters] = useState<ReciterSummary[]>([])
  const [status, setStatus] = useState<{ cachedAt: number | null; lastError: string | null }>({
    cachedAt: null,
    lastError: null
  })
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)

  const reload = async (): Promise<void> => {
    const [list, s] = await Promise.all([
      window.api.getReciters(),
      window.api.getManifestStatus()
    ])
    setReciters(list)
    setStatus(s)
    setLoaded(true)
  }

  useEffect(() => {
    void reload()
    const off1 = window.api.on('manifest:updated', () => void reload())
    // Re-fetch reciter list when a download completes so badge counts stay live.
    const off2 = window.api.on('download:completed', () => void reload())
    return () => {
      off1()
      off2()
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return reciters
    return reciters.filter((r) => {
      return r.name.toLowerCase().includes(q) || (r.style?.toLowerCase().includes(q) ?? false)
    })
  }, [reciters, query])

  return (
    <div className="px-10 py-8">
      <header className="app-drag flex flex-wrap items-end justify-between gap-6 pb-6">
        <div>
          <h1 className="text-3xl font-bold">Reciters</h1>
          <p className="mt-1 text-sm text-muted">
            {reciters.length} reciter{reciters.length === 1 ? '' : 's'}
            {status.cachedAt != null && ` · updated ${formatRelativeTime(status.cachedAt)}`}
          </p>
        </div>
        <div className="app-no-drag">
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </header>

      {/* Empty / error states */}
      {loaded && reciters.length === 0 && (
        <EmptyOrError lastError={status.lastError} onRetry={() => void reload()} />
      )}

      {reciters.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-elev px-6 py-8 text-center text-sm text-muted">
          No reciters match <span className="font-mono text-fg">{query}</span>.
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-7">
          {filtered.map((r) => (
            <li key={r.id}>
              <ReciterCard reciter={r} onClick={() => navigate(`/reciter/${r.id}`)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SearchInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label className="flex w-72 items-center gap-2 rounded-full border border-border bg-bg-elev px-4 py-2 text-sm focus-within:border-primary">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 text-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search reciters…"
        className="flex-1 bg-transparent text-fg placeholder:text-muted focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-muted hover:text-fg"
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
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
}: {
  lastError: string | null
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="grid place-items-center rounded-xl border border-border bg-bg-elev px-6 py-16 text-center">
      <div className="text-sm font-semibold text-fg">Couldn&apos;t load the catalog</div>
      <p className="mt-2 max-w-sm text-sm text-muted">{lastError ?? 'No catalog available.'}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white"
      >
        Retry
      </button>
    </div>
  )
}
