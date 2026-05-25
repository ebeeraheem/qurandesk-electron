import { useState } from 'react'
import type { ReciterSummary } from '@shared/api'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'])

/**
 * Square thumbnail for a reciter card. Owns its own `aspect-square` so the
 * crop is uniform across cards.
 *
 * Photos load via `app://photo/<id>.<ext>?from=<r2-url>`. The protocol
 * handler serves the cached version when available; otherwise it lazily
 * fetches from the `from` source (validated server-side against the manifest
 * host) and persists for next time. Result: photos load once online and
 * keep working offline thereafter.
 *
 * On any failure (missing photo_url, unsupported ext, fetch error before
 * first cache, etc.) we fall back to an SVG placeholder — a gradient + the
 * reciter's first letter — so the catalog never shows broken-image icons.
 */
export default function ReciterAvatar({
  reciter,
  className = ''
}: {
  reciter: ReciterSummary
  className?: string
}): React.JSX.Element {
  const [errored, setErrored] = useState(false)
  const src = errored ? null : photoSrc(reciter)

  return (
    <div
      className={[
        'relative aspect-square overflow-hidden rounded-2xl bg-bg-elev',
        className
      ].join(' ')}
    >
      {src ? (
        <img
          src={src}
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
 * Compose the `app://photo/...` URL for a reciter. Returns `null` when the
 * source URL is missing or has an extension we don't serve, in which case
 * the avatar falls back to the placeholder without even attempting a load.
 */
function photoSrc(reciter: ReciterSummary): string | null {
  if (!reciter.photoUrl) return null
  let pathname: string
  try {
    pathname = new URL(reciter.photoUrl).pathname
  } catch {
    return null
  }
  const m = /\.([a-z0-9]+)$/i.exec(pathname)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return null
  return `app://photo/${reciter.id}.${ext}?from=${encodeURIComponent(reciter.photoUrl)}`
}

function PlaceholderArt({ reciter }: { reciter: ReciterSummary }): React.JSX.Element {
  const hue = hashToHue(reciter.id)
  const letter = firstLetter(reciter.name)
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
  return [...trimmed][0]!.toUpperCase()
}
