import { useEffect, useMemo, useRef, useState } from 'react'
import {
  OVERALL_AXIS,
  OVERALL_INTRO,
  RANKING_REASON_LABEL,
  RATING_SCALE,
  SLIDES_AXES,
  SLIDES_DEFAULT_TITLE,
  SLIDES_INSTRUCTIONS,
} from '../config/slidesEval.js'
import { createSubmissionId, submitEvaluation } from '../lib/submitEvaluation.js'
import {
  buildSlidesPayload,
  createInitialSlidesValues,
  explanationId,
  RANKING_REASON_ID,
  rankId,
  ratingId,
  setRank,
  slidesFieldOrder,
  validateSlides,
} from '../lib/slidesValidation.js'
import { AlertCircleIcon, ExpandIcon, HomeIcon, RotateCcwIcon, SpinnerIcon, XIcon } from './icons.jsx'
import { ConfirmDialog, StatusBanner } from './layout.jsx'

// Google Drive's built-in viewer. It shows every slide of a .pptx, scrollable,
// as long as the file is shared as "Anyone with the link can view".
function drivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`
}

const GRID_COLUMNS = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' }

function formatTimestamp(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function Required() {
  return (
    <>
      <span aria-hidden="true">*</span>
      <span className="sr-only">(required)</span>
    </>
  )
}

function FieldError({ id, error }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      {error}
    </p>
  )
}

// Connected buttons (1-7, or Response A/B/C) backed by native radios, so arrow
// keys move between options.
function ChoiceGroup({ name, options, value, onChange, error, disabled, cellClassName = 'w-10' }) {
  return (
    <div
      className={`mt-3 inline-flex max-w-full flex-wrap overflow-hidden rounded-md border ${error ? 'border-danger/70' : 'border-line'}`}
    >
      {options.map((opt) => {
        const checked = value === opt.value
        return (
          <label
            key={opt.value}
            className={
              'flex h-11 cursor-pointer items-center justify-center border-l border-line text-sm tabular-nums transition-colors first:border-l-0 ' +
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/30 has-[:focus-visible]:ring-inset ' +
              (checked ? 'bg-selected text-white' : 'text-fg-subtle hover:bg-white/5 hover:text-fg') +
              (disabled ? ' pointer-events-none opacity-60' : '') +
              ` ${cellClassName}`
            }
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}

const textareaClass =
  'mt-3 block min-h-24 w-full resize-y rounded-lg border bg-transparent px-4 py-3 text-base leading-relaxed text-fg ' +
  'placeholder:text-fg-subtle outline-none transition-colors focus:ring-2 disabled:opacity-60'

function ExplainField({ id, label, placeholder, value, error, onChange, onBlur, disabled, rows = 3 }) {
  return (
    <div data-field={id}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-base text-fg">
        {label} <Required />
      </label>
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`${textareaClass} ${
          error ? 'border-danger/70 focus:ring-danger/20' : 'border-line-strong focus:border-fg-muted focus:ring-white/10'
        }`}
      />
      <FieldError id={id} error={error} />
    </div>
  )
}

const RATING_OPTIONS = RATING_SCALE.map((n) => ({ value: n, label: String(n) }))

function AxisRating({ label, axis, given, errorFor, onRate, onExplain, onBlur, disabled, longLabel }) {
  const id = ratingId(label, axis.key)
  const eid = explanationId(label, axis.key)
  return (
    <div className="space-y-6">
      <fieldset data-field={id} aria-describedby={errorFor(id) ? `${id}-error` : undefined}>
        <legend className={`w-full text-base leading-relaxed text-fg ${longLabel ? 'pr-6' : ''}`}>
          {longLabel ? (
            <span className="relative block">
              {axis.label}
              <span className="absolute top-1/2 -right-6 -translate-y-1/2">
                <Required />
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              {axis.label} <Required />
            </span>
          )}
        </legend>
        <ChoiceGroup
          name={`${label}-${axis.key}`}
          options={RATING_OPTIONS}
          value={given[axis.key]}
          onChange={(value) => onRate(axis.key, value)}
          error={errorFor(id)}
          disabled={disabled}
        />
        <FieldError id={id} error={errorFor(id)} />
      </fieldset>
      <ExplainField
        id={eid}
        label={axis.explainLabel}
        placeholder={axis.placeholder}
        value={given[`${axis.key}Explanation`]}
        error={errorFor(eid)}
        onChange={(value) => onExplain(axis.key, value)}
        onBlur={() => onBlur(eid)}
        disabled={disabled}
      />
    </div>
  )
}

function ResponseColumn({ response, hiddenOnSmall, given, errorFor, onRate, onExplain, onBlur, onExpand, disabled }) {
  const { label, fileId } = response
  const props = { label, given, errorFor, onBlur, disabled }
  return (
    <section
      id={`response-${label}`}
      aria-labelledby={`response-${label}-title`}
      className={`min-w-0 scroll-mt-24 rounded-lg border border-line bg-surface p-5 sm:p-6 ${hiddenOnSmall ? 'hidden lg:block' : ''}`}
    >
      <h2 id={`response-${label}-title`} className="text-lg font-semibold text-fg">
        Response {label}
      </h2>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-fg">Rendered preview</h3>
        <button
          type="button"
          onClick={() => onExpand(response)}
          aria-label={`Open Response ${label} full screen`}
          title="Full screen"
          className="rounded-md bg-white/10 p-2 text-fg-muted outline-none transition-colors hover:bg-white/15 hover:text-fg focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <ExpandIcon className="size-4" />
        </button>
      </div>
      <iframe
        src={drivePreviewUrl(fileId)}
        title={`Response ${label} slides`}
        loading="lazy"
        allow="fullscreen"
        className="mt-4 h-[28rem] w-full rounded border border-line bg-white sm:h-[34rem]"
      />

      <div className="mt-12 space-y-8">
        <div>
          <h3 className="border-b border-line pb-2 text-3xl font-light text-fg">Individual Rating</h3>
          <p className="mt-4 text-base text-fg">Review the slides above on each of the axes below.</p>
        </div>
        {SLIDES_AXES.map((axis) => (
          <AxisRating
            key={axis.key}
            {...props}
            axis={axis}
            longLabel
            onRate={(key, value) => onRate(label, key, value)}
            onExplain={(key, value) => onExplain(label, key, value)}
          />
        ))}
        <hr className="border-line" />
        <p className="text-base leading-relaxed text-fg">{OVERALL_INTRO}</p>
        <AxisRating
          {...props}
          axis={OVERALL_AXIS}
          onRate={(key, value) => onRate(label, key, value)}
          onExplain={(key, value) => onExplain(label, key, value)}
        />
      </div>
    </section>
  )
}

// Large viewer for one response, opened with the expand button.
function SlidesViewer({ response, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (response && !dialog.open) dialog.showModal?.()
    if (!response && dialog.open) dialog.close?.()
  }, [response])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      aria-labelledby="slides-viewer-title"
      className="m-auto h-[92dvh] max-h-none w-[96vw] max-w-none rounded-lg border border-line bg-surface p-0 text-fg backdrop:bg-black/80"
    >
      {response && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 id="slides-viewer-title" className="text-base font-semibold">
              Response {response.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              autoFocus
              className="rounded-md p-1.5 text-fg-muted outline-none hover:bg-white/10 hover:text-fg focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <iframe
            src={drivePreviewUrl(response.fileId)}
            title={`Response ${response.label} slides, full screen`}
            allow="fullscreen"
            className="w-full flex-1 bg-white"
          />
        </div>
      )}
    </dialog>
  )
}

// The slides evaluation task: the instructions, the user request and input
// files from the sheet, each response's presentation with its ratings side by
// side, and the overall ranking.
export default function SlidesEvaluation({ task, onChangeCode, submit = submitEvaluation }) {
  const labels = useMemo(() => task.responses.map((r) => r.label), [task.responses])
  const fieldOrder = useMemo(() => slidesFieldOrder(labels), [labels])
  const [values, setValues] = useState(() => createInitialSlidesValues(labels))
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [status, setStatus] = useState({ state: 'idle' })
  const [active, setActive] = useState(labels[0])
  const [expanded, setExpanded] = useState(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  // One ID per evaluation, kept across failed attempts so a retry of a request
  // that reached the sheet is recognised as a duplicate.
  const submissionIdRef = useRef(createSubmissionId())
  const inFlightRef = useRef(false)
  const bannerRef = useRef(null)

  const errors = useMemo(() => validateSlides(values, labels), [values, labels])
  const errorCount = Object.keys(errors).length
  const submitting = status.state === 'submitting'
  const dirty = JSON.stringify(values) !== JSON.stringify(createInitialSlidesValues(labels))
  const errorFor = (id) => (submitAttempted || touched[id] ? errors[id] : undefined)

  function update(change) {
    setValues(change)
    if (status.state === 'success' || status.state === 'error') setStatus({ state: 'idle' })
  }

  function setRating(label, key, value) {
    update((prev) => ({ ...prev, ratings: { ...prev.ratings, [label]: { ...prev.ratings[label], [key]: value } } }))
  }

  function setExplanation(label, key, value) {
    setRating(label, `${key}Explanation`, value)
  }

  function markTouched(id) {
    setTouched((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
  }

  function showResponse(label) {
    setActive(label)
    requestAnimationFrame(() => document.getElementById(`response-${label}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  function focusField(id) {
    // On small screens only the selected response is shown, so switch to the
    // response the field belongs to first.
    const label = labels.find((l) => id.startsWith(`${l}-`))
    if (label) setActive(label)
    requestAnimationFrame(() => {
      const container = document.querySelector(`[data-field="${id}"]`)
      container?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      container?.querySelector('input, textarea')?.focus({ preventScroll: true })
    })
  }

  function resetForm() {
    setValues(createInitialSlidesValues(labels))
    setTouched({})
    setSubmitAttempted(false)
    submissionIdRef.current = createSubmissionId()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlightRef.current) return
    setSubmitAttempted(true)

    const firstInvalid = fieldOrder.find((id) => errors[id])
    if (firstInvalid) {
      setStatus({ state: 'invalid' })
      focusField(firstInvalid)
      return
    }

    inFlightRef.current = true
    setStatus({ state: 'submitting' })
    try {
      const result = await submit(buildSlidesPayload(values, labels, submissionIdRef.current, task.code))
      resetForm()
      setStatus({ state: 'success', submissionId: result.submissionId, submittedAt: result.submittedAt })
    } catch (error) {
      setStatus({ state: 'error', message: error.message, fields: error.fields })
    } finally {
      inFlightRef.current = false
      requestAnimationFrame(() => bannerRef.current?.focus({ preventScroll: true }))
    }
  }

  function handleReset() {
    if (submitting) return
    if (dirty) setConfirmResetOpen(true)
    else {
      resetForm()
      setStatus({ state: 'idle' })
    }
  }

  const responseOptions = labels.map((label) => ({ value: label, label: `Response ${label}` }))

  return (
    <div className="theme-slides min-h-dvh bg-canvas text-fg">
      <header className="flex items-center gap-4 bg-topbar px-4 py-3.5 text-white sm:gap-6 sm:px-8">
        <button
          type="button"
          onClick={onChangeCode}
          aria-label="Use a different code"
          title="Use a different code"
          className="shrink-0 rounded-md p-1.5 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <HomeIcon className="size-7" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{task.title || SLIDES_DEFAULT_TITLE}</h1>
          <p className="mt-0.5 truncate text-sm text-topbar-muted">
            Slides Eval <span aria-hidden="true">·</span> Code <span className="font-mono">{task.code}</span>
          </p>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-8">
        <section aria-labelledby="slides-instructions" className="space-y-4 text-base leading-relaxed sm:text-lg">
          <h2 id="slides-instructions" className="text-2xl font-semibold">
            Instructions
          </h2>
          <p>{SLIDES_INSTRUCTIONS}</p>

          <h2 className="pt-2 text-2xl font-semibold">User request</h2>
          <p className="whitespace-pre-wrap break-words">{task.request}</p>

          {task.inputFiles.length > 0 && (
            <>
              <h3 className="pt-6 text-xl font-semibold">Input files</h3>
              <ul className="list-disc space-y-2 pl-7">
                {task.inputFiles.map((file, i) => (
                  <li key={i} className="font-mono text-file break-all">
                    {/^https?:\/\//i.test(file.url) ? (
                      <a href={file.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        {file.name}
                      </a>
                    ) : (
                      file.name
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <form onSubmit={handleSubmit} noValidate aria-busy={submitting} className="mt-10">
          <div className="rounded-lg bg-surface">
            <div className="sticky top-0 z-10 rounded-t-lg border-b border-line bg-surface px-4 py-4 sm:px-5">
              <div role="group" aria-label="Responses" className="inline-flex gap-1 rounded-lg bg-white/10 p-1">
                {labels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active === label}
                    onClick={() => showResponse(label)}
                    className={
                      'rounded-md px-3 py-1.5 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/30 sm:text-lg ' +
                      (active === label ? 'bg-selected text-white' : 'text-fg-muted hover:text-fg')
                    }
                  >
                    Response {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid gap-5 p-4 sm:p-5 ${GRID_COLUMNS[labels.length] ?? 'lg:grid-cols-3'}`}>
              {task.responses.map((response) => (
                <ResponseColumn
                  key={response.label}
                  response={response}
                  hiddenOnSmall={response.label !== active}
                  given={values.ratings[response.label]}
                  errorFor={errorFor}
                  onRate={setRating}
                  onExplain={setExplanation}
                  onBlur={markTouched}
                  onExpand={setExpanded}
                  disabled={submitting}
                />
              ))}
            </div>
          </div>

          <section aria-labelledby="overall-ranking-title" className="mt-14 space-y-8">
            <h2 id="overall-ranking-title" className="border-b border-line pb-2 text-3xl font-light">
              Overall Ranking
            </h2>
            {labels.map((_, i) => (
              <fieldset
                key={i}
                data-field={rankId(i)}
                aria-describedby={errorFor(rankId(i)) ? `${rankId(i)}-error` : undefined}
              >
                <legend className="flex items-center gap-1.5 text-lg">
                  Rank {i + 1} <Required />
                </legend>
                <ChoiceGroup
                  name={rankId(i)}
                  options={responseOptions}
                  value={values.ranking[i]}
                  onChange={(label) => update((prev) => ({ ...prev, ranking: setRank(prev.ranking, i, label) }))}
                  error={errorFor(rankId(i))}
                  disabled={submitting}
                  cellClassName="px-3.5"
                />
                <FieldError id={rankId(i)} error={errorFor(rankId(i))} />
              </fieldset>
            ))}
            <ExplainField
              id={RANKING_REASON_ID}
              label={RANKING_REASON_LABEL}
              value={values.rankingReason}
              error={errorFor(RANKING_REASON_ID)}
              onChange={(value) => update((prev) => ({ ...prev, rankingReason: value }))}
              onBlur={() => markTouched(RANKING_REASON_ID)}
              disabled={submitting}
              rows={7}
            />

            <div className="space-y-5 border-t border-line pt-8">
              {status.state === 'invalid' && errorCount > 0 && (
                <StatusBanner tone="error" title={`${errorCount} ${errorCount === 1 ? 'answer needs' : 'answers need'} attention`}>
                  Every response needs a rating and an explanation on each axis, and every rank needs a response.
                </StatusBanner>
              )}
              {status.state === 'error' && (
                <StatusBanner tone="error" title="Submission failed" bannerRef={bannerRef}>
                  <p>{status.message}</p>
                  {status.fields && (
                    <ul className="mt-1.5 list-inside list-disc">
                      {Object.entries(status.fields).map(([field, message]) => (
                        <li key={field}>{message}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1.5">Your answers have been kept.</p>
                </StatusBanner>
              )}
              {status.state === 'success' && (
                <StatusBanner tone="success" title="Evaluation saved to Google Sheets" bannerRef={bannerRef}>
                  <p>
                    Submission ID <span className="font-mono text-fg">{status.submissionId}</span>
                  </p>
                  {status.submittedAt && <p>Recorded {formatTimestamp(status.submittedAt)}</p>}
                </StatusBanner>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={handleReset} disabled={submitting} className="btn-secondary">
                  <RotateCcwIcon className="size-4" />
                  Reset Form
                </button>
                <button type="submit" disabled={submitting} className="btn-primary sm:min-w-48">
                  {submitting ? (
                    <>
                      <SpinnerIcon className="size-4" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Evaluation'
                  )}
                </button>
              </div>
            </div>
          </section>
        </form>
      </main>

      <SlidesViewer response={expanded} onClose={() => setExpanded(null)} />
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset the form?"
        message="All ratings, explanations and rankings will be cleared. This cannot be undone."
        confirmLabel="Reset Form"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false)
          resetForm()
          setStatus({ state: 'idle' })
        }}
      />
    </div>
  )
}
