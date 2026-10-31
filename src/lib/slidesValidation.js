import { MAX_TEXT_LENGTH } from '../config/formOptions.js'
import { OVERALL_AXIS, SLIDES_AXES } from '../config/slidesEval.js'

// Every rated axis, in on-screen order: the five axes, then Overall.
export const RATED_AXES = [...SLIDES_AXES, OVERALL_AXIS]

// Field IDs, also used as data-field attributes for focusing the first error.
export const ratingId = (label, key) => `${label}-${key}`
export const explanationId = (label, key) => `${label}-${key}Explanation`
export const rankId = (index) => `rank-${index + 1}`
export const RANKING_REASON_ID = 'rankingReason'

export function createInitialSlidesValues(labels) {
  const ratings = {}
  for (const label of labels) {
    ratings[label] = {}
    for (const axis of RATED_AXES) {
      ratings[label][axis.key] = null
      ratings[label][`${axis.key}Explanation`] = ''
    }
  }
  return { ratings, ranking: labels.map(() => ''), rankingReason: '' }
}

// Field IDs in on-screen order: each response column from top to bottom, then
// the ranking.
export function slidesFieldOrder(labels) {
  return [
    ...labels.flatMap((label) => RATED_AXES.flatMap((axis) => [ratingId(label, axis.key), explanationId(label, axis.key)])),
    ...labels.map((_, i) => rankId(i)),
    RANKING_REASON_ID,
  ]
}

function explanationError(text) {
  if (text.trim() === '') return 'Explain this rating.'
  if (text.length > MAX_TEXT_LENGTH) return `Keep this under ${MAX_TEXT_LENGTH.toLocaleString()} characters.`
  return undefined
}

// Returns { [fieldId]: message } for every missing or invalid answer.
export function validateSlides(values, labels) {
  const errors = {}
  for (const label of labels) {
    const given = values.ratings[label]
    for (const axis of RATED_AXES) {
      if (given[axis.key] == null) errors[ratingId(label, axis.key)] = 'Choose a rating from 1 to 7.'
      const error = explanationError(given[`${axis.key}Explanation`])
      if (error) errors[explanationId(label, axis.key)] = error
    }
  }
  values.ranking.forEach((label, i) => {
    if (!label) errors[rankId(i)] = 'Choose a response for this rank.'
  })
  if (values.rankingReason.trim() === '') errors[RANKING_REASON_ID] = 'Explain what drove the ranking.'
  else if (values.rankingReason.length > MAX_TEXT_LENGTH) {
    errors[RANKING_REASON_ID] = `Keep this under ${MAX_TEXT_LENGTH.toLocaleString()} characters.`
  }
  return errors
}

// Picking a response for one rank removes it from any other rank, so each
// response is ranked once.
export function setRank(ranking, index, label) {
  return ranking.map((current, i) => (i === index ? label : current === label ? '' : current))
}

export function buildSlidesPayload(values, labels, submissionId, taskCode) {
  return {
    kind: 'slides',
    submissionId,
    taskCode,
    ratings: Object.fromEntries(labels.map((label) => [label, { ...values.ratings[label] }])),
    ranking: [...values.ranking],
    rankingReason: values.rankingReason,
  }
}
