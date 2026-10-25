/**
 * Candidate Evaluation backend: Google Apps Script web app.
 *
 * Accepts evaluation submissions as JSON (sent as text/plain to avoid a CORS
 * preflight) and appends each one as a row in a Google Sheet.
 *
 * Configuration lives in Script Properties (Project Settings > Script Properties):
 *   SPREADSHEET_ID   ID of the target spreadsheet. Optional if this script is
 *                    bound to the spreadsheet (Extensions > Apps Script).
 *   SHEET_NAME       Worksheet (tab) name. Defaults to "Evaluations".
 *   ALLOWED_ORIGINS  Optional comma-separated list of site origins, e.g.
 *                    "https://example.github.io,http://localhost:5173".
 *                    Apps Script cannot read the real Origin header, so this
 *                    checks the origin the page reports. It filters casual
 *                    misuse but is not an authentication mechanism.
 *
 * Apps Script always responds with HTTP 200; the JSON body's "ok" field says
 * whether the row was saved.
 */

var DEFAULT_SHEET_NAME = 'Evaluations';
var MAX_TEXT_LENGTH = 50000;
var MAX_SHORT_TEXT_LENGTH = 200;
var LOCK_TIMEOUT_MS = 20000;

var TASK_SUCCESS = ['Pass', 'Partial', 'Fail'];
var WHICH_IS_BETTER = ['ChatGPT', 'Claude', 'Tie', 'N/A'];
var STATE_CHANGE_VALIDATED = ['Yes', 'No', 'N/A'];

// [payload key, column header]. Order defines the spreadsheet columns.
var COLUMNS = [
  ['submissionId', 'Submission ID'],
  ['submittedAt', 'Submission Timestamp'],
  ['dateOfTest', 'Date of Test'],
  ['platform', 'Platform'],
  ['modelUsed', 'Model Used'],
  ['reasoningEffort', 'Reasoning / Effort'],
  ['prompt', 'Prompt'],
  ['expectedResult', 'Expected Result'],
  ['taskSuccess', 'Task Success'],
  ['whichIsBetter', 'Which Is Better'],
  ['latencySeconds', 'Latency (seconds)'],
  ['degradationReason', 'Degradation Reason'],
  ['failureTags', 'Failure Tags'],
  ['likertScore', 'Likert Score'],
  ['stateChangeValidated', 'State Change Validated'],
  ['actualResult', 'Actual Result'],
  ['additionalNotes', 'Additional Notes'],
];

function doPost(e) {
  try {
    var body = parseBody_(e);
    var config = getConfig_();
    checkOrigin_(config, body.origin);
    var record = validateSubmission_(body);
    return jsonResponse_(saveRecord_(config, record));
  } catch (err) {
    return jsonResponse_(errorBody_(err));
  }
}

/** Health check: open the web app URL in a browser to confirm it is deployed. */
function doGet() {
  try {
    var config = getConfig_();
    var sheet = getSheet_(config);
    return jsonResponse_({ ok: true, service: 'candidate-evaluation', sheet: sheet.getName() });
  } catch (err) {
    return jsonResponse_(errorBody_(err));
  }
}

/**
 * Run once from the Apps Script editor (select "setupSheet" and click Run).
 * Grants spreadsheet permissions and writes the header row.
 */
function setupSheet() {
  var sheet = getSheet_(getConfig_());
  ensureHeader_(sheet);
  Logger.log('Sheet "' + sheet.getName() + '" is ready.');
}

// ---------------------------------------------------------------------------

function ApiError_(code, message, fields) {
  this.code = code;
  this.message = message;
  this.fields = fields || null;
}

function errorBody_(err) {
  if (err instanceof ApiError_) {
    var error = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    return { ok: false, error: error };
  }
  console.error(err && err.stack ? err.stack : err);
  return {
    ok: false,
    error: { code: 'SERVER_ERROR', message: 'The server could not save the evaluation. Try again.' },
  };
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var origins = (props.getProperty('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(function (s) { return s.trim().replace(/\/+$/, ''); })
    .filter(function (s) { return s; });
  return {
    spreadsheetId: (props.getProperty('SPREADSHEET_ID') || '').trim(),
    sheetName: (props.getProperty('SHEET_NAME') || '').trim() || DEFAULT_SHEET_NAME,
    allowedOrigins: origins,
  };
}

function getSheet_(config) {
  var spreadsheet;
  if (config.spreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    } catch (err) {
      console.error(err);
      throw new ApiError_('CONFIG_ERROR', 'The configured spreadsheet could not be opened. Check SPREADSHEET_ID and permissions.');
    }
  } else {
    spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new ApiError_('CONFIG_ERROR', 'No spreadsheet is configured. Set the SPREADSHEET_ID script property.');
    }
  }
  return spreadsheet.getSheetByName(config.sheetName) || spreadsheet.insertSheet(config.sheetName);
}

function ensureHeader_(sheet) {
  var headers = COLUMNS.map(function (c) { return c[1]; });
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(existing[i]).trim() !== headers[i]) {
      throw new ApiError_(
        'CONFIG_ERROR',
        'The worksheet header row does not match the expected columns (column ' + (i + 1) + ' should be "' + headers[i] + '").'
      );
    }
  }
}

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) throw new ApiError_('BAD_REQUEST', 'The request body is empty.');
  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    throw new ApiError_('BAD_REQUEST', 'The request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError_('BAD_REQUEST', 'The request body must be a JSON object.');
  }
  return body;
}

function checkOrigin_(config, origin) {
  if (config.allowedOrigins.length === 0) return;
  var normalized = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  if (config.allowedOrigins.indexOf(normalized) === -1) {
    throw new ApiError_('FORBIDDEN_ORIGIN', 'Submissions from this site are not allowed.');
  }
}

function validateSubmission_(body) {
  var errors = {};
  var record = {};

  function text(key, label, maxLength) {
    var value = body[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors[key] = label + ' is required.';
    } else if (value.length > maxLength) {
      errors[key] = label + ' must be at most ' + maxLength + ' characters.';
    } else {
      record[key] = value;
    }
  }

  function choice(key, label, allowed) {
    if (allowed.indexOf(body[key]) === -1) {
      errors[key] = label + ' must be one of: ' + allowed.join(', ') + '.';
    } else {
      record[key] = body[key];
    }
  }

  if (typeof body.submissionId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.submissionId)) {
    errors.submissionId = 'Submission ID is missing or invalid.';
  } else {
    record.submissionId = body.submissionId;
  }

  if (typeof body.dateOfTest !== 'string' || !isValidDate_(body.dateOfTest)) {
    errors.dateOfTest = 'Date of Test must be a valid date (YYYY-MM-DD).';
  } else {
    record.dateOfTest = body.dateOfTest;
  }

  text('platform', 'Platform', MAX_SHORT_TEXT_LENGTH);
  text('modelUsed', 'Model Used', MAX_SHORT_TEXT_LENGTH);
  text('reasoningEffort', 'Reasoning / Effort', MAX_SHORT_TEXT_LENGTH);
  text('prompt', 'Prompt', MAX_TEXT_LENGTH);
  text('expectedResult', 'Expected Result', MAX_TEXT_LENGTH);
  choice('taskSuccess', 'Task Success', TASK_SUCCESS);
  choice('whichIsBetter', 'Which Is Better', WHICH_IS_BETTER);
  text('degradationReason', 'Degradation Reason', MAX_SHORT_TEXT_LENGTH);
  choice('stateChangeValidated', 'State Change Validated', STATE_CHANGE_VALIDATED);
  text('actualResult', 'Actual Result', MAX_TEXT_LENGTH);
  text('additionalNotes', 'Additional Notes', MAX_TEXT_LENGTH);

  var latency = body.latencySeconds;
  if (typeof latency !== 'number' || !isFinite(latency) || latency < 0) {
    errors.latencySeconds = 'Latency must be a non-negative number.';
  } else {
    record.latencySeconds = latency;
  }

  var likert = body.likertScore;
  if (typeof likert !== 'number' || likert % 1 !== 0 || likert < 1 || likert > 5) {
    errors.likertScore = 'Likert Score must be a whole number from 1 to 5.';
  } else {
    record.likertScore = likert;
  }

  var tags = body.failureTags;
  var tagsValid =
    Array.isArray(tags) &&
    tags.length > 0 &&
    tags.every(function (t) { return typeof t === 'string' && t.trim() !== '' && t.length <= MAX_SHORT_TEXT_LENGTH; });
  if (!tagsValid) {
    errors.failureTags = 'Failure Tags must include at least one tag.';
  } else {
    record.failureTags = tags.join(', ');
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError_('VALIDATION_ERROR', 'Some fields are missing or invalid.', errors);
  }
  return record;
}

function isValidDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var parts = value.split('-').map(Number);
  var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
}

/**
 * Prefix every string with an apostrophe so Sheets stores it as literal text:
 * values starting with "=", "+", "-" or "@" are never run as formulas, and
 * text such as "3/4" or "007" is not converted to a date or number. The
 * apostrophe is not part of the stored value and is not displayed.
 */
function toCellValue_(value) {
  return typeof value === 'string' ? "'" + value : value;
}

function findSubmissionRow_(sheet, submissionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === submissionId) return { row: i + 2, submittedAt: String(ids[i][1]) };
  }
  return null;
}

function saveRecord_(config, record) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new ApiError_('BUSY', 'The server is busy. Try again in a moment.');
  }
  try {
    var sheet = getSheet_(config);
    ensureHeader_(sheet);

    // A retry of a request that already succeeded (e.g. the response was lost)
    // must not create a second row.
    var existing = findSubmissionRow_(sheet, record.submissionId);
    if (existing) {
      return { ok: true, submissionId: record.submissionId, submittedAt: existing.submittedAt, duplicate: true };
    }

    record.submittedAt = new Date().toISOString();
    var row = COLUMNS.map(function (c) { return toCellValue_(record[c[0]]); });
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    return { ok: true, submissionId: record.submissionId, submittedAt: record.submittedAt, duplicate: false };
  } finally {
    lock.releaseLock();
  }
}
