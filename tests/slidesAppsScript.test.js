// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createAppsScriptEnv, FakeSpreadsheet } from './helpers/appsScriptHarness.js'

const AXES = ['contentQuality', 'storytelling', 'writingStyle', 'aesthetics', 'layout', 'overall']
const AXIS_NAMES = ['Content Quality', 'Storytelling', 'Writing Style', 'Aesthetics', 'Layout', 'Overall']
const SLIDES_HEADERS = [
  'Submission ID',
  'Submission Timestamp',
  'Task Code',
  'Task Title',
  ...['A', 'B', 'C'].flatMap((l) => AXIS_NAMES.flatMap((n) => [`Response ${l} ${n}`, `Response ${l} ${n} Explanation`])),
  'Rank 1',
  'Rank 2',
  'Rank 3',
  'Ranking Reason',
]

const link = (id) => `https://drive.google.com/file/d/${id}/view?usp=drive_link`
const TASK_HEADER = ['Code', 'Title', 'User request', 'Input files', 'Response A', 'Response B', 'Response C']
const THREE = ['SLIDES03', 'Rental deck', 'Make a deck.\nLine 2.', '', link('fileAAAAAAAAAA'), link('fileBBBBBBBBBB'), link('fileCCCCCCCCCC')]
const TWO = ['SLIDES02', '', 'Make a deck.', '', link('fileAAAAAAAAAA'), link('fileBBBBBBBBBB'), '']

function setup(slidesRows = [THREE, TWO], { tasks = [['FBADS001', 'Facebook Ads review', 'Pause it.']] } = {}) {
  const spreadsheet = new FakeSpreadsheet('sheet-123')
  spreadsheet.insertSheet('Tasks').rows.push(['Code', 'Title', 'Task'], ...tasks)
  const slidesTab = spreadsheet.insertSheet('Slides Tasks')
  slidesTab.rows.push(TASK_HEADER, ...slidesRows.map((r) => [...r]))
  const env = createAppsScriptEnv({
    properties: { SPREADSHEET_ID: 'sheet-123', SHEET_NAME: 'Evaluations' },
    spreadsheets: { 'sheet-123': spreadsheet },
  })
  return { env, spreadsheet, slidesTab, responses: () => spreadsheet.getSheetByName('Slides eval responses') }
}

function ratingsFor(labels, score = 5) {
  return Object.fromEntries(
    labels.map((l) => [
      l,
      Object.fromEntries(AXES.flatMap((a) => [[a, score], [`${a}Explanation`, `${l} ${a} reason`]])),
    ]),
  )
}

function slidesPayload(overrides = {}) {
  return {
    kind: 'slides',
    submissionId: '9a1b8c1e-6a4d-4f1b-9c2e-7d5a1b0e9f42',
    taskCode: 'SLIDES03',
    ratings: ratingsFor(['A', 'B', 'C']),
    ranking: ['B', 'A', 'C'],
    rankingReason: 'B told the clearest story.',
    origin: 'http://localhost:5173',
    ...overrides,
  }
}

describe('Apps Script slides tasks', () => {
  it('returns a slides task with its request, Drive file IDs and response labels', () => {
    const { env } = setup()
    expect(env.get({ action: 'task', code: 'slides-03' }).body).toEqual({
      ok: true,
      task: {
        code: 'SLIDES03',
        type: 'slides',
        title: 'Rental deck',
        request: 'Make a deck.\nLine 2.',
        inputFiles: [],
        responses: [
          { label: 'A', fileId: 'fileAAAAAAAAAA' },
          { label: 'B', fileId: 'fileBBBBBBBBBB' },
          { label: 'C', fileId: 'fileCCCCCCCCCC' },
        ],
      },
    })
    expect(env.get({ action: 'task', code: 'SLIDES02' }).body.task.responses.map((r) => r.label)).toEqual(['A', 'B'])
  })

  it('still returns connector tasks from the Tasks tab unchanged', () => {
    const { env } = setup()
    expect(env.get({ action: 'task', code: 'FBADS001' }).body.task).toEqual({
      code: 'FBADS001',
      title: 'Facebook Ads review',
      text: 'Pause it.',
    })
  })

  it('accepts Google Slides links and bare file IDs', () => {
    const row = [...TWO]
    row[0] = 'SLIDESX2'
    row[4] = 'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit#slide=id.p'
    row[5] = '1ZyXwVuTsRqPoNmLkJiHgF'
    const { env } = setup([row])
    expect(env.get({ action: 'task', code: 'SLIDESX2' }).body.task.responses).toEqual([
      { label: 'A', fileId: '1AbCdEfGhIjKlMnOp' },
      { label: 'B', fileId: '1ZyXwVuTsRqPoNmLkJiHgF' },
    ])
  })

  it('parses input files as names, "name | link" and Drive links with their Drive names', () => {
    const row = [...THREE]
    row[3] = [
      'image.webp',
      '  2024_20P.pdf | https://example.com/a.pdf ',
      'https://drive.google.com/file/d/knownFile12345/view',
      'https://drive.google.com/file/d/unknownFile123/view',
      'bad | javascript:alert(1)',
      '',
    ].join('\n')
    const { env } = setup([row])
    env.drive.files.set('knownFile12345', 'Financials.xlsx')
    expect(env.get({ action: 'task', code: 'SLIDES03' }).body.task.inputFiles).toEqual([
      { name: 'image.webp', url: '' },
      { name: '2024_20P.pdf', url: 'https://example.com/a.pdf' },
      { name: 'Financials.xlsx', url: 'https://drive.google.com/file/d/knownFile12345/view' },
      { name: 'https://drive.google.com/file/d/unknownFile123/view', url: 'https://drive.google.com/file/d/unknownFile123/view' },
      { name: 'bad', url: '' },
    ])
  })

  it('reports a configuration error for a missing Response B or a folder link', () => {
    const noB = [...TWO]
    noB[5] = ''
    const folder = [...THREE]
    folder[0] = 'FOLDER23'
    folder[6] = 'https://drive.google.com/drive/folders/1SbgbnwwPbsFtYGoT1eBvOLu6Iy4QFXgt'
    const { env } = setup([noB, folder])
    expect(env.get({ action: 'task', code: 'SLIDES02' }).body.error).toMatchObject({
      code: 'CONFIG_ERROR',
      message: expect.stringMatching(/Response A and Response B/),
    })
    expect(env.get({ action: 'task', code: 'FOLDER23' }).body.error).toMatchObject({
      code: 'CONFIG_ERROR',
      message: expect.stringMatching(/Response C .* not a Google Drive file link/),
    })
  })

  it('refuses a code used in both task tabs', () => {
    const row = [...THREE]
    row[0] = 'FBADS001'
    const { env } = setup([row])
    expect(env.get({ action: 'task', code: 'FBADS001' }).body.error.code).toBe('CONFIG_ERROR')
  })

  it('reports a configuration error when the Slides Tasks headers are wrong', () => {
    const spreadsheet = new FakeSpreadsheet('sheet-123')
    spreadsheet.insertSheet('Slides Tasks').rows.push(['Code', 'Title'], ['SLIDES03', 'x'])
    const env = createAppsScriptEnv({ properties: { SPREADSHEET_ID: 'sheet-123' }, spreadsheets: { 'sheet-123': spreadsheet } })
    expect(env.get({ action: 'task', code: 'SLIDES03' }).body.error.message).toBe(
      'Row 1 of the "Slides Tasks" tab must have "Code", "User request", "Response A" and "Response B" column headers.',
    )
  })
})

describe('Apps Script slides submissions', () => {
  it('writes one row with every rating, explanation and rank in order', () => {
    const { env, responses } = setup()
    const res = env.post(slidesPayload())
    expect(res.body).toMatchObject({ ok: true, submissionId: slidesPayload().submissionId, duplicate: false })

    const rows = responses().rows
    expect(rows[0]).toEqual(SLIDES_HEADERS)
    expect(rows).toHaveLength(2)
    const row = Object.fromEntries(SLIDES_HEADERS.map((h, i) => [h, rows[1][i]]))
    expect(row['Task Code']).toBe('SLIDES03')
    expect(row['Task Title']).toBe('Rental deck')
    expect(row['Response A Content Quality']).toBe(5)
    expect(row['Response C Overall Explanation']).toBe('C overall reason')
    expect([row['Rank 1'], row['Rank 2'], row['Rank 3']]).toEqual(['Response B', 'Response A', 'Response C'])
    expect(row['Ranking Reason']).toBe('B told the clearest story.')
  })

  it('leaves the Response C columns and Rank 3 empty for a two-response task', () => {
    const { env, responses } = setup()
    const res = env.post(slidesPayload({ taskCode: 'SLIDES02', ratings: ratingsFor(['A', 'B']), ranking: ['A', 'B'] }))
    expect(res.body.ok).toBe(true)
    const row = Object.fromEntries(SLIDES_HEADERS.map((h, i) => [h, responses().rows[1][i]]))
    expect(row['Response B Layout']).toBe(5)
    expect(row['Response C Content Quality']).toBe('')
    expect(row['Rank 3']).toBe('')
  })

  it('does not add a second row when the same submission is retried', () => {
    const { env, responses } = setup()
    env.post(slidesPayload())
    expect(env.post(slidesPayload()).body.duplicate).toBe(true)
    expect(responses().rows).toHaveLength(2)
  })

  it('rejects missing or out-of-range ratings, empty explanations and a bad ranking', () => {
    const { env, responses } = setup()
    const ratings = ratingsFor(['A', 'B', 'C'])
    ratings.A.storytelling = 8
    ratings.B.overall = 4.5
    delete ratings.C.layout
    ratings.C.aestheticsExplanation = '   '
    const res = env.post(slidesPayload({ ratings, ranking: ['A', 'A', 'B'], rankingReason: '' }))
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(res.body.error.fields).sort()).toEqual(
      ['A_storytelling', 'B_overall', 'C_layout', 'C_aestheticsExplanation', 'ranking', 'rankingReason'].sort(),
    )
    expect(responses()).toBeNull()
  })

  it('requires a ranking for every response in the task', () => {
    const { env } = setup()
    expect(env.post(slidesPayload({ ranking: ['A', 'B'] })).body.error.fields.ranking).toMatch(/A, B, C/)
  })

  it('refuses a connector code for a slides submission, and a slides code for a connector one', () => {
    const { env } = setup()
    expect(env.post(slidesPayload({ taskCode: 'FBADS001' })).body.error.code).toBe('INVALID_CODE')
    expect(env.post(slidesPayload({ taskCode: 'NOPE1234' })).body.error.code).toBe('INVALID_CODE')
  })

  it('never writes explanations as formulas', () => {
    const { env, responses } = setup()
    const ratings = ratingsFor(['A', 'B', 'C'])
    ratings.A.contentQualityExplanation = '=IMPORTXML("x")'
    env.post(slidesPayload({ ratings, rankingReason: '+1' }))
    expect(responses().formulaCells).toEqual([])
    expect(responses().rows[1]).toContain('=IMPORTXML("x")')
  })
})

describe('Apps Script setup for slides', () => {
  it('setupSheet creates the slides tabs and does not touch existing ones', () => {
    const spreadsheet = new FakeSpreadsheet('sheet-123')
    const env = createAppsScriptEnv({
      properties: { SPREADSHEET_ID: 'sheet-123', SHEET_NAME: 'Evaluations' },
      spreadsheets: { 'sheet-123': spreadsheet },
    })
    env.context.setupSheet()
    expect(spreadsheet.getSheetByName('Slides eval responses').rows).toEqual([SLIDES_HEADERS])
    const tasks = spreadsheet.getSheetByName('Slides Tasks')
    expect(tasks.rows).toEqual([TASK_HEADER])
    expect(tasks.frozenRows).toBe(1)
    env.context.setupSheet()
    expect(spreadsheet.getSheetByName('Slides Tasks').rows).toEqual([TASK_HEADER])
  })

  it('generateTaskCodes fills codes in both tabs, unique across them', () => {
    const blank = (title) => ['', title, 'Make a deck.', '', link('fileAAAAAAAAAA'), link('fileBBBBBBBBBB'), '']
    const { env, spreadsheet, slidesTab } = setup([blank('One'), blank('Two'), ['', '', '', '', '', '', '']], {
      tasks: [['', 'Connector', 'Do it.']],
    })
    env.context.generateTaskCodes()
    const codes = [spreadsheet.getSheetByName('Tasks').rows[1][0], slidesTab.rows[1][0], slidesTab.rows[2][0]]
    expect(codes.every((c) => /^[A-Z2-9]{8}$/.test(c))).toBe(true)
    expect(new Set(codes).size).toBe(3)
    expect(slidesTab.rows[3][0]).toBe('')
    expect(env.logs.flat().join('\n')).toMatch(/"Slides Tasks" row 2: new code/)
  })

  it('generateTaskCodes warns about a code used in both tabs', () => {
    const row = [...THREE]
    row[0] = 'fbads-001'
    const { env } = setup([row])
    env.context.generateTaskCodes()
    expect(env.logs.flat().join('\n')).toMatch(/FBADS001 is used by more than one row/)
  })
})
