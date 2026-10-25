import { MAX_TEXT_LENGTH } from '../config/formOptions.js'

export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function createInitialValues(now = new Date()) {
  return {
    dateOfTest: todayISO(now),
    platform: '',
    modelUsed: '',
    reasoningEffort: '',
    prompt: '',
    expectedResult: '',
    taskSuccess: '',
    whichIsBetter: '',
    latencySeconds: '',
    degradationReason: '',
    failureTags: [],
    likertScore: null,
    stateChangeValidated: '',
    actualResult: '',
    additionalNotes: '',
  }
}

// Field order matches the on-screen order so the first error can be focused.
export const FIELD_ORDER = Object.keys(createInitialValues())

export const SECTION_FIELDS = {
  basic: ['dateOfTest', 'platform', 'modelUsed', 'reasoningEffort'],
  prompt: ['prompt', 'expectedResult'],
  outcome: [
    'taskSuccess',
    'whichIsBetter',
    'latencySeconds',
    'degradationReason',
    'failureTags',
    'likertScore',
    'stateChangeValidated',
  ],
  result: ['actualResult', 'additionalNotes'],
}

const SELECT_LABELS = {
  platform: 'a platform',
  modelUsed: 'the model used',
  reasoningEffort: 'a reasoning / effort level',
  taskSuccess: 'a task success result',
  whichIsBetter: 'which is better',
  degradationReason: 'a degradation reason',
  stateChangeValidated: 'whether the state change was validated',
}

const TEXT_LABELS = {
  prompt: 'the prompt',
  expectedResult: 'the expected result',
  actualResult: 'the actual result',
  additionalNotes: 'additional notes',
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function parseLatency(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: false, error: 'Enter the latency in seconds.' }
  // Number('') and Number(' ') are 0, and Number('1e3') is valid; only accept plain decimals.
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) {
    return { ok: false, error: 'Latency must be a non-negative number, for example 12 or 4.5.' }
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Latency must be a non-negative number, for example 12 or 4.5.' }
  }
  return { ok: true, value }
}

export function isValidLikert(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

export function validate(values) {
  const errors = {}

  if (!values.dateOfTest) errors.dateOfTest = 'Select the date of the test.'
  else if (!isValidDateString(values.dateOfTest)) errors.dateOfTest = 'Enter a valid date.'

  for (const [field, label] of Object.entries(SELECT_LABELS)) {
    if (!values[field]) errors[field] = `Select ${label}.`
  }

  for (const [field, label] of Object.entries(TEXT_LABELS)) {
    const text = values[field] ?? ''
    if (text.trim() === '') errors[field] = `Enter ${label}.`
    else if (text.length > MAX_TEXT_LENGTH) {
      errors[field] = `Keep this under ${MAX_TEXT_LENGTH.toLocaleString()} characters (currently ${text.length.toLocaleString()}).`
    }
  }

  const latency = parseLatency(values.latencySeconds)
  if (!latency.ok) errors.latencySeconds = latency.error

  if (!Array.isArray(values.failureTags) || values.failureTags.length === 0) {
    errors.failureTags = 'Select at least one failure tag, or N/A.'
  }

  if (values.likertScore === null || values.likertScore === undefined) {
    errors.likertScore = 'Select a score from 1 to 5.'
  } else if (!isValidLikert(values.likertScore)) {
    errors.likertScore = 'The score must be a whole number from 1 to 5.'
  }

  return errors
}

export function buildPayload(values, submissionId) {
  return {
    submissionId,
    dateOfTest: values.dateOfTest,
    platform: values.platform,
    modelUsed: values.modelUsed,
    reasoningEffort: values.reasoningEffort,
    prompt: values.prompt,
    expectedResult: values.expectedResult,
    taskSuccess: values.taskSuccess,
    whichIsBetter: values.whichIsBetter,
    latencySeconds: parseLatency(values.latencySeconds).value,
    degradationReason: values.degradationReason,
    failureTags: [...values.failureTags],
    likertScore: values.likertScore,
    stateChangeValidated: values.stateChangeValidated,
    actualResult: values.actualResult,
    additionalNotes: values.additionalNotes,
  }
}
