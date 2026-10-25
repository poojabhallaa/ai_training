/**
 * Candidate Evaluation backend: Google Apps Script web app.
 *
 * Accepts evaluation submissions as JSON (sent as text/plain to avoid a CORS
 * preflight) and appends each one as a row in a Google Sheet. Also serves the
 * task shown at the top of the form, read from the "Tasks" tab of the same
 * spreadsheet. Each task has its own access code, and the task is only
 * returned for a matching code (GET ?action=task&code=...). Screenshots sent
 * with a submission are saved to a Google Drive folder, one subfolder per
 * submission, and the row links to that subfolder.
 *
 * The defaults below can be overridden in Script Properties
 * (Project Settings > Script Properties):
 *   SPREADSHEET_ID   1GCcvSXo3hH6yuxsi9bVnJitYukiLi2GZO5FYUKXLlBo
 *   SHEET_NAME       Worksheet (tab) that receives the responses.
 *   TASK_SHEET_NAME  Worksheet (tab) that holds the tasks and their codes.
 *   SCREENSHOTS_FOLDER_ID  Drive folder that receives screenshots. setupSheet
 *                    creates a "Candidate Evaluation Screenshots" folder and
 *                    stores its ID here when it is not set.
 *   ALLOWED_ORIGINS  Optional comma-separated list of site origins, e.g.
 *                    "https://example.github.io,http://localhost:5173".
 *                    Apps Script cannot read the real Origin header, so this
 *                    checks the origin the page reports. It filters casual
 *                    misuse but is not an authentication mechanism.
 *
 * Apps Script always responds with HTTP 200; the JSON body's "ok" field says
 * whether the row was saved.
 */

var DEFAULT_SPREADSHEET_ID = '1GCcvSXo3hH6yuxsi9bVnJitYukiLi2GZO5FYUKXLlBo';
var DEFAULT_SHEET_NAME = 'AI training responses';
var DEFAULT_TASK_SHEET_NAME = 'Tasks';
// Single-task tab used before task codes existed. setupSheet copies its task
// into the Tasks tab.
var LEGACY_TASK_SHEET_NAME = 'Task';
var MAX_TEXT_LENGTH = 50000;
var MAX_SHORT_TEXT_LENGTH = 200;
var LOCK_TIMEOUT_MS = 20000;

// Screenshots. The site resizes large images before upload, so these limits
// are only reached by requests that did not come from the site.
var MAX_SCREENSHOTS = 10;
var MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
var MAX_TOTAL_SCREENSHOT_BYTES = 15 * 1024 * 1024;
var SCREENSHOTS_FOLDER_NAME = 'Candidate Evaluation Screenshots';
var SCREENSHOT_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

var TASK_SUCCESS = ['Pass', 'Partial', 'Fail'];
var WHICH_IS_BETTER = ['ChatGPT', 'Claude', 'N/A'];
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
  // Added with task codes. New columns go at the end so existing rows keep
  // their positions; ensureHeader_ fills in their headers on older sheets.
  ['taskCode', 'Task Code'],
  ['taskTitle', 'Task Title'],
  ['screenshots', 'Screenshots'],
];

function doPost(e) {
  try {
    var body = parseBody_(e);
    var config = getConfig_();
    checkOrigin_(config, body.origin);
    var record = validateSubmission_(body);
    var task = findTask_(getSpreadsheet_(config), config, record.taskCode);
    if (!task) {
      throw new ApiError_(
        'INVALID_CODE',
        'The task code is no longer valid, so the evaluation could not be saved. Ask the person who gave you the code.'
      );
    }
    record.taskCode = task.code;
    record.taskTitle = task.title;
    return jsonResponse_(saveRecord_(config, record));
  } catch (err) {
    return jsonResponse_(errorBody_(err));
  }
}

/**
 * GET ?action=task&code=... returns the task with that code. Without a
 * matching code nothing about any task is returned.
 * GET with no action is a health check: open the web app URL in a browser to
 * confirm it is deployed.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || '';
  try {
    var config = getConfig_();
    if (action === 'task') {
      var task = findTask_(getSpreadsheet_(config), config, params.code);
      if (!task) throw new ApiError_('INVALID_CODE', 'That code does not match any task. Check it and try again.');
      return jsonResponse_({ ok: true, task: task });
    }
    var sheet = getSheet_(config);
    return jsonResponse_({ ok: true, service: 'candidate-evaluation', sheet: sheet.getName() });
  } catch (err) {
    return jsonResponse_(errorBody_(err, action === 'task' ? 'The task could not be loaded.' : undefined));
  }
}

/**
 * Run once from the Apps Script editor (select "setupSheet" and click Run).
 * Grants spreadsheet permissions, writes the response header row, and creates
 * the Tasks tab if it does not exist yet. The first task is copied from the
 * old single-task "Task" tab when there is one, otherwise it is a placeholder.
 */
function setupSheet() {
  var config = getConfig_();
  var sheet = getSheet_(config);
  ensureHeader_(sheet);
  var taskSheet = ensureTaskSheet_(getSpreadsheet_(config), config);
  Logger.log('Sheets "' + sheet.getName() + '" and "' + taskSheet.getName() + '" are ready.');
  var folder = ensureScreenshotsFolder_(config);
  Logger.log('Screenshots are saved to the Drive folder "' + folder.getName() + '": ' + folder.getUrl());
  logCodeChanges_(fillMissingCodes_(taskSheet, config));
}

/**
 * Run from the Apps Script editor after adding tasks to the Tasks tab. Every
 * task row with an empty Code cell gets a new random code that no other task
 * uses. Existing codes are never changed.
 */
function generateTaskCodes() {
  var config = getConfig_();
  var sheet = getSpreadsheet_(config).getSheetByName(config.taskSheetName);
  if (!sheet) throw new Error('There is no "' + config.taskSheetName + '" tab. Run setupSheet first.');
  logCodeChanges_(fillMissingCodes_(sheet, config));
}

// ---------------------------------------------------------------------------

function ApiError_(code, message, fields) {
  this.code = code;
  this.message = message;
  this.fields = fields || null;
}

function errorBody_(err, fallbackMessage) {
  if (err instanceof ApiError_) {
    var error = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    return { ok: false, error: error };
  }
  console.error(err && err.stack ? err.stack : err);
  return {
    ok: false,
    error: { code: 'SERVER_ERROR', message: fallbackMessage || 'The server could not save the evaluation. Try again.' },
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
    spreadsheetId: (props.getProperty('SPREADSHEET_ID') || '').trim() || DEFAULT_SPREADSHEET_ID,
    sheetName: (props.getProperty('SHEET_NAME') || '').trim() || DEFAULT_SHEET_NAME,
    taskSheetName: (props.getProperty('TASK_SHEET_NAME') || '').trim() || DEFAULT_TASK_SHEET_NAME,
    screenshotsFolderId: (props.getProperty('SCREENSHOTS_FOLDER_ID') || '').trim(),
    allowedOrigins: origins,
  };
}

function getSpreadsheet_(config) {
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
  return spreadsheet;
}

function getSheet_(config) {
  var spreadsheet = getSpreadsheet_(config);
  return spreadsheet.getSheetByName(config.sheetName) || spreadsheet.insertSheet(config.sheetName);
}

// The Tasks tab has a header row with "Code", "Title" and "Task" columns (in
// any order; other columns are ignored) and one task per row below it. A row
// with an empty Code cell is never shown to anyone.
var TASK_HEADERS = { code: 'Code', title: 'Title', text: 'Task' };
// No 0/O, 1/I/L, so codes are easy to read out and type.
var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var CODE_LENGTH = 8;

/** Codes match regardless of case, spaces and dashes: "ab3d-7kq9" is "AB3D7KQ9". */
function normalizeCode_(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function ensureTaskSheet_(spreadsheet, config) {
  var sheet = spreadsheet.getSheetByName(config.taskSheetName);
  if (sheet) return sheet;
  var first = readLegacyTask_(spreadsheet, config) || {
    title: 'Task title',
    text: 'Replace this text with the task the candidate should perform.',
  };
  sheet = spreadsheet.insertSheet(config.taskSheetName);
  sheet.getRange(1, 1, 2, 3).setValues([
    [TASK_HEADERS.code, TASK_HEADERS.title, TASK_HEADERS.text],
    ['', toCellValue_(first.title), toCellValue_(first.text)],
  ]);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

/** Returns { title, text } from the old two-column "Task" tab, or null. */
function readLegacyTask_(spreadsheet, config) {
  if (config.taskSheetName === LEGACY_TASK_SHEET_NAME) return null;
  var sheet = spreadsheet.getSheetByName(LEGACY_TASK_SHEET_NAME);
  if (!sheet || sheet.getLastRow() === 0) return null;
  var rows = sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues();
  var task = { title: '', text: '' };
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][0]).trim().toLowerCase();
    if (key === 'title') task.title = String(rows[i][1]).trim();
    else if (key === 'task') task.text = String(rows[i][1]).trim();
  }
  return task.title || task.text ? task : null;
}

/** Column indexes (0-based) of the task headers in row 1; title is -1 if absent. */
function taskColumns_(headerRow, config) {
  function find(name) {
    for (var c = 0; c < headerRow.length; c++) {
      if (String(headerRow[c]).trim().toLowerCase() === name.toLowerCase()) return c;
    }
    return -1;
  }
  var cols = { code: find(TASK_HEADERS.code), title: find(TASK_HEADERS.title), text: find(TASK_HEADERS.text) };
  if (cols.code === -1 || cols.text === -1) {
    throw new ApiError_(
      'CONFIG_ERROR',
      'Row 1 of the "' + config.taskSheetName + '" tab must have "Code" and "Task" column headers.'
    );
  }
  return cols;
}

/** Reads the Tasks tab as { cols, rows } with display values, or null if it is missing or empty. */
function readTaskTable_(sheet, config) {
  if (!sheet || sheet.getLastRow() === 0) return null;
  // Display values return exactly what the cell shows, so dates and numbers
  // in the task text are not reformatted.
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
  return { cols: taskColumns_(values[0], config), rows: values.slice(1) };
}

/**
 * Returns { code, title, text } for the task whose code matches, or null.
 * A code shared by several rows matches none of them, so a copy-paste mistake
 * in the sheet never shows one candidate the wrong task.
 */
function findTask_(spreadsheet, config, code) {
  var wanted = normalizeCode_(code);
  if (!wanted) return null;
  var table = readTaskTable_(spreadsheet.getSheetByName(config.taskSheetName), config);
  if (!table) return null;
  var cols = table.cols;
  var matches = table.rows.filter(function (row) { return normalizeCode_(row[cols.code]) === wanted; });
  if (matches.length > 1) {
    throw new ApiError_('CONFIG_ERROR', 'This code is assigned to more than one task. Ask the person who gave it to you.');
  }
  if (matches.length === 0) return null;
  return {
    code: wanted,
    title: cols.title === -1 ? '' : String(matches[0][cols.title]).trim(),
    text: String(matches[0][cols.text]).trim(),
  };
}

function newCode_(used) {
  var code;
  do {
    code = '';
    for (var i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    }
  } while (used[code]);
  used[code] = true;
  return code;
}

/**
 * Gives every task row that has a title or task text but no code a new unique
 * code. Returns { added: [{ row, code }], duplicates: [code] }.
 */
function fillMissingCodes_(sheet, config) {
  var result = { added: [], duplicates: [] };
  var table = readTaskTable_(sheet, config);
  if (!table) return result;
  var cols = table.cols;
  var used = {};
  table.rows.forEach(function (row) {
    var code = normalizeCode_(row[cols.code]);
    if (!code) return;
    if (used[code] && result.duplicates.indexOf(code) === -1) result.duplicates.push(code);
    used[code] = true;
  });
  table.rows.forEach(function (row, i) {
    var hasTask = String(row[cols.text]).trim() || (cols.title !== -1 && String(row[cols.title]).trim());
    if (normalizeCode_(row[cols.code]) || !hasTask) return;
    var code = newCode_(used);
    // Written as literal text so a code such as "23E45678" is not read as a number.
    sheet.getRange(i + 2, cols.code + 1).setValues([[toCellValue_(code)]]);
    result.added.push({ row: i + 2, code: code });
  });
  return result;
}

function logCodeChanges_(result) {
  result.added.forEach(function (a) { Logger.log('Row ' + a.row + ': new code ' + a.code); });
  if (result.added.length === 0) Logger.log('Every task already has a code.');
  result.duplicates.forEach(function (code) {
    Logger.log('Warning: code ' + code + ' is used by more than one row. Nobody can open those tasks until each has its own code.');
  });
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
    var cell = String(existing[i]).trim();
    if (cell === headers[i]) continue;
    // Columns added in a later version: write their headers after the existing ones.
    if (existing.slice(i).every(function (v) { return String(v).trim() === ''; })) {
      sheet.getRange(1, i + 1, 1, headers.length - i).setValues([headers.slice(i)]).setFontWeight('bold');
      return;
    }
    throw new ApiError_(
      'CONFIG_ERROR',
      'The worksheet header row does not match the expected columns (column ' + (i + 1) + ' should be "' + headers[i] + '").'
    );
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

  var taskCode = body.taskCode;
  if (typeof taskCode !== 'string' || taskCode.length > MAX_SHORT_TEXT_LENGTH || !normalizeCode_(taskCode)) {
    errors.taskCode = 'Task code is missing. Reload the page and enter your task code.';
  } else {
    record.taskCode = taskCode;
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

  var screenshots = validateScreenshots_(body.screenshots);
  if (screenshots.error) errors.screenshots = screenshots.error;
  else record.screenshotFiles = screenshots.files;

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
  var sheet = getSheet_(config);
  ensureHeader_(sheet);

  // A retry of a request that already succeeded (e.g. the response was lost)
  // must not create a second row. Checked before the screenshots are saved so
  // a retry does not save them twice; checked again under the lock below.
  var existing = findSubmissionRow_(sheet, record.submissionId);
  if (existing) return duplicateResult_(record, existing);

  // Saving files can take several seconds, so it happens outside the lock.
  // The folder is moved to the trash if the row is not written after all.
  var folder = record.screenshotFiles.length ? saveScreenshots_(config, record) : null;
  record.screenshots = folder ? folder.getUrl() : '';

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
      throw new ApiError_('BUSY', 'The server is busy. Try again in a moment.');
    }
    try {
      ensureHeader_(sheet);
      existing = findSubmissionRow_(sheet, record.submissionId);
      if (existing) {
        if (folder) folder.setTrashed(true);
        return duplicateResult_(record, existing);
      }

      record.submittedAt = new Date().toISOString();
      var row = COLUMNS.map(function (c) { return toCellValue_(record[c[0]]); });
      var rowNumber = sheet.getLastRow() + 1;
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    if (folder) folder.setTrashed(true);
    throw err;
  }

  return { ok: true, submissionId: record.submissionId, submittedAt: record.submittedAt, duplicate: false };
}

function duplicateResult_(record, existing) {
  return { ok: true, submissionId: record.submissionId, submittedAt: existing.submittedAt, duplicate: true };
}

// ---------------------------------------------------------------------------
// Screenshots

/**
 * Checks the optional screenshots array: [{ name, type, data }] where data is
 * base64. Returns { files: [{ name, type, bytes }] } or { error }.
 */
function validateScreenshots_(value) {
  if (value === undefined || value === null) return { files: [] };
  if (!Array.isArray(value)) return { error: 'Screenshots must be a list of images.' };
  if (value.length > MAX_SCREENSHOTS) return { error: 'At most ' + MAX_SCREENSHOTS + ' screenshots can be added per submission.' };
  var files = [];
  var total = 0;
  for (var i = 0; i < value.length; i++) {
    var item = value[i];
    var label = 'Screenshot ' + (i + 1);
    if (!item || typeof item !== 'object' || typeof item.data !== 'string' || !SCREENSHOT_TYPES[item.type]) {
      return { error: label + ' must be a PNG, JPEG, or WebP image.' };
    }
    // Checked on the encoded length first, so an oversized request is not decoded.
    if (item.data.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 + 4) return { error: label + ' is larger than 3 MB.' };
    var bytes;
    try {
      bytes = Utilities.base64Decode(item.data);
    } catch (err) {
      return { error: label + ' could not be read.' };
    }
    if (bytes.length > MAX_SCREENSHOT_BYTES) return { error: label + ' is larger than 3 MB.' };
    if (!hasImageSignature_(bytes, item.type)) return { error: label + ' is not a valid ' + SCREENSHOT_TYPES[item.type].toUpperCase() + ' image.' };
    total += bytes.length;
    if (total > MAX_TOTAL_SCREENSHOT_BYTES) return { error: 'The screenshots add up to more than 15 MB. Remove some and try again.' };
    files.push({ name: typeof item.name === 'string' ? item.name : '', type: item.type, bytes: bytes });
  }
  return { files: files };
}

/** True when the first bytes match the declared image type, so only real images are stored. */
function hasImageSignature_(bytes, type) {
  function at(i) { return bytes[i] & 0xff; }
  function ascii(i, text) {
    for (var k = 0; k < text.length; k++) if (at(i + k) !== text.charCodeAt(k)) return false;
    return true;
  }
  if (type === 'image/png') return at(0) === 0x89 && ascii(1, 'PNG');
  if (type === 'image/jpeg') return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (type === 'image/webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP');
  return false;
}

function ensureScreenshotsFolder_(config) {
  if (config.screenshotsFolderId) {
    try {
      return DriveApp.getFolderById(config.screenshotsFolderId);
    } catch (err) {
      console.error(err);
      throw new ApiError_('CONFIG_ERROR', 'The screenshots folder could not be opened. Check SCREENSHOTS_FOLDER_ID and permissions.');
    }
  }
  var folder = DriveApp.createFolder(SCREENSHOTS_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('SCREENSHOTS_FOLDER_ID', folder.getId());
  config.screenshotsFolderId = folder.getId();
  return folder;
}

/** Saves the screenshots in a new subfolder named after the submission and returns the subfolder. */
function saveScreenshots_(config, record) {
  var parent = ensureScreenshotsFolder_(config);
  var folder = parent.createFolder(record.dateOfTest + ' ' + record.submissionId);
  try {
    record.screenshotFiles.forEach(function (file, i) {
      var base = file.name.replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 80);
      var number = (i < 9 ? '0' : '') + (i + 1);
      var name = number + (base ? ' ' + base : '') + '.' + SCREENSHOT_TYPES[file.type];
      folder.createFile(Utilities.newBlob(file.bytes, file.type, name));
    });
  } catch (err) {
    folder.setTrashed(true);
    console.error(err);
    throw new ApiError_('SERVER_ERROR', 'The screenshots could not be saved to Google Drive. Try again.');
  }
  return folder;
}
