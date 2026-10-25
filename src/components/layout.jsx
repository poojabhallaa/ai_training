import { useEffect, useRef } from 'react'
import { AlertCircleIcon, CheckCircleIcon } from './icons.jsx'

export function FormSection({ id, number, title, description, complete, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7"
    >
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="mb-1 font-mono text-xs tracking-wider text-fg-subtle">{number}</p>
          <h2 id={`${id}-title`} className="text-base font-semibold text-fg sm:text-lg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
        {complete !== undefined && (
          <span
            className={
              'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
              (complete ? 'border-accent/30 bg-accent/10 text-accent' : 'border-line text-fg-subtle')
            }
          >
            {complete ? <CheckCircleIcon className="size-3.5" /> : null}
            {complete ? 'Complete' : 'Incomplete'}
          </span>
        )}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

export function StatusBanner({ tone, title, children, bannerRef }) {
  const success = tone === 'success'
  return (
    <div
      ref={bannerRef}
      tabIndex={-1}
      role={success ? 'status' : 'alert'}
      className={
        'flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm outline-none ' +
        (success ? 'border-accent/30 bg-accent/[0.07] text-fg' : 'border-danger/30 bg-danger/[0.07] text-fg')
      }
    >
      {success ? (
        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-accent" />
      ) : (
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-danger" />
      )}
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{title}</p>
        {children && <div className="break-words text-fg-muted">{children}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close?.()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel()
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-fg backdrop:bg-black/70"
    >
      {open && (
        <div className="p-6">
          <h2 id="confirm-title" className="text-base font-semibold">
            {title}
          </h2>
          <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-fg-muted">
            {message}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} autoFocus className="btn-secondary">
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} className="btn-danger">
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
