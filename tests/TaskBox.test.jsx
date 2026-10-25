import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TaskBox from '../src/components/TaskBox.jsx'
import { fetchTask } from '../src/lib/fetchTask.js'

describe('TaskBox', () => {
  it('shows the task title, code, and text with line breaks', () => {
    render(<TaskBox task={{ code: 'FBADS001', title: 'Facebook Ads review', text: 'Line 1\nLine 2' }} />)
    expect(screen.getByRole('heading', { name: 'Facebook Ads review' })).toBeInTheDocument()
    expect(screen.getByText('FBADS001')).toBeInTheDocument()
    const text = screen.getByText(/Line 1/)
    expect(text.textContent).toBe('Line 1\nLine 2')
    expect(text).toHaveClass('whitespace-pre-wrap')
  })

  it('offers to switch to a different code', async () => {
    const onChangeCode = vi.fn()
    render(<TaskBox task={{ code: 'X', title: 'T', text: '' }} onChangeCode={onChangeCode} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use a different code' }))
    expect(onChangeCode).toHaveBeenCalledOnce()
  })
})

describe('TaskBox headings', () => {
  const text = [
    'Connector: Facebook Ads',
    'Surface: Web',
    'Platform to be used: Claude Cowork',
    'Hero Use Case: Find and pause the worst ad set',
    'Power-User- Workflow: Compare CPA across ad sets',
    'Why High Value: Saves budget',
    'Key Actions Exercised: Read insights, update status',
    'State Changing: Yes',
    'Setup Difficulty: Medium',
    'Payments/ Real Interactions: No',
    'Step 1: not a heading',
  ].join('\n')

  it('bolds every known heading and keeps the values and line breaks', () => {
    const { container } = render(<TaskBox task={{ code: 'C', title: 'Facebook Ads task', text }} />)
    const title = screen.getByRole('heading', { name: 'Facebook Ads task' })
    expect(title).toHaveClass('font-bold')
    const bold = [...container.querySelectorAll('strong')].map((el) => el.textContent)
    expect(bold).toEqual([
      'Connector:',
      'Surface:',
      'Platform to be used:',
      'Hero Use Case:',
      'Power-User- Workflow:',
      'Why High Value:',
      'Key Actions Exercised:',
      'State Changing:',
      'Setup Difficulty:',
      'Payments/ Real Interactions:',
    ])
    expect(container.querySelector('p.whitespace-pre-wrap').textContent).toBe(text)
  })

  it('bolds a heading on its own line and ignores case', () => {
    const { container } = render(<TaskBox task={{ code: 'C', title: '', text: 'title: X\nhero use case:\nDetails here' }} />)
    expect([...container.querySelectorAll('strong')].map((el) => el.textContent)).toEqual(['title:', 'hero use case:'])
  })
})

describe('fetchTask', () => {
  const endpoint = 'https://script.google.com/macros/s/TEST/exec'
  const task = { code: 'FBADS001', title: 'T', text: 'X' }

  it('requests ?action=task with the code and no custom headers (no CORS preflight)', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, task }))
    expect(await fetchTask('fb ads&001', { endpoint, fetchImpl })).toEqual(task)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${endpoint}?action=task&code=fb+ads%26001`)
    expect(init.headers).toBeUndefined()
    expect(init.method).toBeUndefined()
  })

  it('rejects an unknown code with the INVALID_CODE error from the backend', async () => {
    const fetchImpl = async () => Response.json({ ok: false, error: { code: 'INVALID_CODE', message: 'No match.' } })
    await expect(fetchTask('NOPE', { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'INVALID_CODE', message: 'No match.' })
  })

  it('does not accept a task the backend returned without confirming the code', async () => {
    // What an Apps Script deployment from before task codes returns for any request.
    const fetchImpl = async () => Response.json({ ok: true, task: { title: 'T', text: 'X' } })
    await expect(fetchTask('ANY', { endpoint, fetchImpl })).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('rejects non-JSON responses, HTTP errors, and network errors', async () => {
    await expect(fetchTask('C', { endpoint, fetchImpl: async () => new Response('<html>') })).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    })
    await expect(
      fetchTask('C', { endpoint, fetchImpl: async () => new Response('', { status: 500 }) }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' })
    await expect(
      fetchTask('C', {
        endpoint,
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('rejects when the endpoint is not configured', async () => {
    await expect(fetchTask('C', { endpoint: '', fetchImpl: vi.fn() })).rejects.toThrow(/not configured/)
  })
})
