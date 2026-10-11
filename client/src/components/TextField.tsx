import { useId, type ComponentProps } from 'react'

interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-display font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 rounded-xl border-[3px] bg-paper px-4 text-base outline-none transition-shadow focus:shadow-sticker-sm focus-visible:ring-4 focus-visible:ring-blue/40 ${
          error ? 'border-coral' : 'border-ink'
        }`}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
