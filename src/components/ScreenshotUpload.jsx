import { useEffect, useRef, useState } from 'react'
import {
  ACCEPTED_TYPES,
  MAX_SCREENSHOTS,
  MAX_TOTAL_SCREENSHOT_BYTES,
  prepareScreenshot,
} from '../lib/screenshots.js'
import { AlertCircleIcon, ImageIcon, SpinnerIcon, XIcon } from './icons.jsx'

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function revoke(url) {
  if (url) URL.revokeObjectURL?.(url)
}

// Screenshots chosen with the file picker, dropped, or pasted. The list is
// owned by the form (value/onChange); while new files are being prepared,
// adding and removing are paused and onProcessingChange(true) is reported.
export default function ScreenshotUpload({ value, onChange, disabled, onProcessingChange, prepare = prepareScreenshot }) {
  const [processing, setProcessing] = useState(false)
  const [messages, setMessages] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  // Preview URLs are released when a screenshot leaves the list or the
  // component unmounts.
  const previewsRef = useRef([])
  useEffect(() => {
    const current = value.map((s) => s.previewUrl)
    previewsRef.current.filter((url) => !current.includes(url)).forEach(revoke)
    previewsRef.current = current
  }, [value])
  useEffect(() => () => previewsRef.current.forEach(revoke), [])

  const full = value.length >= MAX_SCREENSHOTS
  const locked = disabled || processing

  async function addFiles(fileList) {
    const files = [...(fileList || [])]
    if (locked || files.length === 0) return

    const room = MAX_SCREENSHOTS - value.length
    const accepted = files.slice(0, Math.max(0, room))
    const notes = []
    if (files.length > accepted.length) {
      const skipped = files.length - accepted.length
      notes.push(
        `You can add up to ${MAX_SCREENSHOTS} screenshots per submission, so ${skipped} ${skipped === 1 ? 'was' : 'were'} not added.`,
      )
    }
    if (accepted.length === 0) {
      setMessages(notes)
      return
    }

    setProcessing(true)
    onProcessingChange?.(true)
    const results = await Promise.allSettled(accepted.map((file) => prepare(file)))
    setProcessing(false)
    onProcessingChange?.(false)

    let total = value.reduce((sum, s) => sum + s.size, 0)
    const added = []
    results.forEach((result, i) => {
      const name = accepted[i].name || 'Pasted image'
      if (result.status === 'rejected') {
        notes.push(`${name} ${result.reason?.message || 'could not be added'}.`)
      } else if (total + result.value.size > MAX_TOTAL_SCREENSHOT_BYTES) {
        revoke(result.value.previewUrl)
        notes.push(`${name} was not added because the screenshots would be larger than 15 MB in total.`)
      } else {
        total += result.value.size
        added.push(result.value)
      }
    })
    setMessages(notes)
    if (added.length) onChange([...value, ...added])
  }

  function remove(id) {
    if (locked) return
    setMessages([])
    onChange(value.filter((s) => s.id !== id))
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer?.files)
  }

  function handlePaste(event) {
    const files = event.clipboardData?.files
    if (files?.length) {
      event.preventDefault()
      addFiles(files)
    }
  }

  return (
    <div className="space-y-4">
      <div
        tabIndex={0}
        role="group"
        aria-label="Screenshot drop area. Drop or paste images here."
        aria-describedby="screenshots-helper"
        onDragOver={(e) => {
          e.preventDefault()
          if (!locked && !full) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={
          'flex flex-col items-center rounded-lg border border-dashed px-4 py-7 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/20 ' +
          (dragging ? 'border-fg-muted bg-white/[0.04]' : 'border-line-strong bg-surface-raised')
        }
      >
        {processing ? (
          <SpinnerIcon className="size-5 text-fg-muted" />
        ) : (
          <ImageIcon className="size-5 text-fg-muted" />
        )}
        <p className="mt-2 text-sm text-fg">
          {processing
            ? 'Preparing screenshots...'
            : full
              ? `Maximum of ${MAX_SCREENSHOTS} screenshots reached`
              : 'Drag and drop images here, or click here and paste'}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={locked || full}
          className="btn-secondary mt-3"
        >
          Add screenshots
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          tabIndex={-1}
          aria-label="Add screenshots"
          className="sr-only"
          disabled={locked || full}
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p id="screenshots-helper" className="mt-3 text-xs leading-relaxed text-fg-muted">
          PNG, JPEG, or WebP. Up to {MAX_SCREENSHOTS} per submission. Large images are resized automatically.
        </p>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {messages.length > 0 && (
          <ul className="space-y-1">
            {messages.map((message) => (
              <li key={message} className="flex items-start gap-1.5 text-xs text-warning">
                <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-fg-muted">
            {value.length} of {MAX_SCREENSHOTS} added
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {value.map((s) => (
              <li key={s.id} className="group relative min-w-0 rounded-lg border border-line bg-surface-raised p-1.5">
                <img src={s.previewUrl} alt={s.name} className="aspect-video w-full rounded object-cover" />
                <p className="mt-1.5 truncate px-0.5 text-xs text-fg-muted" title={s.name}>
                  {s.name}
                </p>
                <p className="px-0.5 text-[11px] text-fg-subtle">{formatSize(s.size)}</p>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  disabled={locked}
                  aria-label={`Remove ${s.name}`}
                  className="absolute top-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-full border border-line bg-canvas/80 text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
