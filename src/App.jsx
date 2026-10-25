import EvaluationForm from './components/EvaluationForm.jsx'
import { AlertCircleIcon } from './components/icons.jsx'

const endpointConfigured = Boolean(import.meta.env.VITE_APPS_SCRIPT_URL)

export default function App() {
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
              The submission endpoint is not configured, so submissions will fail. Set{' '}
              <code className="font-mono text-fg">VITE_APPS_SCRIPT_URL</code> in <code className="font-mono text-fg">.env</code>{' '}
              and restart the dev server.
            </p>
          </div>
        )}

        <EvaluationForm />
      </main>
    </div>
  )
}
