import { dismissToast, useToastsStore, type ToastKind } from '../stores/toasts'

const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'bg-bg-elev text-fg border-border',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  error: 'bg-danger/10 text-danger border-danger/30'
}

/**
 * Stack of toasts, bottom-right. `bottom-24` parks them above the persistent
 * player bar (80 px high + a bit of breathing room) so the controls aren't
 * obscured. The outer container is pointer-events-none so it never traps
 * clicks; individual toasts re-enable themselves so the dismiss × works.
 */
export default function Toaster(): React.JSX.Element {
  const toasts = useToastsStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-end gap-2 px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'}
          className={[
            'pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm',
            KIND_CLASSES[t.kind]
          ].join(' ')}
        >
          <div className="flex-1">{t.message}</div>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100"
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
      ))}
    </div>
  )
}
