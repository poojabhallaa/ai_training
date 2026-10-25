# Candidate Evaluation

A single-page form for evaluating candidates on AI connector tasks, such as analyzing Facebook Ads performance, finding underperforming ad sets, and taking actions through connected tools. Each submission is stored as one row in a Google Sheet through a small Google Apps Script web app. There is no database and no paid backend.

- **Frontend:** React 19, Vite, Tailwind CSS v4 (static site, deployable anywhere)
- **Backend and storage:** Google Apps Script web app writing to Google Sheets
- **Tests:** Vitest, Testing Library, and a Node harness that runs the real Apps Script code against an in-memory sheet

## Features

- Task codes: the page first asks for a task code. Each task in the "Tasks" tab of the Google Sheet has its own code, and only a matching code opens that task and the evaluation form. See [Tasks and task codes](#tasks-and-task-codes).
- Six sections: Basic Information, Prompt and Expected Result, Evaluation of Outcome, Actual Result and Additional Notes, Screenshots, and Submission
- Optional screenshots: up to 10 images per submission (PNG, JPEG, or WebP), added with the file picker, drag and drop, or paste. They are saved to Google Drive, and the row links to them. See [Screenshots](#screenshots).
- Inline validation on blur and on submit, with errors shown next to each field and focus moved to the first invalid field
- Latency must be a non-negative decimal number. Likert score is limited to whole numbers from 1 to 5.
- Failure Tags is a multi-select. N/A is exclusive and cannot be combined with other tags.
- A per-section "Complete" indicator
- A loading state while submitting. The button is locked so a request cannot be sent twice.
- A success message appears only after the Apps Script backend confirms that the row was written. It shows the submission ID and the server timestamp.
- Error messages explain what went wrong, and entered data is kept when a submission fails
- Each evaluation gets a unique submission ID. Retrying a failed request reuses that ID, so the server never writes a second row for the same evaluation.
- Reset Form asks for confirmation if any data has been entered
- Dark, responsive layout tested from 320px to 1440px wide. No emoji.

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
| Apps Script, Script Properties | `SPREADSHEET_ID` | No | Overrides `DEFAULT_SPREADSHEET_ID` in `Code.gs`. The ID is the part of the sheet URL between `/d/` and `/edit`. |
| Apps Script, Script Properties | `SHEET_NAME` | No | Overrides the responses tab name, `DEFAULT_SHEET_NAME` (`AI training responses`). The tab is created if missing. |
| Apps Script, Script Properties | `TASK_SHEET_NAME` | No | Overrides the task tab name, `DEFAULT_TASK_SHEET_NAME` (`Tasks`). |
| Apps Script, Script Properties | `SCREENSHOTS_FOLDER_ID` | No | Drive folder that receives screenshots. `setupSheet` creates a **Candidate Evaluation Screenshots** folder and sets this for you. Set it yourself to use an existing folder. |
| Apps Script, Script Properties | `ALLOWED_ORIGINS` | No | Comma-separated site origins allowed to submit, e.g. `https://you.github.io,http://localhost:5173`. See [Security considerations](#security-considerations). |

The spreadsheet ID and tab names have defaults at the top of [`apps-script/Code.gs`](apps-script/Code.gs). Script Properties are optional and only needed to override them without editing the code.

Frontend `VITE_*` values are compiled into the public JavaScript bundle. They are not secrets, and secrets must never be put there. The backend configuration lives only in Apps Script Script Properties.

## 1. Create the Google Sheet

1. Create a new spreadsheet at <https://sheets.new> and name it, for example "Candidate Evaluations".
2. Copy the spreadsheet ID from the URL. It is the part between `/d/` and `/edit`.
3. Keep the sheet private. The script runs as you, so evaluators do not need access to the sheet.

You do not need to create column headers. The backend writes this header row on first use:

`Submission ID | Submission Timestamp | Date of Test | Platform | Model Used | Reasoning / Effort | Prompt | Expected Result | Task Success | Which Is Better | Latency (seconds) | Degradation Reason | Failure Tags | Likert Score | State Change Validated | Actual Result | Additional Notes | Task Code | Task Title | Screenshots`

If the worksheet already has a different header row, the backend refuses to write and returns a configuration error, so data never ends up in the wrong columns.

## 2. Deploy the Apps Script backend

1. In the spreadsheet, open **Extensions > Apps Script**. Alternatively, create a standalone project at <https://script.google.com>.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Open **Project Settings** (gear icon), enable **Show "appsscript.json" manifest file in editor**, then replace `appsscript.json` with [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. Check `DEFAULT_SPREADSHEET_ID` and `DEFAULT_SHEET_NAME` at the top of `Code.gs`. Optionally, in **Project Settings > Script Properties**, set `SPREADSHEET_ID`, `SHEET_NAME`, `TASK_SHEET_NAME`, or `ALLOWED_ORIGINS` to override them.
5. Back in the editor, select the `setupSheet` function and click **Run**. Google asks you to authorize the script:
   - Choose your account. If you see "Google hasn't verified this app", click **Advanced > Go to (project name)**. This is expected for your own personal scripts.
   - Grant the **See, edit, create, and delete your spreadsheets** and **See, edit, create, and delete all of your Google Drive files** permissions. Drive access is needed to save screenshots.
   - The execution log should show `Sheets "AI training responses" and "Tasks" are ready.` then the link to the screenshots folder in Drive and the code given to the first task. The header row now appears in the responses tab, and a **Tasks** tab is created. If an older single-task **Task** tab exists, its title and text become the first task; otherwise it is a placeholder.
6. Click **Deploy > New deployment**, choose the type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
8. Open that URL in a browser. You should see `{"ok":true,"service":"candidate-evaluation","sheet":"AI training responses"}`. Adding `?action=task&code=<a task code>` to the URL returns that task.

**Updating the backend later:** after editing the code, use **Deploy > Manage deployments**, edit the existing deployment, set **Version** to **New version**, and click **Deploy**. This keeps the same URL. Creating a new deployment instead produces a new URL, which you would then have to update in the frontend.

## Tasks and task codes

The site opens on a code screen. A candidate enters the code you gave them, and only then sees the task and the evaluation form. Each task has its own code, and the code is saved with every evaluation (the **Task Code** and **Task Title** columns), so you can tell which task a response belongs to.

Tasks live in the **Tasks** tab of the same spreadsheet, one per row, so you never need to edit code or redeploy to add or change them:

| | A | B | C |
| --- | --- | --- | --- |
| 1 | Code | Title | Task |
| 2 | AB3D7KQ9 | Facebook Ads performance review | Connector: Facebook Ads ... |
| 3 | M4XP2RTW | Shopify inventory restock | Connector: Shopify ... |

**Adding a task:** add a row with the title and task text, leave **Code** empty, then in the Apps Script editor select `generateTaskCodes` and click **Run**. Every row without a code gets a new random 8-character code, which is also shown in the execution log. Existing codes are never changed. You can also type your own codes.

- Codes match regardless of case, spaces, and dashes, so `ab3d-7kq9` works for `AB3D7KQ9`. Use letters in hand-typed codes, or format the column as plain text, so Sheets does not turn a code like `00123` into a number.
- Every code must be unique. If two rows share a code, neither task opens, and `generateTaskCodes` logs a warning.
- A row with an empty **Code** cell can never be opened, which is useful for drafts. To withdraw a task, clear or change its code. Candidates who already opened it are asked for a new code the next time the page loads, and their submissions are refused.
- The columns are found by their headers in row 1, so they can be in any order, and you can add other columns, such as who each code was given to. **Title** is optional.
- Edits show up the next time the page is loaded. For line breaks inside a cell, press Cmd+Enter (Mac) or Ctrl+Enter (Windows).
- Inside the task text, a line that starts with a known heading followed by a colon, such as `Connector: Facebook Ads`, shows the heading in bold. The headings are Title, Connector, Surface, Platform to be used, Hero Use Case, Power-User Workflow, Why High Value, Key Actions Exercised, State Changing, Setup Difficulty, and Payments/ Real Interactions. Matching ignores case, spaces, and punctuation. To change the list, edit [`src/config/taskHeadings.js`](src/config/taskHeadings.js).
- After a correct code, it is remembered for that browser tab, so a refresh does not ask again. **Use a different code** in the task box switches tasks.
- To use a different tab name, set `TASK_SHEET_NAME`.

## Screenshots

The **Screenshots** section is optional. A candidate can add up to 10 images per submission with **Add screenshots**, by dragging files onto the box, or by clicking the box and pasting (Cmd+V or Ctrl+V).

- **Where they go:** each submission with screenshots gets its own subfolder, named `<date of test> <submission ID>`, inside the **Candidate Evaluation Screenshots** folder in the Google Drive of the account that deployed the script. The **Screenshots** column of the row links to that subfolder. Rows without screenshots leave it empty.
- **Who can see them:** the files are private to that account. To let others open the links, share the **Candidate Evaluation Screenshots** folder with them in Drive.
- **Size:** images over 1.5 MB are resized in the browser to at most 2560 pixels on the longest side and saved as JPEG, which keeps text readable. Each image can be at most 3 MB after that, and all of them together at most 15 MB, because Apps Script limits how large a request can be.
- **Checks:** the backend accepts at most 10 images, only PNG, JPEG, and WebP, and checks the file contents as well as the declared type. If the row cannot be written, for example because the server is busy, the saved screenshots are moved to the Drive trash. A retry of a submission that already succeeded does not save them twice.
- To change the limit of 10, edit `MAX_SCREENSHOTS` in both [`src/lib/screenshots.js`](src/lib/screenshots.js) and [`apps-script/Code.gs`](apps-script/Code.gs), then deploy a new version of the script.

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

- `http://localhost:8787/rows` shows the stored rows. The mock has two sample tasks, with the codes `FBADS001` and `SHOPIFY2`.
- `http://localhost:8787/mode?fail=1` simulates server errors, `http://localhost:8787/mode?delay=3000` simulates slow responses, and `http://localhost:8787/mode` restores normal behavior.

## 4. Build and deploy the frontend

```bash
npm test          # run all tests
npm run build     # production build in dist/
npm run preview   # serve dist/ locally
```

`dist/` is a static site that can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host. Set `VITE_APPS_SCRIPT_URL` at build time, plus `VITE_BASE_PATH` if the site is served from a sub-path.

### Vercel

1. Import the GitHub repository in Vercel. The Vite preset is detected automatically (build command `npm run build`, output directory `dist`).
2. In **Project Settings > Environment Variables**, add `VITE_APPS_SCRIPT_URL` with your `/exec` URL for the Production environment (and Preview, if you use preview deployments). `.env` is not committed, so the build only gets the URL from here.
3. Redeploy. Vite builds the value into the bundle, so a change to the variable only takes effect after a new deployment.

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

- **No credentials in the frontend.** The script executes as the deploying user. The browser never sees Google credentials, OAuth tokens, the spreadsheet ID, or the Drive folder ID. The script asks for full Drive access because Apps Script's `DriveApp` needs it to create folders and files; it only ever creates files in the screenshots folder.
- **The endpoint is public.** Anyone who has the `/exec` URL can send a submission. Treat the URL as unlisted: share the site only with evaluators, and note that the page sets `noindex`. The backend limits the damage this can do:
  - Strict validation of every field: required values, allowed choices for Task Success, Which Is Better, and State Change Validated, a non-negative number for latency, an integer from 1 to 5 for the Likert score, and length limits within the 50,000-character Sheets cell limit
  - The script only appends rows. It never returns sheet contents, except to recognize a duplicate submission ID and to return the one task matching a correct code.
  - **Task codes** keep tasks private from people without a code, and submissions without a valid code are refused. Generated codes are random 8-character codes (about 850 billion combinations), but they are shared secrets rather than accounts: anyone you give a code to can pass it on.
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
| "The worksheet header row does not match" | The responses tab already has other content in row 1. Clear the tab, or point `SHEET_NAME` at an empty tab. |
| The code screen says "Could not reach the server" or "endpoint is not configured" | `VITE_APPS_SCRIPT_URL` is missing or wrong in the build (on Vercel, set it under **Environment Variables** and redeploy), or the web app is not deployed with access set to **Anyone**. |
| "That code does not match any task" | The code is not in the **Code** column of the Tasks tab, or the row has a typo. |
| "The server did not confirm the code" | The Apps Script deployment still runs the version from before task codes. Deploy a **New version**. |
| "This code is assigned to more than one task" | Two rows in the Tasks tab have the same code. Give one of them a new code. |
| "Submissions from this site are not allowed" | The site origin is not listed in `ALLOWED_ORIGINS`. |
| "The screenshots could not be saved to Google Drive" | The deploying account is out of Drive storage, or Drive had a temporary problem. Check **Executions** in the Apps Script editor. |
| "The screenshots folder could not be opened" | `SCREENSHOTS_FOLDER_ID` points to a folder that was deleted or that the deploying account cannot edit. Delete the property and run `setupSheet` to create a new folder. |
| Screenshot uploads fail right after updating the script | The new Drive permission has not been granted yet. Run `setupSheet` once in the editor, accept the permissions, and deploy a **New version**. |
| Changes to `Code.gs` have no effect | You need to deploy a **New version** of the existing deployment. |
| Executions fail with no clear error | Check **Executions** in the Apps Script editor for logs. |

## Tests

```bash
npm test
```

- `tests/validation.test.js`: required fields, latency and Likert rules, date validation, length limits
- `tests/submitEvaluation.test.js`: request format (no preflight), confirmation handling, backend errors, non-JSON responses, HTTP errors, network errors, timeouts
- `tests/EvaluationForm.test.jsx`: inline errors, focusing the first invalid field, latency and Likert validation, the N/A rule for failure tags, the loading state, duplicate-submission prevention, data kept on failure, retries with the same ID, reset confirmation, adding, removing, and pasting screenshots, the limit of 10, and checks that there are no emoji
- `tests/appsScript.test.js`: runs `Code.gs` and checks for exactly one row per submission, column order, multiline and special characters, formula escaping, duplicate IDs, malformed and invalid requests, configuration errors, lock contention, `ALLOWED_ORIGINS`, task codes (lookup, normalization, duplicates, submissions without a valid code), adding the task columns to an older responses tab, screenshots (Drive folders, limits, type checks, cleanup on failure, retries), `setupSheet`, and `generateTaskCodes`
- `tests/TaskBox.test.jsx`: task box content and headings, and the task request
- `tests/App.test.jsx`: the code screen, wrong codes, remembering and re-checking a code, and switching codes
- `tests/screenshots.test.js`: keeping small images, resizing large ones, and rejecting unsupported or broken files
