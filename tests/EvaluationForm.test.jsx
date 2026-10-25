import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EvaluationForm from '../src/components/EvaluationForm.jsx'
import { SubmissionError } from '../src/lib/submitEvaluation.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const MULTILINE = 'Line one\nLine two with "quotes" & <tags>\n=SUM(A1:A3)'

async function fillForm(user, overrides = {}) {
  const v = {
    latency: '42.5',
    likert: /^4 - Good/,
    ...overrides,
  }
  await user.selectOptions(screen.getByLabelText(/^Platform/), 'Claude Cowork')
  await user.selectOptions(screen.getByLabelText(/^Model Used/), 'Claude Opus 5.5')
  await user.selectOptions(screen.getByLabelText(/^Reasoning \/ Effort/), 'High')
  await user.type(screen.getByLabelText(/^Prompt\*/), MULTILINE)
  await user.type(screen.getByLabelText(/^Expected Result/), 'Pauses ad set B.')
  await user.click(within(group('Task Success')).getByLabelText('Pass'))
  await user.click(within(group('Which Is Better')).getByLabelText('Claude'))
  const latency = screen.getByLabelText(/^Latency/)
  await user.clear(latency)
  if (v.latency) await user.type(latency, v.latency)
  await user.selectOptions(screen.getByLabelText(/^Degradation Reason/), 'N/A')
  await user.click(within(group('Failure Tags')).getByLabelText('N/A'))
  if (v.likert) await user.click(within(group('Likert Score')).getByLabelText(v.likert))
  await user.click(within(group('State Change Validated')).getByLabelText('Yes'))
  await user.type(screen.getByLabelText(/^Actual Result\*/), 'Paused ad set B.')
  await user.type(screen.getByLabelText(/^Additional Notes/), 'Smooth run.')
}

function group(name) {
  return screen.getByRole('group', { name: new RegExp(`^${name}`) })
}

function submitButton() {
  return screen.getByRole('button', { name: /submit evaluation|submitting/i })
}

describe('EvaluationForm', () => {
  it('renders all sections and no file inputs', () => {
    const { container } = render(<EvaluationForm submit={vi.fn()} />)
    for (const title of [
      'Basic Information',
      'Prompt and Expected Result',
      'Evaluation of Outcome',
      'Actual Result and Additional Notes',
      'Submission',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    // No emoji anywhere in the rendered UI.
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('shows required-field errors and does not submit an empty form', async () => {
    const user = userEvent.setup()
    const submit = vi.fn()
    render(<EvaluationForm submit={submit} />)

    await user.click(submitButton())

    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText('14 fields need attention')).toBeInTheDocument()
    expect(screen.getByText('Enter the prompt.')).toBeInTheDocument()
    expect(screen.getByText('Enter the expected result.')).toBeInTheDocument()
    expect(screen.getByText('Enter the actual result.')).toBeInTheDocument()
    expect(screen.getByText('Enter additional notes.')).toBeInTheDocument()
    expect(screen.getByText('Select a platform.')).toBeInTheDocument()
    expect(screen.getByText('Enter the latency in seconds.')).toBeInTheDocument()
    expect(screen.getByText('Select a score from 1 to 5.')).toBeInTheDocument()
    expect(screen.getByText('Select at least one failure tag, or N/A.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Prompt\*/)).toHaveAttribute('aria-invalid', 'true')
    // Focus moves to the first invalid field.
    expect(screen.getByLabelText(/^Platform/)).toHaveFocus()
  })

  it('clears an error inline as soon as the field is fixed', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    await user.click(submitButton())
    await user.type(screen.getByLabelText(/^Prompt\*/), 'Do the task')
    expect(screen.queryByText('Enter the prompt.')).toBeNull()
    expect(screen.getByText('13 fields need attention')).toBeInTheDocument()
  })

  it('shows a field error on blur before the first submit', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    await user.click(screen.getByLabelText(/^Prompt\*/))
    await user.tab()
    expect(screen.getByText('Enter the prompt.')).toBeInTheDocument()
    expect(screen.queryByText('Enter the expected result.')).toBeNull()
  })

  it.each(['-3', 'abc', '1e3', '12 sec'])('rejects invalid latency %j', async (latency) => {
    const user = userEvent.setup()
    const submit = vi.fn()
    render(<EvaluationForm submit={submit} />)
    await fillForm(user, { latency })
    await user.click(submitButton())
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText(/Latency must be a non-negative number/)).toBeInTheDocument()
  })

  it('requires a Likert score and only offers integers 1 to 5', async () => {
    const user = userEvent.setup()
    const submit = vi.fn()
    render(<EvaluationForm submit={submit} />)
    const options = within(group('Likert Score')).getAllByRole('radio')
    expect(options.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5'])

    await fillForm(user, { likert: null })
    await user.click(submitButton())
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText('Select a score from 1 to 5.')).toBeInTheDocument()
  })

  it('makes N/A exclusive in failure tags', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    const tags = group('Failure Tags')
    await user.click(within(tags).getByLabelText('Timeout'))
    await user.click(within(tags).getByLabelText('Tool call error'))
    await user.click(within(tags).getByLabelText('N/A'))
    expect(within(tags).getByLabelText('N/A')).toBeChecked()
    expect(within(tags).getByLabelText('Timeout')).not.toBeChecked()
    await user.click(within(tags).getByLabelText('Timeout'))
    expect(within(tags).getByLabelText('N/A')).not.toBeChecked()
    expect(within(tags).getByLabelText('Timeout')).toBeChecked()
  })

  it('submits a valid form once, shows a loading state, and confirms only after the backend responds', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    const submit = vi.fn(() => pending.promise)
    render(<EvaluationForm taskCode="FBADS001" submit={submit} />)
    await fillForm(user)

    await user.click(submitButton())
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Submitting...')
    expect(screen.getByLabelText(/^Prompt\*/)).toBeDisabled()
    expect(screen.queryByText('Evaluation saved to Google Sheets')).toBeNull()

    // Repeated clicks and Enter presses while in flight do nothing.
    await user.click(submitButton())
    await user.click(submitButton())
    screen.getByRole('button', { name: /submitting/i }).form.requestSubmit()
    expect(submit).toHaveBeenCalledTimes(1)

    const payload = submit.mock.calls[0][0]
    expect(payload).toMatchObject({
      platform: 'Claude Cowork',
      modelUsed: 'Claude Opus 5.5',
      reasoningEffort: 'High',
      prompt: MULTILINE,
      taskSuccess: 'Pass',
      whichIsBetter: 'Claude',
      latencySeconds: 42.5,
      degradationReason: 'N/A',
      failureTags: ['N/A'],
      likertScore: 4,
      stateChangeValidated: 'Yes',
      taskCode: 'FBADS001',
    })
    expect(payload.submissionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload.dateOfTest).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await act(async () => pending.resolve({ ok: true, submissionId: payload.submissionId, submittedAt: '2026-10-25T10:00:00.000Z' }))

    expect(screen.getByText('Evaluation saved to Google Sheets')).toBeInTheDocument()
    expect(screen.getByText(payload.submissionId)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Prompt\*/)).toHaveValue('')
    expect(submitButton()).toBeEnabled()
  })

  it('uses a new submission ID for the next evaluation after success', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(async (p) => ({ ok: true, submissionId: p.submissionId, submittedAt: '2026-10-25T10:00:00.000Z' }))
    render(<EvaluationForm submit={submit} />)
    await fillForm(user)
    await user.click(submitButton())
    await fillForm(user)
    await user.click(submitButton())
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[0][0].submissionId).not.toBe(submit.mock.calls[1][0].submissionId)
  })

  it('keeps the entered data and shows the error when submission fails, and retries with the same ID', async () => {
    const user = userEvent.setup()
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new SubmissionError('NETWORK_ERROR', 'Could not reach the submission server.'))
      .mockImplementationOnce(async (p) => ({ ok: true, submissionId: p.submissionId, submittedAt: '2026-10-25T10:00:00.000Z' }))
    render(<EvaluationForm submit={submit} />)
    await fillForm(user)

    await user.click(submitButton())
    expect(await screen.findByText('Submission failed')).toBeInTheDocument()
    expect(screen.getByText('Could not reach the submission server.')).toBeInTheDocument()
    expect(screen.getByText('Your answers have been kept.')).toBeInTheDocument()
    expect(screen.queryByText('Evaluation saved to Google Sheets')).toBeNull()
    expect(screen.getByLabelText(/^Prompt\*/)).toHaveValue(MULTILINE)
    expect(screen.getByLabelText(/^Latency/)).toHaveValue('42.5')
    expect(submitButton()).toBeEnabled()

    await user.click(submitButton())
    expect(await screen.findByText('Evaluation saved to Google Sheets')).toBeInTheDocument()
    expect(submit.mock.calls[1][0].submissionId).toBe(submit.mock.calls[0][0].submissionId)
  })

  it('lists backend field errors', async () => {
    const user = userEvent.setup()
    const submit = vi.fn().mockRejectedValue(
      new SubmissionError('VALIDATION_ERROR', 'Some fields are missing or invalid.', { prompt: 'Prompt is required.' }),
    )
    render(<EvaluationForm submit={submit} />)
    await fillForm(user)
    await user.click(submitButton())
    expect(await screen.findByText('Prompt is required.')).toBeInTheDocument()
  })

  it('asks for confirmation before resetting a form with data', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    await user.type(screen.getByLabelText(/^Prompt\*/), 'Some prompt')

    await user.click(screen.getByRole('button', { name: 'Reset Form' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset the form?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText(/^Prompt\*/)).toHaveValue('Some prompt')

    await user.click(screen.getByRole('button', { name: 'Reset Form' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset Form' }))
    expect(screen.getByLabelText(/^Prompt\*/)).toHaveValue('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resets an untouched form without asking', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Reset Form' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks sections complete when their fields are valid', async () => {
    const user = userEvent.setup()
    render(<EvaluationForm submit={vi.fn()} />)
    const prompt = screen.getByRole('region', { name: 'Prompt and Expected Result' })
    expect(within(prompt).getByText('Incomplete')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Prompt\*/), 'p')
    await user.type(screen.getByLabelText(/^Expected Result/), 'e')
    expect(within(prompt).getByText('Complete')).toBeInTheDocument()
  })
})
