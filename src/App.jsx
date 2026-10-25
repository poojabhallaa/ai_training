import { useEffect, useState } from 'react'
import EvaluationForm from './components/EvaluationForm.jsx'
import TaskBox from './components/TaskBox.jsx'
import TaskCodeGate from './components/TaskCodeGate.jsx'
import { AlertCircleIcon, SpinnerIcon } from './components/icons.jsx'
import { ConfirmDialog } from './components/layout.jsx'
import { fetchTask } from './lib/fetchTask.js'

const endpointConfigured = Boolean(import.meta.env.VITE_APPS_SCRIPT_URL)

// The unlocked code is remembered for this browser tab only, so a page refresh
// does not ask for it again. Storage can be unavailable (private windows,
// blocked site data), in which case the code is simply asked for again.
const STORAGE_KEY = 'candidate-evaluation:task-code'

function readSavedCode() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function saveCode(code) {
  try {
    if (code) sessionStorage.setItem(STORAGE_KEY, code)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not remembered; the code is asked for again after a refresh.
  }
}

export default function App({ loadTask = fetchTask }) {
  const [access, setAccess] = useState(() => (readSavedCode() ? { status: 'restoring' } : { status: 'locked' }))
  const [confirmChangeOpen, setConfirmChangeOpen] = useState(false)

  // Re-check a remembered code on load, so a code removed from the sheet stops
  // working and the latest task text is shown.
  useEffect(() => {
    if (access.status !== 'restoring') return
    let cancelled = false
    const code = readSavedCode()
    loadTask(code)
      .then((task) => !cancelled && setAccess({ status: 'unlocked', task }))
      .catch((err) => {
        if (cancelled) return
        if (err.code === 'INVALID_CODE') {
          saveCode('')
          setAccess({ status: 'locked', error: 'Your saved code no longer matches a task. Enter a new code.' })
        } else {
          setAccess({ status: 'locked', code, error: err.message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [access.status, loadTask])

  function unlock(task) {
    saveCode(task.code)
    setAccess({ status: 'unlocked', task })
  }

  function lock() {
    saveCode('')
    setAccess({ status: 'locked' })
  }

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <p className="mb-2 text-xs font-medium tracking-widest text-fg-subtle uppercase">AI Connector Tasks</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Candidate Evaluation</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
            Record how the model handled the task, from the prompt and expected result to what it actually did.
            Fields marked <span className="text-danger">*</span> are required.
          </p>
        </header>

        {!endpointConfigured && (
          <div
            role="note"
            className="mb-6 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm text-fg-muted"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              The submission endpoint is not configured, so tasks cannot be loaded and submissions will fail. Set{' '}
              <code className="font-mono text-fg">VITE_APPS_SCRIPT_URL</code> in <code className="font-mono text-fg">.env</code>{' '}
              and restart the dev server.
            </p>
          </div>
        )}

        {access.status === 'restoring' && (
          <section
            aria-busy="true"
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 text-sm text-fg-muted sm:p-7"
          >
            <SpinnerIcon className="size-4" />
            Opening your task...
          </section>
        )}

        {access.status === 'locked' && (
          <TaskCodeGate
            key={access.error ?? ''}
            onUnlock={unlock}
            load={loadTask}
            initialCode={access.code}
            initialError={access.error}
          />
        )}

        {access.status === 'unlocked' && (
          <>
            <TaskBox task={access.task} onChangeCode={() => setConfirmChangeOpen(true)} />
            <EvaluationForm key={access.task.code} taskCode={access.task.code} />
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmChangeOpen}
        title="Use a different code?"
        message="You will be asked for a new task code. Any answers you have not submitted will be cleared."
        confirmLabel="Use a different code"
        onCancel={() => setConfirmChangeOpen(false)}
        onConfirm={() => {
          setConfirmChangeOpen(false)
          lock()
        }}
      />
    </div>
  )
}
