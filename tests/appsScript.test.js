// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createAppsScriptEnv, FakeSpreadsheet } from './helpers/appsScriptHarness.js'
import { validPayload } from './helpers/fixtures.js'

const DEFAULT_SPREADSHEET_ID = '1GCcvSXo3hH6yuxsi9bVnJitYukiLi2GZO5FYUKXLlBo'

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
  'Task Code',
  'Task Title',
]

function addTasksTab(spreadsheet, rows = [['FBADS001', 'Facebook Ads review', 'Pause the worst ad set.']]) {
  const tab = spreadsheet.insertSheet('Tasks')
  tab.rows.push(['Code', 'Title', 'Task'], ...rows)
  return tab
}

function setup(properties = {}) {
  const spreadsheet = new FakeSpreadsheet('sheet-123')
  addTasksTab(spreadsheet)
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
      'FBADS001',
      'Facebook Ads review',
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

  it('uses the default spreadsheet ID and tab name when no properties are set', () => {
    const spreadsheet = new FakeSpreadsheet(DEFAULT_SPREADSHEET_ID)
    addTasksTab(spreadsheet)
    const env = createAppsScriptEnv({ spreadsheets: { [DEFAULT_SPREADSHEET_ID]: spreadsheet } })
    expect(env.post(validPayload()).body.ok).toBe(true)
    expect(spreadsheet.getSheetByName('AI training responses').rows).toHaveLength(2)
  })

  it('rejects "Tie" for Which Is Better', () => {
    const { env } = setup()
    expect(env.post(validPayload({ whichIsBetter: 'Tie' })).body.error.fields).toHaveProperty('whichIsBetter')
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

  it('requires a task code', () => {
    const { env, sheet } = setup()
    for (const taskCode of [undefined, '', ' - ', 42]) {
      const res = env.post(validPayload({ taskCode }))
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.fields).toHaveProperty('taskCode')
    }
    expect(sheet()).toBeNull()
  })

  it('rejects a task code that matches no task, without writing a row', () => {
    const { env, sheet } = setup()
    const res = env.post(validPayload({ taskCode: 'NOPE1234' }))
    expect(res.body).toEqual({ ok: false, error: { code: 'INVALID_CODE', message: expect.stringContaining('no longer valid') } })
    expect(sheet()).toBeNull()
  })

  it('matches the task code regardless of case, spaces and dashes, and stores the canonical code', () => {
    const { env, sheet } = setup()
    expect(env.post(validPayload({ taskCode: ' fbads-001 ' })).body.ok).toBe(true)
    expect(sheet().rows[1].slice(-2)).toEqual(['FBADS001', 'Facebook Ads review'])
  })

  it('adds the task columns to a responses tab created before task codes', () => {
    const { env, spreadsheet } = setup()
    const sheet = spreadsheet.insertSheet('Evaluations')
    const oldRow = ['old-id', '2026-01-01T00:00:00.000Z', ...Array(15).fill('x')]
    sheet.rows.push(HEADERS.slice(0, 17), oldRow)
    expect(env.post(validPayload()).body.ok).toBe(true)
    expect(sheet.rows[0]).toEqual(HEADERS)
    expect(sheet.rows[1]).toEqual(oldRow)
    expect(sheet.rows[2].slice(-2)).toEqual(['FBADS001', 'Facebook Ads review'])
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
  function setupTasks(rows, properties = {}) {
    const spreadsheet = new FakeSpreadsheet('sheet-123')
    const tab = spreadsheet.insertSheet(properties.TASK_SHEET_NAME || 'Tasks')
    tab.rows.push(...rows)
    const env = createAppsScriptEnv({
      properties: { SPREADSHEET_ID: 'sheet-123', SHEET_NAME: 'Evaluations', ...properties },
      spreadsheets: { 'sheet-123': spreadsheet },
    })
    return { env, tab }
  }

  const TASKS = [
    ['Code', 'Title', 'Task'],
    ['FBADS001', '  Facebook Ads review  ', 'Step 1: find the worst ad set.\nStep 2: pause it.'],
    ['SHOP0002', 'Shopify restock', 'Restock the lowest-stock products.'],
    ['', 'Draft task', 'Not ready yet.'],
  ]

  it('reports readiness', () => {
    const { env } = setup()
    expect(env.get().body).toEqual({ ok: true, service: 'candidate-evaluation', sheet: 'Evaluations' })
  })

  it('returns only the task whose code matches, keeping line breaks', () => {
    const { env } = setupTasks(TASKS)
    expect(env.get({ action: 'task', code: 'FBADS001' }).body).toEqual({
      ok: true,
      task: { code: 'FBADS001', title: 'Facebook Ads review', text: 'Step 1: find the worst ad set.\nStep 2: pause it.' },
    })
    expect(env.get({ action: 'task', code: 'SHOP0002' }).body.task.title).toBe('Shopify restock')
  })

  it('matches codes regardless of case, spaces and dashes', () => {
    const { env } = setupTasks(TASKS)
    expect(env.get({ action: 'task', code: ' shop-0002 ' }).body.task.code).toBe('SHOP0002')
  })

  it.each([undefined, '', 'WRONG123', 'FBADS00'])('returns INVALID_CODE and no task text for code %s', (code) => {
    const { env } = setupTasks(TASKS)
    const body = env.get({ action: 'task', code }).body
    expect(body).toEqual({ ok: false, error: { code: 'INVALID_CODE', message: expect.any(String) } })
    expect(JSON.stringify(body)).not.toMatch(/Facebook|Shopify|Draft/)
  })

  it('never returns a task whose Code cell is empty', () => {
    const { env } = setupTasks(TASKS)
    expect(env.get({ action: 'task', code: '' }).body.ok).toBe(false)
  })

  it('refuses a code shared by more than one task', () => {
    const { env } = setupTasks([...TASKS, ['fbads-001', 'Copy', 'Other task']])
    const body = env.get({ action: 'task', code: 'FBADS001' }).body
    expect(body.error.code).toBe('CONFIG_ERROR')
    expect(JSON.stringify(body)).not.toMatch(/Facebook|Other task/)
  })

  it('finds the columns by header, in any order, ignoring extra columns', () => {
    const { env } = setupTasks([
      ['Assigned to', 'task', 'CODE'],
      ['Sam', 'Do the thing', 'ABCD2345'],
    ])
    expect(env.get({ action: 'task', code: 'ABCD2345' }).body.task).toEqual({ code: 'ABCD2345', title: '', text: 'Do the thing' })
  })

  it('reports a configuration error when the Code or Task header is missing', () => {
    const { env } = setupTasks([['Field', 'Value'], ['Title', 'x'], ['Task', 'y']])
    expect(env.get({ action: 'task', code: 'Task' }).body.error.code).toBe('CONFIG_ERROR')
  })

  it('reads the tasks from TASK_SHEET_NAME when set', () => {
    const { env } = setupTasks([['Code', 'Task'], ['ROUND222', 'Round 2 task']], { TASK_SHEET_NAME: 'Round 2' })
    expect(env.get({ action: 'task', code: 'ROUND222' }).body.task.text).toBe('Round 2 task')
  })

  it('returns INVALID_CODE when the Tasks tab is missing', () => {
    const env = createAppsScriptEnv({
      properties: { SPREADSHEET_ID: 'sheet-123' },
      spreadsheets: { 'sheet-123': new FakeSpreadsheet('sheet-123') },
    })
    expect(env.get({ action: 'task', code: 'FBADS001' }).body.error.code).toBe('INVALID_CODE')
  })

  it('reports a configuration error when the spreadsheet cannot be opened', () => {
    const { env } = setup({ SPREADSHEET_ID: 'missing' })
    expect(env.get({ action: 'task', code: 'FBADS001' }).body.error.code).toBe('CONFIG_ERROR')
  })
})

describe('Apps Script setupSheet and generateTaskCodes', () => {
  const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/

  function emptySetup() {
    const spreadsheet = new FakeSpreadsheet('sheet-123')
    const env = createAppsScriptEnv({
      properties: { SPREADSHEET_ID: 'sheet-123', SHEET_NAME: 'Evaluations' },
      spreadsheets: { 'sheet-123': spreadsheet },
    })
    return { env, spreadsheet }
  }

  it('creates the response header and a Tasks tab with a coded placeholder task', () => {
    const { env, spreadsheet } = emptySetup()
    env.context.setupSheet()
    expect(spreadsheet.getSheetByName('Evaluations').rows[0]).toEqual(HEADERS)
    const tasks = spreadsheet.getSheetByName('Tasks')
    expect(tasks.rows[0]).toEqual(['Code', 'Title', 'Task'])
    expect(tasks.rows).toHaveLength(2)
    expect(tasks.rows[1][0]).toMatch(CODE)
    expect(tasks.frozenRows).toBe(1)
    expect(env.get({ action: 'task', code: tasks.rows[1][0] }).body.task.title).toBe('Task title')
  })

  it('copies the task from the old single-task "Task" tab', () => {
    const { env, spreadsheet } = emptySetup()
    spreadsheet.insertSheet('Task').rows.push(['Field', 'Value'], ['Title', 'Old title'], ['Task', 'Old text\nline 2'])
    env.context.setupSheet()
    const row = spreadsheet.getSheetByName('Tasks').rows[1]
    expect(row.slice(1)).toEqual(['Old title', 'Old text\nline 2'])
    expect(row[0]).toMatch(CODE)
    expect(spreadsheet.getSheetByName('Task').rows).toHaveLength(3)
  })

  it('keeps an existing Tasks tab and its codes, only filling in missing ones', () => {
    const { env, spreadsheet } = emptySetup()
    const tab = addTasksTab(spreadsheet, [
      ['KEEP2345', 'A', 'Task A'],
      ['', 'B', 'Task B'],
      ['', '', ''],
      ['', '', '=not a formula'],
    ])
    env.context.setupSheet()
    expect(tab.rows[1]).toEqual(['KEEP2345', 'A', 'Task A'])
    expect(tab.rows[2][0]).toMatch(CODE)
    expect(tab.rows[3][0]).toBe('')
    expect(tab.rows[4][0]).toMatch(CODE)
    expect(tab.formulaCells).toEqual([])
  })

  it('generateTaskCodes gives every new task a different code and warns about duplicates', () => {
    const { env, spreadsheet } = emptySetup()
    const rows = Array.from({ length: 50 }, (_, i) => ['', `Task ${i}`, 'Text'])
    const tab = addTasksTab(spreadsheet, [['DUPE2345', 'X', 'x'], ['dupe-2345', 'Y', 'y'], ...rows])
    env.context.generateTaskCodes()
    const codes = tab.rows.slice(3).map((r) => r[0])
    expect(codes.every((c) => CODE.test(c))).toBe(true)
    expect(new Set([...codes, 'DUPE2345']).size).toBe(51)
    expect(env.logs.flat().join('\n')).toMatch(/DUPE2345 is used by more than one row/)
  })

  it('generateTaskCodes explains when there is no Tasks tab', () => {
    const { env } = emptySetup()
    expect(() => env.context.generateTaskCodes()).toThrow(/Run setupSheet first/)
  })
})
