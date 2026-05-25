import { useState } from 'react'
import type { ReciterSummary } from '@shared/api'

/**
 * Square thumbnail for a reciter card. Owns its own `aspect-square` so the
 * crop is uniform across cards regardless of the parent's height resolution.
 *
 * Loads `photo_url` when available; on error or when no URL is provided, falls
 * back to an SVG placeholder (gradient + first letter) that scales perfectly
 * with the container. The design mocks use Arabic letters here — once the
 * manifest carries `name_ar` (see TODOS open items) the fallback will render
 * the Arabic glyph instead of the English first letter.
 */
export default function ReciterAvatar({
  reciter,
  className = ''
}: {
  reciter: ReciterSummary
  className?: string
}): React.JSX.Element {
  const [errored, setErrored] = useState(false)
  const showPhoto = reciter.photoUrl && !errored

  return (
    <div
      className={[
        'relative aspect-square overflow-hidden rounded-2xl bg-bg-elev',
        className
      ].join(' ')}
    >
      {showPhoto ? (
        <img
          src={reciter.photoUrl ?? undefined}
          alt={reciter.name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="block h-full w-full object-cover"
        />
      ) : (
        <PlaceholderArt reciter={reciter} />
      )}
    </div>
  )
}

/**
 * Gradient + letter, rendered as SVG so the typography stays a fixed
 * proportion of the card no matter what size the grid lays the card at.
 */
function PlaceholderArt({ reciter }: { reciter: ReciterSummary }): React.JSX.Element {
  const hue = hashToHue(reciter.id)
  const letter = firstLetter(reciter.name)
  // Unique per-reciter so multiple <defs> in the same document don't collide.
  const gradientId = `reciter-grad-${reciter.id}`

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full"
      role="img"
      aria-label={reciter.name}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 55%, 62%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 18) % 360}, 50%, 38%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gradientId})`} />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="60"
        fontWeight="700"
        fill="rgba(255, 255, 255, 0.92)"
        style={{ fontFamily: 'var(--font-arabic, serif)' }}
      >
        {letter}
      </text>
    </svg>
  )
}

/** Stable hash → hue in [0, 360). Same id always picks the same colour. */
function hashToHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return ((h % 360) + 360) % 360
}

function firstLetter(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '·'
  // Code-point-aware first character (handles surrogate-pair edge cases cleanly).
  return [...trimmed][0]!.toUpperCase()
}
