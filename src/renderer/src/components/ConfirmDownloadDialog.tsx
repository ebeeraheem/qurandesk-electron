import { useEffect } from 'react'
import { formatBytes } from '../utils/format'

const SAFETY_MARGIN_BYTES = 1024 ** 3 // 1 GB free-disk cushion per spec §5

type Props = {
  open: boolean
  reciterName: string
  surahsRemaining: number
  estimatedBytes: number | undefined
  freeBytes: number | undefined
  totalBytes: number | undefined
  onClose: () => void
  onConfirm: () => void
}

/**
 * Pre-flight confirm for a bulk reciter download. Surfaces three states:
 *
 *  - **insufficient**: `estimatedBytes` would push us past `freeBytes − 1 GB`
 *    → red error, only Cancel.
 *  - **tight**: would land within the 1 GB safety margin → amber heads-up,
 *    user can still proceed.
 *  - **ok**: plenty of room → plain readout, primary Download button.
 *
 * Estimates are exactly that — the manifest only carries the full-set size,
 * so partial-reciter estimates assume an even per-surah split.
 */
export default function ConfirmDownloadDialog({
  open,
  reciterName,
  surahsRemaining,
  estimatedBytes,
  freeBytes,
  totalBytes,
  onClose,
  onConfirm
}: Readonly<Props>): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && state !== 'insufficient') onConfirm()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  const known = typeof freeBytes === 'number' && freeBytes > 0
  const haveEstimate = typeof estimatedBytes === 'number' && estimatedBytes > 0

  let state: 'insufficient' | 'tight' | 'ok' | 'unknown' = 'ok'
  if (!known) state = 'unknown'
  else if (haveEstimate && estimatedBytes > freeBytes - SAFETY_MARGIN_BYTES) state = 'insufficient'
  else if (haveEstimate && estimatedBytes > freeBytes - 5 * SAFETY_MARGIN_BYTES) state = 'tight'

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-bg p-6 shadow-2xl"
      >
        <h2 className="text-xl font-bold">Download {reciterName}</h2>
        <p className="mt-1 text-sm text-muted">
          {surahsRemaining === 114
            ? 'This will download the full 114-surah set.'
            : `${surahsRemaining} surah${surahsRemaining === 1 ? '' : 's'} remaining.`}
        </p>

        <div className="mt-5 space-y-2 rounded-lg border border-border bg-bg-elev px-4 py-3 text-sm">
          <Row
            label="Download size"
            value={haveEstimate ? `~${formatBytes(estimatedBytes)}` : '—'}
          />
          <Row label="Free disk" value={known ? formatBytes(freeBytes) : '—'} />
          {totalBytes && totalBytes > 0 && (
            <Row label="Total disk" value={formatBytes(totalBytes)} muted />
          )}
        </div>

        {state === 'insufficient' && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <div className="font-semibold">Not enough free space</div>
            <p className="mt-1">
              QuranDesk keeps at least 1 GB free for the system. Free up some space and try again.
            </p>
          </div>
        )}

        {state === 'tight' && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <div className="font-semibold">Disk is getting tight</div>
            <p className="mt-1">
              This download will leave less than 5 GB free. You can still proceed.
            </p>
          </div>
        )}

        {state === 'unknown' && (
          <div className="mt-4 rounded-lg border border-border bg-bg-elev px-4 py-3 text-xs text-muted">
            Couldn&apos;t read free disk space. Download will proceed without a pre-flight check.
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full bg-bg-elev px-4 py-2 text-sm font-semibold text-muted hover:text-fg"
          >
            Cancel
          </button>
          {state !== 'insufficient' && (
            <button
              onClick={onConfirm}
              autoFocus
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              {haveEstimate ? `Download ~${formatBytes(estimatedBytes)}` : 'Download'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  muted = false
}: Readonly<{
  label: string
  value: string
  muted?: boolean
}>): React.JSX.Element {
  return (
    <div
      className={['flex justify-between gap-4', muted && 'text-muted'].filter(Boolean).join(' ')}
    >
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}
