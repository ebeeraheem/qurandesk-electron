/**
 * Pill-shaped segmented control. Used for binary/short option groups — theme,
 * playback speed, and the reciters list's All / Downloaded filter. The active
 * segment uses the primary color; idle segments stay muted.
 */
export default function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange
}: Readonly<{
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}>): React.JSX.Element {
  return (
    <div className="flex w-fit rounded-full bg-bg p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-fg'
            ].join(' ')}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
