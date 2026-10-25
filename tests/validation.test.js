import { describe, expect, it } from 'vitest'
import { buildPayload, createInitialValues, isValidLikert, parseLatency, validate } from '../src/lib/validation.js'

function filledValues(overrides = {}) {
  return {
    ...createInitialValues(new Date(2026, 9, 25)),
    platform: 'Codex',
    modelUsed: 'Other',
    reasoningEffort: 'Medium',
    prompt: 'p',
    expectedResult: 'e',
    taskSuccess: 'Partial',
    whichIsBetter: 'N/A',
    latencySeconds: '12.5',
    degradationReason: 'N/A',
    failureTags: ['Timeout'],
    likertScore: 3,
    stateChangeValidated: 'No',
    actualResult: 'a',
    additionalNotes: 'n',
    ...overrides,
  }
}

describe('validate', () => {
  it('flags every required field on an empty form', () => {
    const errors = validate({ ...createInitialValues(), dateOfTest: '' })
    expect(Object.keys(errors).sort()).toEqual(
      [
        'dateOfTest',
        'platform',
        'modelUsed',
        'reasoningEffort',
        'prompt',
        'expectedResult',
        'taskSuccess',
        'whichIsBetter',
        'latencySeconds',
        'degradationReason',
        'failureTags',
        'likertScore',
        'stateChangeValidated',
        'actualResult',
        'additionalNotes',
      ].sort(),
    )
  })

  it('accepts a complete form', () => {
    expect(validate(filledValues())).toEqual({})
  })

  it('treats whitespace-only text as empty', () => {
    expect(validate(filledValues({ prompt: '  \n\t ' }))).toHaveProperty('prompt')
  })

  it('rejects impossible dates', () => {
    expect(validate(filledValues({ dateOfTest: '2026-02-30' }))).toHaveProperty('dateOfTest')
  })

  it('rejects text over the Sheets cell limit', () => {
    expect(validate(filledValues({ actualResult: 'x'.repeat(50001) }))).toHaveProperty('actualResult')
  })
})

describe('parseLatency', () => {
  it.each([
    ['0', 0],
    ['12', 12],
    ['4.5', 4.5],
    [' 3 ', 3],
    ['.5', 0.5],
  ])('accepts %j', (raw, value) => {
    expect(parseLatency(raw)).toEqual({ ok: true, value })
  })

  it.each(['', '  ', '-1', 'abc', '1e3', '12s', '1.2.3', 'Infinity', '0x10', '5.'])('rejects %j', (raw) => {
    expect(parseLatency(raw).ok).toBe(false)
  })
})

describe('isValidLikert', () => {
  it.each([1, 2, 3, 4, 5])('accepts %d', (n) => expect(isValidLikert(n)).toBe(true))
  it.each([0, 6, 2.5, '3', null, Number.NaN])('rejects %j', (n) => expect(isValidLikert(n)).toBe(false))
})

describe('buildPayload', () => {
  it('converts latency to a number and copies the tag list', () => {
    const values = filledValues()
    const payload = buildPayload(values, 'id-12345678')
    expect(payload.latencySeconds).toBe(12.5)
    expect(payload.submissionId).toBe('id-12345678')
    expect(payload.failureTags).not.toBe(values.failureTags)
    expect(payload).not.toHaveProperty('origin')
  })
})
