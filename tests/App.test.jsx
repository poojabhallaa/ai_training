import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.jsx'
import { TaskCodeError } from '../src/lib/fetchTask.js'

const STORAGE_KEY = 'candidate-evaluation:task-code'
const TASK = { code: 'FBADS001', title: 'Facebook Ads review', text: 'Pause the worst ad set.' }

function loader(tasks = { FBADS001: TASK }) {
  return vi.fn(async (code) => {
    const task = tasks[code.toUpperCase()]
    if (!task) throw new TaskCodeError('INVALID_CODE', 'That code does not match any task. Check it and try again.')
    return task
  })
}

async function enterCode(user, code) {
  await user.type(screen.getByLabelText(/^Task code/), code)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

afterEach(() => sessionStorage.clear())

describe('App task code gate', () => {
  it('shows only the code form until a valid code is entered', async () => {
    const user = userEvent.setup()
    const loadTask = loader()
    render(<App loadTask={loadTask} />)

    expect(screen.getByRole('heading', { name: 'Enter your task code' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Basic Information' })).toBeNull()
    expect(screen.queryByText(TASK.text)).toBeNull()

    await enterCode(user, 'fbads001')

    expect(await screen.findByRole('heading', { name: TASK.title })).toBeInTheDocument()
    expect(screen.getByText(TASK.text)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Task code/)).toBeNull()
    expect(loadTask).toHaveBeenCalledWith('fbads001')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('FBADS001')
  })

  it('keeps the form locked and explains when the code is wrong', async () => {
    const user = userEvent.setup()
    render(<App loadTask={loader()} />)
    await enterCode(user, 'WRONG')
    expect(await screen.findByText(/does not match any task/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Task code/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('heading', { name: 'Basic Information' })).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('asks for a code instead of calling the backend when the field is empty', async () => {
    const user = userEvent.setup()
    const loadTask = loader()
    render(<App loadTask={loadTask} />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Enter the task code you were given.')).toBeInTheDocument()
    expect(loadTask).not.toHaveBeenCalled()
  })

  it('reopens the task for a code saved in this tab, after re-checking it', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'FBADS001')
    const loadTask = loader()
    render(<App loadTask={loadTask} />)
    expect(screen.getByText('Opening your task...')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: TASK.title })).toBeInTheDocument()
    expect(loadTask).toHaveBeenCalledWith('FBADS001')
  })

  it('forgets a saved code that no longer matches a task', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'REMOVED1')
    render(<App loadTask={loader()} />)
    expect(await screen.findByText(/saved code no longer matches/)).toBeInTheDocument()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('keeps a saved code and lets the user retry when the server cannot be reached', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'FBADS001')
    const loadTask = vi
      .fn()
      .mockRejectedValueOnce(new TaskCodeError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce(TASK)
    const user = userEvent.setup()
    render(<App loadTask={loadTask} />)
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Task code/)).toHaveValue('FBADS001')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: TASK.title })).toBeInTheDocument()
  })

  it('switches to a different code after confirmation', async () => {
    const user = userEvent.setup()
    const other = { code: 'SHOP0002', title: 'Shopify restock', text: 'Restock.' }
    render(<App loadTask={loader({ FBADS001: TASK, SHOP0002: other })} />)
    await enterCode(user, 'FBADS001')
    await user.click(await screen.findByRole('button', { name: 'Use a different code' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Use a different code' }))

    expect(screen.getByRole('heading', { name: 'Enter your task code' })).toBeInTheDocument()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    await enterCode(user, 'SHOP0002')
    expect(await screen.findByRole('heading', { name: other.title })).toBeInTheDocument()
  })
})
