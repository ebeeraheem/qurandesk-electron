import type { ReciterSummary } from '@shared/api'
import { formatBytes } from '../utils/format'
import ReciterAvatar from './ReciterAvatar'

type Props = {
  reciter: ReciterSummary
  onClick: () => void
}

export default function ReciterCard({ reciter, onClick }: Readonly<Props>): React.JSX.Element {
  const stateLabel = subtitle(reciter)
  const showPartialBadge = reciter.downloadState === 'partial' && reciter.downloadedSurahs > 0
  const showCompleteCheck = reciter.downloadState === 'complete'

  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col text-left transition-transform hover:-translate-y-0.5 focus:outline-none"
    >
      {/* Relative wrapper so badges can absolutely position against the avatar. */}
      <div className="relative w-full">
        <ReciterAvatar reciter={reciter} className="w-full shadow-sm" />

        {/* Bottom-left "X / 114" pill when partial */}
        {showPartialBadge && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {reciter.downloadedSurahs} / 114
          </div>
        )}

        {/* Top-right green check when complete */}
        {showCompleteCheck && (
          <div className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-success text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="size-4"
            >
              <path d="m5 12 5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="truncate font-semibold text-fg">{reciter.name}</div>
        {/* Arabic transliteration goes here once manifest carries name_ar */}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        <span>{formatBytes(reciter.totalSizeBytes)}</span>
        <span className="mx-1.5 text-faint">·</span>
        <span className={stateLabel.tone}>{stateLabel.text}</span>
      </div>
    </button>
  )
}

function subtitle(r: ReciterSummary): { text: string; tone: string } {
  switch (r.downloadState) {
    case 'complete':
      return { text: 'Downloaded', tone: 'text-success' }
    case 'partial':
      return { text: `${r.downloadedSurahs} on disk`, tone: 'text-muted' }
    default:
      return { text: 'Not downloaded', tone: 'text-muted' }
  }
}
