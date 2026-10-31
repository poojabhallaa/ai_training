import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.jsx'
import SlidesEvaluation from '../src/components/SlidesEvaluation.jsx'
import { OVERALL_INTRO, SLIDES_AXES, SLIDES_INSTRUCTIONS } from '../src/config/slidesEval.js'
import { fetchTask } from '../src/lib/fetchTask.js'

const TASK = {
  code: 'SLIDES03',
  type: 'slides',
  title: 'Rental deck',
  request: 'Make a deck.\nKeep it visual.',
  inputFiles: [
    { name: 'image.webp', url: '' },
    { name: '2024_20P.pdf', url: 'https://example.com/a.pdf' },
  ],
  responses: [
    { label: 'A', fileId: 'fileA' },
    { label: 'B', fileId: 'fileB' },
    { label: 'C', fileId: 'fileC' },
  ],
}
const TWO = { ...TASK, code: 'SLIDES02', title: '', inputFiles: [], responses: TASK.responses.slice(0, 2) }
const AXIS_KEYS = [...SLIDES_AXES.map((a) => a.key), 'overall']

function column(label) {
  return within(document.getElementById(`response-${label}`))
}

// Fills every rating and explanation for one response. fireEvent keeps this
// fast; userEvent is used where the interaction itself is under test.
function rateResponse(label, score = 6) {
  for (const key of AXIS_KEYS) {
    fireEvent.click(document.querySelector(`input[name="${label}-${key}"][value="${score}"]`))
    fireEvent.change(document.getElementById(`${label}-${key}Explanation`), { target: { value: `${label} ${key}` } })
  }
}

function rank(index, label) {
  fireEvent.click(document.querySelector(`input[name="rank-${index + 1}"][value="${label}"]`))
}

afterEach(() => sessionStorage.clear())

describe('SlidesEvaluation', () => {
  it('shows the instructions, request, input files and one preview per response', () => {
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Rental deck' })).toBeInTheDocument()
    expect(screen.getByText(SLIDES_INSTRUCTIONS)).toBeInTheDocument()
    expect(screen.getByText(/Make a deck\.\s+Keep it visual\./)).toBeInTheDocument()
    expect(screen.getByText('image.webp').closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: '2024_20P.pdf' })).toHaveAttribute('href', 'https://example.com/a.pdf')

    const frames = document.querySelectorAll('iframe')
    expect([...frames].map((f) => f.getAttribute('src'))).toEqual([
      'https://drive.google.com/file/d/fileA/preview',
      'https://drive.google.com/file/d/fileB/preview',
      'https://drive.google.com/file/d/fileC/preview',
    ])
    expect(screen.getAllByRole('heading', { name: 'Individual Rating' })).toHaveLength(3)
    expect(screen.getAllByRole('group', { name: /^Rank \d/ })).toHaveLength(3)
  })

  it('uses the axis wording exactly, with 1 to 7 for each', () => {
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={vi.fn()} />)
    const a = column('A')
    for (const axis of SLIDES_AXES) {
      const group = a.getByRole('group', { name: new RegExp(`^${axis.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
      expect(within(group).getAllByRole('radio').map((r) => r.value)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
      expect(a.getByLabelText(new RegExp(`^${axis.explainLabel}`))).toHaveAttribute('placeholder', axis.placeholder)
    }
    expect(a.getByText(OVERALL_INTRO)).toBeInTheDocument()
    expect(a.getByRole('group', { name: /^Overall/ })).toBeInTheDocument()
    expect(a.getByLabelText(/^Explain the overall rating/)).toHaveAttribute('placeholder', 'Briefly explain the overall score')
  })

  it('uses a default heading and only two ranks for a two-response task', () => {
    render(<SlidesEvaluation task={TWO} onChangeCode={() => {}} submit={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Slides Evaluation' })).toBeInTheDocument()
    expect(document.querySelectorAll('iframe')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Response C' })).toBeNull()
    expect(screen.getAllByRole('group', { name: /^Rank \d/ })).toHaveLength(2)
    expect(screen.queryByText('Input files')).toBeNull()
  })

  it('moves a response to a new rank instead of ranking it twice', () => {
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={vi.fn()} />)
    rank(0, 'B')
    rank(1, 'B')
    expect(document.querySelector('input[name="rank-1"][value="B"]')).not.toBeChecked()
    expect(document.querySelector('input[name="rank-2"][value="B"]')).toBeChecked()
  })

  it('blocks submission until everything is answered and switches to the response with the first gap', async () => {
    const user = userEvent.setup()
    const submit = vi.fn()
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={submit} />)
    rateResponse('A')
    await user.click(screen.getByRole('button', { name: 'Submit Evaluation' }))

    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText(/answers need attention/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Response B' })).toHaveAttribute('aria-pressed', 'true')
    expect(column('B').getAllByText('Choose a rating from 1 to 7.')).toHaveLength(6)
    expect(column('A').queryByText('Choose a rating from 1 to 7.')).toBeNull()
    expect(screen.getAllByText('Choose a response for this rank.')).toHaveLength(3)
    expect(screen.getByText('Explain what drove the ranking.')).toBeInTheDocument()
  })

  it('submits the ratings, ranking and reason, then clears the form', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(async (payload) => ({ ok: true, submissionId: payload.submissionId, submittedAt: '2026-10-31T10:00:00.000Z' }))
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={submit} />)
    for (const label of ['A', 'B', 'C']) rateResponse(label, label === 'B' ? 7 : 4)
    rank(0, 'B')
    rank(1, 'A')
    rank(2, 'C')
    await user.type(screen.getByLabelText(/^What drove the ranking\?/), 'B was clearest.')
    await user.click(screen.getByRole('button', { name: 'Submit Evaluation' }))

    expect(submit).toHaveBeenCalledTimes(1)
    const payload = submit.mock.calls[0][0]
    expect(payload).toMatchObject({ kind: 'slides', taskCode: 'SLIDES03', ranking: ['B', 'A', 'C'], rankingReason: 'B was clearest.' })
    expect(payload.ratings.B).toMatchObject({ contentQuality: 7, overall: 7, layoutExplanation: 'B layout' })
    expect(payload.ratings.A.writingStyle).toBe(4)
    expect(Object.keys(payload.ratings)).toEqual(['A', 'B', 'C'])
    expect(await screen.findByText('Evaluation saved to Google Sheets')).toBeInTheDocument()
    expect(screen.getByLabelText(/^What drove the ranking\?/)).toHaveValue('')
  })

  it('keeps the answers and the submission ID when the server fails', async () => {
    const user = userEvent.setup()
    const error = Object.assign(new Error('The server is busy.'), { code: 'BUSY' })
    const submit = vi.fn().mockRejectedValue(error)
    render(<SlidesEvaluation task={TWO} onChangeCode={() => {}} submit={submit} />)
    rateResponse('A')
    rateResponse('B')
    rank(0, 'A')
    rank(1, 'B')
    await user.type(screen.getByLabelText(/^What drove the ranking\?/), 'Close call.')
    await user.click(screen.getByRole('button', { name: 'Submit Evaluation' }))
    expect(await screen.findByText('The server is busy.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^What drove the ranking\?/)).toHaveValue('Close call.')
    await user.click(screen.getByRole('button', { name: 'Submit Evaluation' }))
    expect(submit.mock.calls[1][0].submissionId).toBe(submit.mock.calls[0][0].submissionId)
  })

  it('opens a response in a full-screen viewer', async () => {
    const user = userEvent.setup()
    render(<SlidesEvaluation task={TASK} onChangeCode={() => {}} submit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Open Response B full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'Response B' })
    expect(dialog.querySelector('iframe')).toHaveAttribute('src', 'https://drive.google.com/file/d/fileB/preview')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Response B' })).toBeNull()
  })
})

describe('App with a slides task code', () => {
  it('opens the slides page for a slides code and the home button asks for a new code', async () => {
    const user = userEvent.setup()
    render(<App loadTask={vi.fn(async () => TASK)} />)
    await user.type(screen.getByLabelText(/^Task code/), 'slides03')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { name: 'Rental deck' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Basic Information' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Use a different code' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Use a different code' }))
    expect(screen.getByRole('heading', { name: 'Enter your task code' })).toBeInTheDocument()
  })
})

describe('fetchTask for slides tasks', () => {
  it('returns the slides fields', async () => {
    const task = { ...TASK, extra: 'ignored' }
    const fetchImpl = async () => new Response(JSON.stringify({ ok: true, task }))
    expect(await fetchTask('SLIDES03', { endpoint: 'https://example.com/exec', fetchImpl })).toEqual(TASK)
  })
})
