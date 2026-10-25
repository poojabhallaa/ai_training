import { useState } from 'react'
import { fetchTask } from '../lib/fetchTask.js'
import { TextInput } from './fields.jsx'
import { SpinnerIcon } from './icons.jsx'

// Asks for the task code before anything else is shown. Each task in the
// "Tasks" tab of the Google Sheet has its own code; the backend checks it and
// returns that task, which is passed to onUnlock.
export default function TaskCodeGate({ onUnlock, load = fetchTask, initialCode = '', initialError }) {
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState(initialError)
  const [checking, setChecking] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (checking) return
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Enter the task code you were given.')
      return
    }
    setChecking(true)
    setError(undefined)
    try {
      onUnlock(await load(trimmed))
    } catch (err) {
      setError(err.message)
      setChecking(false)
    }
  }

  return (
    <section aria-labelledby="task-code-title" className="rounded-xl border border-line bg-surface p-5 sm:p-7">
      <p className="mb-3 text-xs font-medium tracking-widest text-fg-subtle uppercase">Task</p>
      <h2 id="task-code-title" className="text-base font-semibold text-fg sm:text-lg">
        Enter your task code
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Each task has its own code. Enter the code you were given to open the task and the evaluation form.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextInput
          id="taskCode"
          label="Task code"
          required
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (error) setError(undefined)
          }}
          error={error}
          disabled={checking}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. AB3D7KQ9"
          className="flex-1 [&_input]:font-mono [&_input]:tracking-wider"
        />
        <button type="submit" disabled={checking} className="btn-primary sm:mt-7 sm:min-w-36">
          {checking ? (
            <>
              <SpinnerIcon className="size-4" />
              Checking...
            </>
          ) : (
            'Continue'
          )}
        </button>
      </form>
    </section>
  )
}
