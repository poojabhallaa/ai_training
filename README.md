# Candidate Evaluation

A single-page form for evaluating candidates on AI connector tasks, such as analyzing Facebook Ads performance, finding underperforming ad sets, and taking actions through connected tools. Each submission is stored as one row in a Google Sheet through a small Google Apps Script web app. There is no database and no paid backend.

- **Frontend:** React 19, Vite, Tailwind CSS v4 (static site, deployable anywhere)
- **Backend and storage:** Google Apps Script web app writing to Google Sheets
- **Tests:** Vitest, Testing Library, and a Node harness that runs the real Apps Script code against an in-memory sheet

## Features

- Five sections: Basic Information, Prompt and Expected Result, Evaluation of Outcome, Actual Result and Additional Notes, and Submission
- Inline validation on blur and on submit, with errors shown next to each field and focus moved to the first invalid field
- Latency must be a non-negative decimal number. Likert score is limited to whole numbers from 1 to 5.
- Failure Tags is a multi-select. N/A is exclusive and cannot be combined with other tags.
- A per-section "Complete" indicator
- A loading state while submitting. The button is locked so a request cannot be sent twice.
- A success message appears only after the Apps Script backend confirms that the row was written. It shows the submission ID and the server timestamp.
- Error messages explain what went wrong, and entered data is kept when a submission fails
- Each evaluation gets a unique submission ID. Retrying a failed request reuses that ID, so the server never writes a second row for the same evaluation.
- Reset Form asks for confirmation if any data has been entered
- Dark, responsive layout tested from 320px to 1440px wide. No emoji and no file or image uploads.

## Project structure

```
apps-script/
  Code.gs               Apps Script backend (doPost, doGet, setupSheet)
  appsscript.json       Apps Script manifest (scopes, web app settings)
src/
  config/formOptions.js Dropdown and choice options (edit to customize)
  lib/validation.js     Client-side validation and payload building
  lib/submitEvaluation.js  Client for the Apps Script endpoint
  components/           Form, field controls, layout, and icons
tests/                  Unit, component, and backend tests
scripts/mock-apps-script.mjs  Local stand-in for the Apps Script endpoint
.github/workflows/deploy.yml  Optional GitHub Pages deployment
```

## Configuration values

| Where | Name | Required | Description |
| --- | --- | --- | --- |
| Frontend (`.env`) | `VITE_APPS_SCRIPT_URL` | Yes | The Apps Script web app URL, ending in `/exec`. |
| Frontend (`.env`) | `VITE_BASE_PATH` | No | Base path when hosting under a sub-path, e.g. `/candidate-evaluation/` for a GitHub Pages project site. Defaults to `/`. |
| Apps Script, Script Properties | `SPREADSHEET_ID` | Yes, unless the script is bound to the sheet | The ID from the sheet URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit` |
| Apps Script, Script Properties | `SHEET_NAME` | No | Worksheet (tab) name. Defaults to `Evaluations`. It is created if missing. |
| Apps Script, Script Properties | `ALLOWED_ORIGINS` | No | Comma-separated site origins allowed to submit, e.g. `https://you.github.io,http://localhost:5173`. See [Security considerations](#security-considerations). |

Frontend `VITE_*` values are compiled into the public JavaScript bundle. They are not secrets, and secrets must never be put there. The backend configuration lives only in Apps Script Script Properties.

## 1. Create the Google Sheet

1. Create a new spreadsheet at <https://sheets.new> and name it, for example "Candidate Evaluations".
2. Copy the spreadsheet ID from the URL. It is the part between `/d/` and `/edit`.
3. Keep the sheet private. The script runs as you, so evaluators do not need access to the sheet.

You do not need to create column headers. The backend writes this header row on first use:

`Submission ID | Submission Timestamp | Date of Test | Platform | Model Used | Reasoning / Effort | Prompt | Expected Result | Task Success | Which Is Better | Latency (seconds) | Degradation Reason | Failure Tags | Likert Score | State Change Validated | Actual Result | Additional Notes`

If the worksheet already has a different header row, the backend refuses to write and returns a configuration error, so data never ends up in the wrong columns.

## 2. Deploy the Apps Script backend

1. In the spreadsheet, open **Extensions > Apps Script**. Alternatively, create a standalone project at <https://script.google.com>.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Open **Project Settings** (gear icon), enable **Show "appsscript.json" manifest file in editor**, then replace `appsscript.json` with [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. In **Project Settings > Script Properties**, add:
   - `SPREADSHEET_ID`: the ID from step 1. This is optional for a script bound to the sheet, but setting it is recommended.
   - `SHEET_NAME`: for example `Evaluations` (optional).
   - `ALLOWED_ORIGINS`: your site origin(s) (optional).
5. Back in the editor, select the `setupSheet` function and click **Run**. Google asks you to authorize the script:
   - Choose your account. If you see "Google hasn't verified this app", click **Advanced > Go to (project name)**. This is expected for your own personal scripts.
   - Grant the **See, edit, create, and delete your spreadsheets** permission.
   - The execution log should show `Sheet "Evaluations" is ready.`, and the header row now appears in the sheet.
6. Click **Deploy > New deployment**, choose the type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
8. Open that URL in a browser. You should see `{"ok":true,"service":"candidate-evaluation","sheet":"Evaluations"}`.

**Updating the backend later:** after editing the code, use **Deploy > Manage deployments**, edit the existing deployment, set **Version** to **New version**, and click **Deploy**. This keeps the same URL. Creating a new deployment instead produces a new URL, which you would then have to update in the frontend.

## 3. Run the frontend locally

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env      # then set VITE_APPS_SCRIPT_URL
npm run dev               # http://localhost:5173
```

### Without Google credentials

`npm run mock:backend` starts a local endpoint at `http://localhost:8787/exec`. It runs the real `apps-script/Code.gs` against an in-memory sheet and mirrors Apps Script's CORS behavior.

```bash
npm run mock:backend
# in another terminal
VITE_APPS_SCRIPT_URL=http://localhost:8787/exec npm run dev
```

- `http://localhost:8787/rows` shows the stored rows.
- `http://localhost:8787/mode?fail=1` simulates server errors, `http://localhost:8787/mode?delay=3000` simulates slow responses, and `http://localhost:8787/mode` restores normal behavior.

## 4. Build and deploy the frontend

```bash
npm test          # run all tests
npm run build     # production build in dist/
npm run preview   # serve dist/ locally
```

`dist/` is a static site that can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host. Set `VITE_APPS_SCRIPT_URL` at build time, plus `VITE_BASE_PATH` if the site is served from a sub-path.

### GitHub Pages (included workflow)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests, builds, and deploys on every push to `main`.

1. In the GitHub repository, go to **Settings > Pages** and set **Source** to **GitHub Actions**.
2. Go to **Settings > Secrets and variables > Actions > Variables** and add the repository variable `VITE_APPS_SCRIPT_URL` with your `/exec` URL. It is a public value, so a variable is fine.
3. Push to `main`, or run the workflow manually from the **Actions** tab. The site is published at `https://<user>.github.io/<repo>/`. The workflow sets `VITE_BASE_PATH` to `/<repo>/` automatically.
4. Add `https://<user>.github.io` to `ALLOWED_ORIGINS` if you use that property. An origin has no path.

## How the browser talks to Apps Script (CORS)

Apps Script web apps cannot answer CORS preflight (`OPTIONS`) requests and cannot set custom response headers. This project works within those limits:

- The frontend sends the JSON body with `Content-Type: text/plain;charset=utf-8`. This makes the request a CORS "simple request", so the browser sends no preflight. The backend parses the body as JSON regardless of content type.
- Apps Script answers `/exec` with a redirect to `script.googleusercontent.com`. That response includes `Access-Control-Allow-Origin: *`, so `fetch` (with `redirect: 'follow'`) can read the JSON confirmation from any origin.
- Apps Script always returns HTTP 200, even for errors. The frontend therefore treats a submission as successful only when the body is `{"ok": true, ...}` and the returned `submissionId` matches the one it sent. A non-JSON response, such as a Google sign-in page, is reported as an error and never as a success.
- **Who has access must be "Anyone".** With "Anyone with a Google account" or a domain-only setting, Google redirects the browser to a sign-in page. That page has no CORS headers, so `fetch` fails with a network error. Some Google Workspace admins block "Anyone" deployments. In that case, deploy from an account that allows it, or ask the admin for an exception.

## Security considerations

- **No credentials in the frontend.** The script executes as the deploying user. The browser never sees Google credentials, OAuth tokens, or the spreadsheet ID.
- **The endpoint is public.** Anyone who has the `/exec` URL can send a submission. Treat the URL as unlisted: share the site only with evaluators, and note that the page sets `noindex`. The backend limits the damage this can do:
  - Strict validation of every field: required values, allowed choices for Task Success, Which Is Better, and State Change Validated, a non-negative number for latency, an integer from 1 to 5 for the Likert score, and length limits within the 50,000-character Sheets cell limit
  - The script only appends rows. It never returns sheet contents, except to recognize a duplicate submission ID.
  - Error responses never include internal details
- **`ALLOWED_ORIGINS` is a soft filter.** Apps Script cannot read the real `Origin` header, so the page sends its own `window.location.origin` in the body, and the backend rejects origins that are not listed. This stops other websites from casually reusing your endpoint, but anyone using a script can fake the origin. It is not authentication. If you need real access control, put the site behind an identity-aware proxy or host it on an internal network. The Apps Script endpoint itself still has to be reachable as "Anyone".
- **Data is stored as text, never run as formulas.** Every text value is written with a leading apostrophe, which Sheets treats as "store literally" and does not display. Input like `=IMPORTXML(...)`, `+1`, or `@user` is stored exactly as typed and is never executed, and values like `3/4` or `007` are not converted to dates or numbers. Line breaks, tabs, quotes, HTML, and Unicode are kept exactly.
- **Concurrency.** Writes run under `LockService.getScriptLock()`, so simultaneous submissions do not overwrite each other. If the lock cannot be acquired within 20 seconds, the backend returns a "busy" error and the frontend keeps the form data so the user can retry.
- **Idempotency.** The browser generates one UUID per evaluation and reuses it on retries. If the sheet already has that ID, for example because the first response was lost, the backend confirms without writing a second row.

## Customizing the options

Edit [`src/config/formOptions.js`](src/config/formOptions.js) to change platforms, models, reasoning levels, degradation reasons, or failure tags, then rebuild. The backend accepts any non-empty value for these lists, so no redeploy is needed.

The values for Task Success, Which Is Better, and State Change Validated are also checked by the backend. If you change them, update both `formOptions.js` and the matching arrays at the top of `apps-script/Code.gs`, then redeploy a new version of the script.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Could not reach the submission server" | The web app access is not set to **Anyone**, the URL is wrong (use the `/exec` URL, not `/dev`), or there is a network problem. |
| "The server sent an unexpected response" | The URL points to something other than the web app, such as the editor URL. |
| "The configured spreadsheet could not be opened" | `SPREADSHEET_ID` is wrong, or the deploying account cannot edit the sheet. |
| "The worksheet header row does not match" | The target tab already has other content. Use an empty tab or set `SHEET_NAME`. |
| "Submissions from this site are not allowed" | The site origin is not listed in `ALLOWED_ORIGINS`. |
| Changes to `Code.gs` have no effect | You need to deploy a **New version** of the existing deployment. |
| Executions fail with no clear error | Check **Executions** in the Apps Script editor for logs. |

## Tests

```bash
npm test
```

- `tests/validation.test.js`: required fields, latency and Likert rules, date validation, length limits
- `tests/submitEvaluation.test.js`: request format (no preflight), confirmation handling, backend errors, non-JSON responses, HTTP errors, network errors, timeouts
- `tests/EvaluationForm.test.jsx`: inline errors, focusing the first invalid field, latency and Likert validation, the N/A rule for failure tags, the loading state, duplicate-submission prevention, data kept on failure, retries with the same ID, reset confirmation, and checks that there are no emoji or file inputs
- `tests/appsScript.test.js`: runs `Code.gs` and checks for exactly one row per submission, column order, multiline and special characters, formula escaping, duplicate IDs, malformed and invalid requests, configuration errors, lock contention, and `ALLOWED_ORIGINS`
