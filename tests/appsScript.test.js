// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createAppsScriptEnv, FakeSpreadsheet } from './helpers/appsScriptHarness.js'
import { validPayload } from './helpers/fixtures.js'

const HEADERS = [
  'Submission ID',
  'Submission Timestamp',
  'Date of Test',
  'Platform',
  'Model Used',
  'Reasoning / Effort',
  'Prompt',
  'Expected Result',
  'Task Success',
  'Which Is Better',
  'Latency (seconds)',
  'Degradation Reason',
  'Failure Tags',
  'Likert Score',
  'State Change Validated',
  'Actual Result',
  'Additional Notes',
]

function setup(properties = {}) {
  const spreadsheet = new FakeSpreadsheet('sheet-123')
  const env = createAppsScriptEnv({
    properties: { SPREADSHEET_ID: 'sheet-123', SHEET_NAME: 'Evaluations', ...properties },
    spreadsheets: { 'sheet-123': spreadsheet },
  })
  const sheet = () => spreadsheet.getSheetByName(properties.SHEET_NAME || 'Evaluations')
  return { env, spreadsheet, sheet }
}

describe('Apps Script doPost', () => {
  it('appends exactly one row with all columns in order for a valid submission', () => {
    const { env, sheet } = setup()
    const res = env.post(validPayload())

    expect(res.mimeType).toBe('application/json')
    expect(res.body).toMatchObject({ ok: true, submissionId: validPayload().submissionId, duplicate: false })
    expect(new Date(res.body.submittedAt).toISOString()).toBe(res.body.submittedAt)

    const rows = sheet().rows
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(HEADERS)
    expect(sheet().frozenRows).toBe(1)

    const p = validPayload()
    expect(rows[1]).toEqual([
      p.submissionId,
      res.body.submittedAt,
      '2026-10-25',
      'Claude Cowork',
      'Claude Opus 5.5',
      'High',
      p.prompt,
      p.expectedResult,
      'Pass',
      'Claude',
      42.5,
      'N/A',
      'N/A',
      5,
      'Yes',
      p.actualResult,
      'Clean run.',
    ])
  })

  it('stores multiline text and special characters exactly', () => {
    const { env, sheet } = setup()
    const tricky = 'Line 1\nLine 2\r\n\tTabbed "quotes" \'single\' <b>html</b> & ampersand\n' + 'Unicode: café, 日本語, ü, € — 100%'
    env.post(validPayload({ prompt: tricky, additionalNotes: '3/4' , actualResult: '007' }))
    const row = sheet().rows[1]
    expect(row[6]).toBe(tricky)
    expect(row[15]).toBe('007')
    expect(row[16]).toBe('3/4')
  })

  it('never writes user text as a spreadsheet formula', () => {
    const { env, sheet } = setup()
    env.post(
      validPayload({
        prompt: '=IMPORTXML("http://evil.example","//a")',
        expectedResult: '+SUM(A1:A9)',
        actualResult: '-2+3',
        additionalNotes: '@mention',
        modelUsed: '=HYPERLINK("x")',
        failureTags: ['=1+1', 'Other'],
      }),
    )
    expect(sheet().formulaCells).toEqual([])
    const row = sheet().rows[1]
    expect(row[6]).toBe('=IMPORTXML("http://evil.example","//a")')
    expect(row[7]).toBe('+SUM(A1:A9)')
    expect(row[12]).toBe('=1+1, Other')
  })

  it('joins multiple failure tags', () => {
    const { env, sheet } = setup()
    env.post(validPayload({ failureTags: ['Tool call error', 'Timeout'] }))
    expect(sheet().rows[1][12]).toBe('Tool call error, Timeout')
  })

  it('does not add a second row when the same submission ID is retried', () => {
    const { env, sheet } = setup()
    const first = env.post(validPayload())
    const second = env.post(validPayload())
    expect(second.body).toMatchObject({ ok: true, duplicate: true, submittedAt: first.body.submittedAt })
    expect(sheet().rows).toHaveLength(2)

    env.post(validPayload({ submissionId: 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb' }))
    expect(sheet().rows).toHaveLength(3)
  })

  it.each([
    ['empty body', ''],
    ['invalid JSON', '{not json'],
    ['JSON array', '[1,2]'],
    ['JSON null', 'null'],
  ])('rejects a malformed request (%s)', (_name, raw) => {
    const { env, sheet } = setup()
    const res = env.post(raw)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(sheet()).toBeNull()
  })

  it('rejects missing and invalid fields with per-field messages', () => {
    const { env, sheet } = setup()
    const res = env.post(
      validPayload({
        prompt: '   ',
        actualResult: undefined,
        latencySeconds: -1,
        likertScore: 4.5,
        taskSuccess: 'Maybe',
        dateOfTest: '2026-02-30',
        failureTags: [],
        submissionId: 'x',
      }),
    )
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(res.body.error.fields).sort()).toEqual(
      ['actualResult', 'dateOfTest', 'failureTags', 'latencySeconds', 'likertScore', 'prompt', 'submissionId', 'taskSuccess'].sort(),
    )
    expect(sheet()).toBeNull()
  })

  it.each([0, 6, '5', null])('rejects Likert score %s', (likertScore) => {
    const { env } = setup()
    expect(env.post(validPayload({ likertScore })).body.error.fields).toHaveProperty('likertScore')
  })

  it.each(['12', null, Number.NaN, -0.1])('rejects latency %s', (latencySeconds) => {
    const { env } = setup()
    expect(env.post(validPayload({ latencySeconds })).body.error.fields).toHaveProperty('latencySeconds')
  })

  it('accepts zero latency', () => {
    const { env } = setup()
    expect(env.post(validPayload({ latencySeconds: 0 })).body.ok).toBe(true)
  })

  it('rejects text over the Sheets cell limit', () => {
    const { env } = setup()
    const res = env.post(validPayload({ prompt: 'x'.repeat(50001) }))
    expect(res.body.error.fields).toHaveProperty('prompt')
  })

  it('reports a configuration error when the spreadsheet cannot be opened', () => {
    const { env } = setup({ SPREADSHEET_ID: 'missing' })
    const res = env.post(validPayload())
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: expect.stringContaining('SPREADSHEET_ID') },
    })
  })

  it('uses the bound spreadsheet when SPREADSHEET_ID is not set', () => {
    const active = new FakeSpreadsheet('bound')
    const env = createAppsScriptEnv({ activeSpreadsheet: active })
    expect(env.post(validPayload()).body.ok).toBe(true)
    expect(active.getSheetByName('Evaluations').rows).toHaveLength(2)
  })

  it('writes to the configured worksheet name', () => {
    const { env, spreadsheet } = setup({ SHEET_NAME: 'Round 2' })
    env.post(validPayload())
    expect(spreadsheet.getSheetByName('Round 2').rows).toHaveLength(2)
  })

  it('refuses to write when the header row does not match', () => {
    const { env, spreadsheet } = setup()
    const sheet = spreadsheet.insertSheet('Evaluations')
    sheet.rows.push(['Something else'])
    const res = env.post(validPayload())
    expect(res.body.error.code).toBe('CONFIG_ERROR')
    expect(sheet.rows).toHaveLength(1)
  })

  it('returns a generic error without internal details on unexpected failures', () => {
    const { env, spreadsheet } = setup()
    spreadsheet.insertSheet('Evaluations').getRange = () => {
      throw new Error('internal stack detail')
    }
    const res = env.post(validPayload())
    expect(res.body).toEqual({ ok: false, error: { code: 'SERVER_ERROR', message: expect.any(String) } })
    expect(JSON.stringify(res.body)).not.toContain('internal stack detail')
  })

  it('returns BUSY when the lock cannot be acquired', () => {
    const { env, sheet } = setup()
    env.setLockAvailable(false)
    expect(env.post(validPayload()).body.error.code).toBe('BUSY')
    expect(sheet()).toBeNull()
  })

  it('enforces ALLOWED_ORIGINS when configured', () => {
    const { env, sheet } = setup({ ALLOWED_ORIGINS: 'https://evals.example.com/, http://localhost:5173' })
    expect(env.post(validPayload({ origin: 'https://other.example' })).body.error.code).toBe('FORBIDDEN_ORIGIN')
    expect(env.post(validPayload({ origin: undefined })).body.error.code).toBe('FORBIDDEN_ORIGIN')
    expect(env.post(validPayload({ origin: 'https://evals.example.com' })).body.ok).toBe(true)
    expect(sheet().rows).toHaveLength(2)
  })
})

describe('Apps Script doGet', () => {
  it('reports readiness', () => {
    const { env } = setup()
    expect(env.get().body).toEqual({ ok: true, service: 'candidate-evaluation', sheet: 'Evaluations' })
  })
})
