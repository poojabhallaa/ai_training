// Runs apps-script/Code.gs in a Node VM with in-memory fakes of the Apps Script
// services it uses. The fake sheet mimics how Google Sheets treats written
// values: a leading apostrophe forces literal text and is not part of the
// stored value; any other string starting with "=" would become a formula.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const CODE_PATH = fileURLToPath(new URL('../../apps-script/Code.gs', import.meta.url))

export class FakeSheet {
  constructor(name) {
    this.name = name
    this.rows = []
    this.formulaCells = []
    this.frozenRows = 0
  }

  getName() {
    return this.name
  }

  getLastRow() {
    return this.rows.length
  }

  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row.length), 0)
  }

  setFrozenRows(n) {
    this.frozenRows = n
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this
    const range = {
      getValues() {
        const out = []
        for (let r = 0; r < numRows; r++) {
          const src = sheet.rows[row - 1 + r] || []
          const line = []
          for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] ?? '')
          out.push(line)
        }
        return out
      },
      getDisplayValues() {
        return range.getValues().map((line) => line.map((v) => String(v)))
      },
      setValues(values) {
        if (values.length !== numRows || values.some((v) => v.length !== numCols)) {
          throw new Error('The number of rows or columns in the data does not match the range.')
        }
        values.forEach((line, r) => {
          const target = (sheet.rows[row - 1 + r] ||= [])
          line.forEach((value, c) => {
            let stored = value
            if (typeof value === 'string' && value.startsWith("'")) stored = value.slice(1)
            else if (typeof value === 'string' && /^[=+]/.test(value)) {
              sheet.formulaCells.push({ row: row + r, col: col + c, value })
            }
            target[col - 1 + c] = stored
          })
        })
        return range
      },
      setFontWeight() {
        return range
      },
    }
    return range
  }
}

export class FakeSpreadsheet {
  constructor(id) {
    this.id = id
    this.sheets = new Map()
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name)
    this.sheets.set(name, sheet)
    return sheet
  }
}

// In-memory Drive: folders hold files ({ name, type, bytes }) and subfolders.
export class FakeFolder {
  constructor(drive, name) {
    this.drive = drive
    this.id = `folder-${drive.folders.size + 1}`
    this.name = name
    this.files = []
    this.children = []
    this.trashed = false
    drive.folders.set(this.id, this)
  }

  getId() {
    return this.id
  }

  getName() {
    return this.name
  }

  getUrl() {
    return `https://drive.google.com/drive/folders/${this.id}`
  }

  createFolder(name) {
    const folder = new FakeFolder(this.drive, name)
    this.children.push(folder)
    return folder
  }

  createFile(blob) {
    if (this.drive.failCreateFile) throw new Error('Drive quota exceeded')
    this.files.push(blob)
    return blob
  }

  setTrashed(trashed) {
    this.trashed = trashed
  }
}

export function createAppsScriptEnv({ properties = {}, spreadsheets = {}, activeSpreadsheet = null } = {}) {
  const props = { ...properties }
  const spreadsheetMap = new Map(Object.entries(spreadsheets))
  const logs = []
  let lockHeld = false
  let lockAvailable = true
  // `files` maps a Drive file ID to its name, for looking up input file names.
  const drive = { folders: new Map(), files: new Map(), failCreateFile: false }

  const context = {
    console: { error: (...args) => logs.push(args), log: (...args) => logs.push(args) },
    Logger: { log: (...args) => logs.push(args) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in props ? props[key] : null),
        setProperty: (key, value) => (props[key] = value),
      }),
    },
    SpreadsheetApp: {
      openById(id) {
        if (!spreadsheetMap.has(id)) throw new Error(`Spreadsheet not found: ${id}`)
        return spreadsheetMap.get(id)
      },
      getActiveSpreadsheet: () => activeSpreadsheet,
      flush() {},
    },
    DriveApp: {
      getFolderById(id) {
        if (!drive.folders.has(id)) throw new Error(`Folder not found: ${id}`)
        return drive.folders.get(id)
      },
      createFolder: (name) => new FakeFolder(drive, name),
      getFileById(id) {
        if (!drive.files.has(id)) throw new Error(`File not found: ${id}`)
        return { getName: () => drive.files.get(id) }
      },
    },
    Utilities: {
      // Like Apps Script, returns signed bytes and throws on invalid input.
      base64Decode(data) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) throw new Error('Could not decode string.')
        return [...Buffer.from(data, 'base64')].map((b) => (b > 127 ? b - 256 : b))
      },
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (!lockAvailable || lockHeld) return false
          lockHeld = true
          return true
        },
        releaseLock() {
          lockHeld = false
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return {
          content,
          mimeType: null,
          setMimeType(type) {
            this.mimeType = type
            return this
          },
        }
      },
    },
  }

  vm.createContext(context)
  vm.runInContext(readFileSync(CODE_PATH, 'utf8'), context, { filename: 'Code.gs' })

  function post(body) {
    const contents = typeof body === 'string' ? body : JSON.stringify(body)
    const output = context.doPost({ postData: { contents, type: 'text/plain' } })
    return { mimeType: output.mimeType, body: JSON.parse(output.content) }
  }

  function get(parameter = {}) {
    const output = context.doGet({ parameter })
    return { mimeType: output.mimeType, body: JSON.parse(output.content) }
  }

  return {
    context,
    post,
    get,
    logs,
    drive,
    properties: props,
    setProperty: (key, value) => (props[key] = value),
    setLockAvailable: (available) => (lockAvailable = available),
  }
}
