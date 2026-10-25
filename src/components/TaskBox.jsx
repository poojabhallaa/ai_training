import { Fragment } from 'react'
import { TASK_HEADINGS } from '../config/taskHeadings.js'

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const HEADING_KEYS = new Set(TASK_HEADINGS.map(normalize))
const HEADING_LINE = /^(\s*)([^:\n]{1,60}):(.*)$/

// Renders the task text line by line, bolding known headings such as
// "Connector:". Line breaks are kept by the parent's whitespace-pre-wrap.
function TaskText({ text }) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const match = HEADING_LINE.exec(line)
    const content =
      match && HEADING_KEYS.has(normalize(match[2])) ? (
        <>
          {match[1]}
          <strong className="font-bold text-fg">{match[2].trim()}:</strong>
          {match[3]}
        </>
      ) : (
        line
      )
    return (
      <Fragment key={i}>
        {content}
        {i < lines.length - 1 && '\n'}
      </Fragment>
    )
  })
}

// Shows the task the candidate unlocked with their code. The text lives in the
// "Tasks" tab of the Google Sheet, so it can be changed there without editing
// code or redeploying the site.
export default function TaskBox({ task, onChangeCode }) {
  return (
    <section aria-labelledby="task-box-label" className="mb-6 rounded-xl border border-line bg-surface p-5 sm:p-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p id="task-box-label" className="text-xs font-medium tracking-widest text-fg-subtle uppercase">
          Task
        </p>
        <p className="flex items-center gap-3 text-xs text-fg-subtle">
          <span>
            Code <span className="font-mono tracking-wider text-fg-muted">{task.code}</span>
          </span>
          {onChangeCode && (
            <button
              type="button"
              onClick={onChangeCode}
              className="rounded text-fg-muted underline-offset-2 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-white/20"
            >
              Use a different code
            </button>
          )}
        </p>
      </div>

      {task.title && <h2 className="text-base font-bold text-fg sm:text-lg">{task.title}</h2>}
      {task.text && (
        <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words text-fg/85 ${task.title ? 'mt-2' : ''}`}>
          <TaskText text={task.text} />
        </p>
      )}
    </section>
  )
}
