import type { ReciterSummary } from '@shared/api'
import { usePlayerStore } from '../stores/player'
import { reciterStatusLabel } from '../utils/reciterStatus'
import ReciterAvatar from './ReciterAvatar'

type Props = {
  reciter: ReciterSummary
  onClick: () => void
}

export default function ReciterCard({ reciter, onClick }: Readonly<Props>): React.JSX.Element {
  const isCurrent = usePlayerStore((state) => state.current?.reciterId === reciter.id)
  const showPartialBadge = reciter.downloadState === 'partial' && reciter.downloadedSurahs > 0
  const showCompleteCheck = reciter.downloadState === 'complete'

  return (
    <button
      onClick={onClick}
      className={[
        'group flex w-full flex-col rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus:outline-none',
        isCurrent && 'ring-2 ring-primary ring-offset-4 ring-offset-bg'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="relative w-full">
        <ReciterAvatar reciter={reciter} className="w-full shadow-sm" />

        {showPartialBadge && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {reciter.downloadedSurahs} / 114
          </div>
        )}

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

      <div className="mt-3 truncate font-semibold text-fg">{reciter.name}</div>
      <div
        className={[
          'mt-0.5 text-xs',
          reciter.downloadState === 'complete' ? 'text-success' : 'text-muted'
        ].join(' ')}
      >
        {reciterStatusLabel(reciter)}
      </div>
    </button>
  )
}
