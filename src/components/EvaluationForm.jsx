import { useMemo, useRef, useState } from 'react'
import {
  DEGRADATION_REASONS,
  FAILURE_TAGS,
  LIKERT_SCALE,
  MODELS,
  NOT_APPLICABLE,
  PLATFORMS,
  REASONING_EFFORTS,
  STATE_CHANGE_VALIDATED,
  TASK_SUCCESS,
  WHICH_IS_BETTER,
} from '../config/formOptions.js'
import { buildPayload, createInitialValues, FIELD_ORDER, SECTION_FIELDS, validate } from '../lib/validation.js'
import { createSubmissionId, submitEvaluation } from '../lib/submitEvaluation.js'
import { ChipMultiSelect, LikertScale, SegmentedControl, Select, TextArea, TextInput } from './fields.jsx'
import { ConfirmDialog, FormSection, StatusBanner } from './layout.jsx'
import { RotateCcwIcon, SpinnerIcon } from './icons.jsx'

function isEqualValues(a, b) {
  return FIELD_ORDER.every((key) =>
    Array.isArray(a[key]) ? a[key].length === b[key].length && a[key].every((v, i) => v === b[key][i]) : a[key] === b[key],
  )
}

function formatTimestamp(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function EvaluationForm({ submit = submitEvaluation }) {
  const [values, setValues] = useState(() => createInitialValues())
  const [initialValues, setInitialValues] = useState(values)
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [status, setStatus] = useState({ state: 'idle' })
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  // One ID per evaluation. It is kept across failed attempts so a retry of a
  // request that actually reached the sheet is recognised as a duplicate.
  const submissionIdRef = useRef(createSubmissionId())
  // Guards against double submission before React re-renders the disabled button.
  const inFlightRef = useRef(false)
  const bannerRef = useRef(null)

  const errors = useMemo(() => validate(values), [values])
  const errorCount = Object.keys(errors).length
  const submitting = status.state === 'submitting'
  const dirty = !isEqualValues(values, initialValues)

  const sectionComplete = (section) => SECTION_FIELDS[section].every((field) => !errors[field])
  const visibleError = (field) => (submitAttempted || touched[field] ? errors[field] : undefined)

  function setField(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (status.state === 'success' || status.state === 'error') setStatus({ state: 'idle' })
  }

  function markTouched(field) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  function bind(field) {
    return {
      id: field,
      value: values[field],
      error: visibleError(field),
      disabled: submitting,
      onBlur: () => markTouched(field),
    }
  }

  function bindInput(field) {
    return { ...bind(field), onChange: (e) => setField(field, e.target.value) }
  }

  function bindChoice(field) {
    return { ...bind(field), onChange: (value) => setField(field, value) }
  }

  function focusField(field) {
    const container = document.querySelector(`[data-field="${field}"]`)
    const target = container?.querySelector('input, select, textarea')
    container?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target?.focus({ preventScroll: true })
  }

  function focusBanner() {
    requestAnimationFrame(() => bannerRef.current?.focus({ preventScroll: true }))
  }

  function resetForm() {
    const fresh = createInitialValues()
    setValues(fresh)
    setInitialValues(fresh)
    setTouched({})
    setSubmitAttempted(false)
    submissionIdRef.current = createSubmissionId()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlightRef.current) return
    setSubmitAttempted(true)

    const currentErrors = validate(values)
    const firstInvalid = FIELD_ORDER.find((field) => currentErrors[field])
    if (firstInvalid) {
      setStatus({ state: 'invalid' })
      focusField(firstInvalid)
      return
    }

    inFlightRef.current = true
    setStatus({ state: 'submitting' })
    try {
      const result = await submit(buildPayload(values, submissionIdRef.current))
      resetForm()
      setStatus({ state: 'success', submissionId: result.submissionId, submittedAt: result.submittedAt })
    } catch (error) {
      setStatus({ state: 'error', message: error.message, code: error.code, fields: error.fields })
    } finally {
      inFlightRef.current = false
      focusBanner()
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

  return (
    <>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting} className="space-y-6">
        <FormSection
          id="section-basic"
          number="01"
          title="Basic Information"
          description="When and where the test was run."
          complete={sectionComplete('basic')}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <TextInput
              {...bindInput('dateOfTest')}
              type="date"
              label="Date of Test"
              required
              helper="The day the candidate ran the task."
            />
            <Select {...bindInput('platform')} label="Platform" required options={PLATFORMS} helper="Where the task was run." />
            <Select {...bindInput('modelUsed')} label="Model Used" required options={MODELS} helper="The model selected for the run." />
            <Select
              {...bindInput('reasoningEffort')}
              label="Reasoning / Effort"
              required
              options={REASONING_EFFORTS}
              helper="Reasoning or effort setting, or N/A if the platform has none."
            />
          </div>
        </FormSection>

        <FormSection
          id="section-prompt"
          number="02"
          title="Prompt and Expected Result"
          description="The task as given to the candidate, and what success looks like."
          complete={sectionComplete('prompt')}
        >
          <TextArea
            {...bindInput('prompt')}
            label="Prompt"
            required
            rows={6}
            placeholder="Paste the exact task instructions given to the candidate."
            helper="Copy the prompt exactly as it was entered, including any follow-up instructions."
          />
          <TextArea
            {...bindInput('expectedResult')}
            label="Expected Result"
            required
            rows={5}
            placeholder="Describe what a successful execution looks like."
            helper="Include the expected findings, actions taken through connectors, and the end state."
          />
        </FormSection>

        <FormSection
          id="section-outcome"
          number="03"
          title="Evaluation of Outcome"
          description="How well the run met the expected result."
          complete={sectionComplete('outcome')}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <SegmentedControl
              {...bindChoice('taskSuccess')}
              label="Task Success"
              required
              options={TASK_SUCCESS}
              helper="Pass: fully met the expected result. Partial: some parts met. Fail: not met."
            />
            <SegmentedControl
              {...bindChoice('whichIsBetter')}
              label="Which Is Better"
              required
              options={WHICH_IS_BETTER}
              helper="When comparing platforms on the same prompt. Use N/A for a single run."
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <TextInput
              {...bindInput('latencySeconds')}
              label="Latency (seconds)"
              required
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 42.5"
              helper="Time from sending the prompt to the final response, in seconds."
            />
            <Select
              {...bindInput('degradationReason')}
              label="Degradation Reason"
              required
              options={DEGRADATION_REASONS}
              helper="The main reason the result fell short, or N/A for a clean pass."
            />
          </div>
          <ChipMultiSelect
            {...bindChoice('failureTags')}
            label="Failure Tags"
            required
            options={FAILURE_TAGS}
            exclusiveValue={NOT_APPLICABLE}
            helper="Select all that apply. Choose N/A if there were no failures."
          />
          <LikertScale
            {...bindChoice('likertScore')}
            label="Likert Score"
            required
            options={LIKERT_SCALE}
            helper="Overall quality of the run, from 1 (very poor) to 5 (excellent)."
          />
          <SegmentedControl
            {...bindChoice('stateChangeValidated')}
            label="State Change Validated"
            required
            options={STATE_CHANGE_VALIDATED}
            helper="Whether you confirmed the change in the connected tool, for example a paused ad set."
          />
        </FormSection>

        <FormSection
          id="section-result"
          number="04"
          title="Actual Result and Additional Notes"
          description="What happened, and anything a reviewer should know."
          complete={sectionComplete('result')}
        >
          <TextArea
            {...bindInput('actualResult')}
            label="Actual Result"
            required
            rows={6}
            placeholder="Describe what the model actually did."
            helper="Include the tools it called, the data it reported, and any actions it took or skipped."
          />
          <TextArea
            {...bindInput('additionalNotes')}
            label="Additional Notes"
            required
            rows={5}
            placeholder="Observations about the candidate's experience and execution quality."
            helper="Note differences between expected and actual behaviour, friction, errors, or retries."
          />
        </FormSection>

        <section aria-labelledby="section-submit-title" className="rounded-xl border border-line bg-surface p-5 sm:p-7">
          <p className="mb-1 font-mono text-xs tracking-wider text-fg-subtle">05</p>
          <h2 id="section-submit-title" className="text-base font-semibold text-fg sm:text-lg">
            Submission
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            The evaluation is saved to Google Sheets. You will see a confirmation once the sheet has recorded it.
          </p>

          <div className="mt-5 empty:hidden">
            {status.state === 'invalid' && errorCount > 0 && (
              <StatusBanner tone="error" title={`${errorCount} ${errorCount === 1 ? 'field needs' : 'fields need'} attention`}>
                Fix the highlighted fields above, then submit again.
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
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        </section>
      </form>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset the form?"
        message="All entered answers will be cleared. This cannot be undone."
        confirmLabel="Reset Form"
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false)
          resetForm()
          setStatus({ state: 'idle' })
        }}
      />
    </>
  )
}
