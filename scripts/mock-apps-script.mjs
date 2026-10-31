// Local stand-in for the deployed Apps Script web app, for manual and browser
// testing without Google credentials. It runs the real apps-script/Code.gs
// against an in-memory sheet and mimics Apps Script's CORS behaviour
// (Access-Control-Allow-Origin: *, no preflight support).
//
//   npm run mock:backend            # http://localhost:8787/exec
//   GET  /exec?action=task&code=FBADS001   # task for a code (also SHOPIFY2,
//                                   # and the slides tasks SLIDES03, SLIDES02)
//   GET  /rows                      # inspect stored rows as JSON
//   GET  /rows?tab=slides           # inspect stored slides evaluations
//   GET  /mode?fail=1&delay=3000    # simulate server errors / slow responses
//   GET  /mode                      # back to normal behaviour

import { createServer } from 'node:http'
import { createAppsScriptEnv, FakeSpreadsheet } from '../tests/helpers/appsScriptHarness.js'

const PORT = Number(process.env.PORT || 8787)
const spreadsheet = new FakeSpreadsheet('local-mock')
const mode = { fail: false, delay: 0 }
spreadsheet.insertSheet('Tasks').rows.push(
  ['Code', 'Title', 'Task'],
  [
    'FBADS001',
    'Facebook Ads performance review',
    [
      'Connector: Facebook Ads',
      'Surface: Web app',
      'Platform to be used: Claude Cowork',
      'Hero Use Case: Find the worst-performing ad set and pause it',
      'Power-User- Workflow: Compare CPA across all active ad sets for the last 7 days',
      'Why High Value: Stops wasted spend without manual analysis',
      'Key Actions Exercised: Read ad set insights, update ad set status',
      'State Changing: Yes',
      'Setup Difficulty: Medium',
      'Payments/ Real Interactions: Real ad spend is affected',
    ].join('\n'),
  ],
  ['SHOPIFY2', 'Shopify inventory restock', 'Connector: Shopify\nHero Use Case: Restock the three lowest-stock products'],
)
// The Drive file IDs are placeholders, so the previews show Drive's "file not
// found" page. Put real IDs of files shared with "Anyone with the link" here
// to see actual slides.
const deck = (id) => `https://drive.google.com/file/d/${id}/view?usp=drive_link`
const request =
  'Please create a PowerPoint presentation comparing annual leases and short-term rentals for four single family homes in Ft. Lauderdale, and recommend one clear path that maximizes total profit after a three-year hold.'
spreadsheet.insertSheet('Slides Tasks').rows.push(
  ['Code', 'Title', 'User request', 'Input files', 'Response A', 'Response B', 'Response C'],
  [
    'SLIDES03',
    'Rental strategy deck - graphics heavy',
    request,
    'image.webp\n2024_20P.pdf | https://example.com/2024_20P.pdf\n801 NW 24th St, Fort Lauderdale, FL 33311 (1).xlsx',
    deck('mockResponseA1234567890'),
    deck('mockResponseB1234567890'),
    deck('mockResponseC1234567890'),
  ],
  ['SLIDES02', '', request, '', deck('mockResponseA1234567890'), deck('mockResponseB1234567890'), ''],
)
const env = createAppsScriptEnv({
  properties: { SPREADSHEET_ID: 'local-mock', SHEET_NAME: 'Evaluations' },
  spreadsheets: { 'local-mock': spreadsheet },
})

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2))
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'OPTIONS') {
    // The real Apps Script returns 405 for preflight requests; mirror that so
    // a request that triggers preflight fails here too.
    res.writeHead(405)
    return res.end()
  }

  if (req.method === 'GET' && url.pathname === '/rows') {
    const sheet = spreadsheet.getSheetByName(url.searchParams.get('tab') === 'slides' ? 'Slides eval responses' : 'Evaluations')
    return send(res, 200, { rows: sheet ? sheet.rows : [], formulaCells: sheet ? sheet.formulaCells : [] })
  }

  if (req.method === 'GET' && url.pathname === '/mode') {
    mode.fail = url.searchParams.get('fail') === '1'
    mode.delay = Number(url.searchParams.get('delay') || 0)
    return send(res, 200, mode)
  }

  if (url.pathname !== '/exec') return send(res, 404, 'Not found', 'text/plain')
  if (req.method === 'GET') return send(res, 200, env.get(Object.fromEntries(url.searchParams)).body)
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed', 'text/plain')

  let raw = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    setTimeout(() => {
      if (mode.fail) {
        return send(res, 200, { ok: false, error: { code: 'SERVER_ERROR', message: 'Simulated server error.' } })
      }
      const output = env.context.doPost({ postData: { contents: raw, type: req.headers['content-type'] } })
      send(res, 200, output.content)
    }, mode.delay)
  })
}).listen(PORT, () => {
  console.log(`Mock Apps Script listening on http://localhost:${PORT}/exec (rows at /rows)`)
  console.log('Sample task codes: FBADS001, SHOPIFY2, and slides tasks SLIDES03 (3 responses), SLIDES02 (2 responses)')
})
