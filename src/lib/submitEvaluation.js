// Client for the Google Apps Script web app.
//
// The request is sent as text/plain so the browser treats it as a CORS "simple
// request" and skips the OPTIONS preflight, which Apps Script cannot answer.
// Apps Script always responds with HTTP 200, so success is decided only by the
// JSON body: { ok: true, submissionId, submittedAt } from the backend.

export class SubmissionError extends Error {
  constructor(code, message, fields = null) {
    super(message)
    this.name = 'SubmissionError'
    this.code = code
    this.fields = fields
  }
}

export function createSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Fallback for very old browsers; still random enough to avoid collisions in practice.
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function submitEvaluation(payload, options = {}) {
  const {
    endpoint = import.meta.env.VITE_APPS_SCRIPT_URL,
    // Saving screenshots to Drive takes a few seconds per image.
    timeoutMs = payload?.screenshots?.length ? 120000 : 30000,
    fetchImpl = globalThis.fetch,
    origin = globalThis.location?.origin ?? '',
  } = options

  if (!endpoint) {
    throw new SubmissionError(
      'NOT_CONFIGURED',
      'The submission endpoint is not configured. Set VITE_APPS_SCRIPT_URL and rebuild the site.',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, origin }),
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new SubmissionError(
        'TIMEOUT',
        'The server did not respond in time. Your answers are still here. Try submitting again; a retry will not create a duplicate row.',
      )
    }
    throw new SubmissionError(
      'NETWORK_ERROR',
      'Could not reach the submission server. Check your connection and try again. If this keeps happening, the Apps Script deployment may not allow access from "Anyone".',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new SubmissionError('HTTP_ERROR', `The server returned an error (HTTP ${response.status}). Try again.`)
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new SubmissionError(
      'BAD_RESPONSE',
      'The server sent an unexpected response, so the submission could not be confirmed. Check the Apps Script deployment URL and access settings.',
    )
  }

  if (!data || data.ok !== true) {
    const err = data?.error ?? {}
    throw new SubmissionError(
      err.code || 'SERVER_ERROR',
      err.message || 'The server could not save the evaluation. Try again.',
      err.fields || null,
    )
  }

  if (data.submissionId !== payload.submissionId) {
    throw new SubmissionError(
      'BAD_RESPONSE',
      'The server response did not match this submission, so it could not be confirmed. Try again.',
    )
  }

  return data
}
