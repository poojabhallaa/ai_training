import { AlertCircleIcon, CheckIcon, ChevronDownIcon } from './icons.jsx'

const controlBase =
  'w-full rounded-lg border bg-surface-raised px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-colors duration-150 outline-none ' +
  'focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60'

function borderClass(error) {
  return error
    ? 'border-danger/70 hover:border-danger focus:border-danger focus:ring-danger/20'
    : 'border-line hover:border-line-strong focus:border-fg-muted focus:ring-white/10'
}

function describedBy(id, helper, error) {
  return [helper ? `${id}-helper` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
}

export function FieldShell({ id, label, required, helper, error, as = 'div', className = '', children }) {
  const Tag = as
  const isGroup = as === 'fieldset'
  const LabelTag = isGroup ? 'legend' : 'label'
  // For grouped controls the fieldset/legend provides the accessible name, and
  // the helper and error text are attached to the group.
  const groupProps = isGroup ? { 'aria-describedby': describedBy(id, helper, error) } : {}
  return (
    <Tag className={`min-w-0 ${className}`} data-field={id} {...groupProps}>
      <LabelTag
        {...(isGroup ? {} : { htmlFor: id })}
        className="mb-1.5 flex items-center gap-1 text-sm font-medium text-fg"
      >
        {label}
        {required && (
          <>
            <span className="text-danger" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </LabelTag>
      {children}
      {helper && (
        <p id={`${id}-helper`} className="mt-1.5 text-xs leading-relaxed text-fg-muted">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </Tag>
  )
}

export function TextInput({ id, label, required, helper, error, className, ...props }) {
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} className={className}>
      <input
        id={id}
        name={id}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        className={`${controlBase} ${borderClass(error)}`}
        {...props}
      />
    </FieldShell>
  )
}

export function TextArea({ id, label, required, helper, error, className, rows = 5, ...props }) {
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} className={className}>
      <textarea
        id={id}
        name={id}
        rows={rows}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        className={`${controlBase} ${borderClass(error)} min-h-28 resize-y leading-relaxed`}
        {...props}
      />
    </FieldShell>
  )
}

export function Select({ id, label, required, helper, error, options, placeholder = 'Select an option', className, ...props }) {
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} className={className}>
      <div className="relative">
        <select
          id={id}
          name={id}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, helper, error)}
          className={`${controlBase} ${borderClass(error)} cursor-pointer appearance-none pr-10 ${props.value ? '' : 'text-fg-subtle'}`}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt} className="text-fg">
              {opt}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted" />
      </div>
    </FieldShell>
  )
}

// Single-choice group rendered as connected buttons. Uses native radios for
// keyboard support (arrow keys move between options).
export function SegmentedControl({ id, label, required, helper, error, options, value, onChange, onBlur, disabled, className }) {
  return (
    <FieldShell id={id} as="fieldset" label={label} required={required} helper={helper} error={error} className={className}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const optValue = typeof opt === 'object' ? opt.value : opt
          const optLabel = typeof opt === 'object' ? opt.label : opt
          const checked = value === optValue
          return (
            <label
              key={optValue}
              className={
                'relative flex min-w-16 flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm ' +
                'transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/20 ' +
                (checked
                  ? 'border-fg-muted bg-white/[0.08] font-medium text-fg'
                  : `${error ? 'border-danger/60' : 'border-line'} bg-surface-raised text-fg-muted hover:border-line-strong hover:text-fg`) +
                (disabled ? ' pointer-events-none opacity-60' : '')
              }
            >
              <input
                type="radio"
                name={id}
                value={optValue}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(optValue)}
                onBlur={onBlur}
                className="sr-only"
              />
              {optLabel}
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}

// Likert scale: numbered buttons with a short descriptor beneath each.
export function LikertScale({ id, label, required, helper, error, options, value, onChange, onBlur, disabled, className }) {
  return (
    <FieldShell id={id} as="fieldset" label={label} required={required} helper={helper} error={error} className={className}>
      <div className="grid grid-cols-5 gap-2">
        {options.map((opt) => {
          const checked = value === opt.value
          return (
            <label
              key={opt.value}
              className={
                'flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-1 py-2.5 text-center ' +
                'transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/20 ' +
                (checked
                  ? 'border-fg-muted bg-white/[0.08] text-fg'
                  : `${error ? 'border-danger/60' : 'border-line'} bg-surface-raised text-fg-muted hover:border-line-strong hover:text-fg`) +
                (disabled ? ' pointer-events-none opacity-60' : '')
              }
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                onBlur={onBlur}
                aria-label={`${opt.value} - ${opt.label}`}
                className="sr-only"
              />
              <span className="text-base font-semibold tabular-nums">{opt.value}</span>
              <span className="hidden text-[11px] leading-tight sm:block">{opt.label}</span>
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}

// Multi-select rendered as toggleable chips. `exclusiveValue` (e.g. "N/A")
// cannot be combined with other selections.
export function ChipMultiSelect({ id, label, required, helper, error, options, value, onChange, onBlur, exclusiveValue, disabled, className }) {
  function toggle(opt) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else if (opt === exclusiveValue) {
      onChange([opt])
    } else {
      onChange([...value.filter((v) => v !== exclusiveValue), opt])
    }
  }

  return (
    <FieldShell id={id} as="fieldset" label={label} required={required} helper={helper} error={error} className={className}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt)
          return (
            <label
              key={opt}
              className={
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ' +
                'transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/20 ' +
                (checked
                  ? 'border-fg-muted bg-white/[0.08] text-fg'
                  : `${error ? 'border-danger/60' : 'border-line'} bg-surface-raised text-fg-muted hover:border-line-strong hover:text-fg`) +
                (disabled ? ' pointer-events-none opacity-60' : '')
              }
            >
              <input
                type="checkbox"
                name={id}
                value={opt}
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(opt)}
                onBlur={onBlur}
                className="sr-only"
              />
              {checked && <CheckIcon className="size-3" />}
              {opt}
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}
