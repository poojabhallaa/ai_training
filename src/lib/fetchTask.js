// Loads the task for a task code from the "Tasks" tab of the Google Sheet, via
// the Apps Script web app (GET ?action=task&code=...). The backend only returns
// a task when the code matches one. A GET with no custom headers is a CORS
// simple request, so no preflight is sent.

export class TaskCodeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TaskCodeError'
    this.code = code
  }
}

export async function fetchTask(taskCode, options = {}) {
  const { endpoint = import.meta.env.VITE_APPS_SCRIPT_URL, timeoutMs = 15000, fetchImpl = globalThis.fetch } = options

  if (!endpoint) {
    throw new TaskCodeError('NOT_CONFIGURED', 'The task cannot be loaded because the endpoint is not configured.')
  }

  const url = new URL(endpoint)
  url.searchParams.set('action', 'task')
  url.searchParams.set('code', taskCode)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(url.toString(), { redirect: 'follow', signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new TaskCodeError('TIMEOUT', 'The server did not respond in time. Try again.')
    }
    throw new TaskCodeError('NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) throw new TaskCodeError('HTTP_ERROR', `The server returned an error (HTTP ${response.status}). Try again.`)

  let data
  try {
    data = await response.json()
  } catch {
    throw new TaskCodeError('BAD_RESPONSE', 'The server sent an unexpected response. Try again later.')
  }

  if (!data || data.ok !== true) {
    const err = data?.error ?? {}
    throw new TaskCodeError(err.code || 'SERVER_ERROR', err.message || 'The task could not be loaded. Try again.')
  }

  // A backend from before task codes returns a task without a code for any
  // request, so a missing code is treated as an error rather than a match.
  const task = data.task
  if (!task || typeof task.code !== 'string' || !task.code) {
    throw new TaskCodeError(
      'BAD_RESPONSE',
      'The server did not confirm the code. The Apps Script deployment may need to be updated to the latest version.',
    )
  }
  return { code: task.code, title: task.title || '', text: task.text || '' }
}
