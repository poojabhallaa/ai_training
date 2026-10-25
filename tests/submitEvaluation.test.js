import { describe, expect, it, vi } from 'vitest'
import { createSubmissionId, submitEvaluation } from '../src/lib/submitEvaluation.js'

const payload = { submissionId: 'abc-12345678', prompt: 'x' }
const endpoint = 'https://script.google.com/macros/s/TEST/exec'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })
}

describe('submitEvaluation', () => {
  it('posts JSON as text/plain (no CORS preflight) and returns the confirmation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, submissionId: 'abc-12345678', submittedAt: '2026-10-25T10:00:00.000Z' }))
    const result = await submitEvaluation(payload, { endpoint, fetchImpl, origin: 'https://site.example' })

    expect(result.submittedAt).toBe('2026-10-25T10:00:00.000Z')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(endpoint)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' })
    expect(init.redirect).toBe('follow')
    expect(JSON.parse(init.body)).toEqual({ ...payload, origin: 'https://site.example' })
  })

  it('fails when the endpoint is not configured', async () => {
    await expect(submitEvaluation(payload, { endpoint: '', fetchImpl: vi.fn() })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('surfaces backend errors, including field messages', async () => {
    const fetchImpl = async () =>
      jsonResponse({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Bad', fields: { prompt: 'Prompt is required.' } } })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Bad',
      fields: { prompt: 'Prompt is required.' },
    })
  })

  it('does not treat a non-JSON response (e.g. a Google sign-in page) as success', async () => {
    const fetchImpl = async () => new Response('<html>Sign in</html>', { status: 200 })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('does not treat a confirmation for a different submission as success', async () => {
    const fetchImpl = async () => jsonResponse({ ok: true, submissionId: 'other' })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('does not treat a body without ok:true as success', async () => {
    const fetchImpl = async () => jsonResponse({ submissionId: 'abc-12345678' })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'SERVER_ERROR' })
  })

  it('reports HTTP errors', async () => {
    const fetchImpl = async () => new Response('oops', { status: 500 })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'HTTP_ERROR' })
  })

  it('reports network failures', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(submitEvaluation(payload, { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('times out slow requests', async () => {
    const fetchImpl = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    await expect(submitEvaluation(payload, { endpoint, fetchImpl, timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})

describe('createSubmissionId', () => {
  it('creates unique UUIDs accepted by the backend', () => {
    const ids = new Set(Array.from({ length: 1000 }, createSubmissionId))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/)
  })
})
