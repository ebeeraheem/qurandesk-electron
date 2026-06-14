import { useEffect, useId, useRef, useState } from 'react'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm
}: Readonly<Props>): React.JSX.Element | null {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Reset transient dialog state each time a new confirmation opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)
    setBusy(false)
    busyRef.current = false
    requestAnimationFrame(() => cancelRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  const confirm = async (): Promise<void> => {
    setBusy(true)
    busyRef.current = true
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch {
      setError("Couldn't delete this right now. Please try again.")
      setBusy(false)
      busyRef.current = false
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-border bg-bg p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-xl font-bold text-fg">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          {description}
        </p>

        {error && (
          <div role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={busy}
            className="rounded-full bg-bg-elev px-4 py-2 text-sm font-semibold text-muted hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
