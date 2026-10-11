import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '../lib/api'

/** Shows server-side field errors under their inputs and anything else as a form-level alert. */
export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  fields: Path<T>[],
) {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(0, 'unknown', 'Something went wrong. Please try again.')

  let matched = false
  for (const field of fields) {
    const message = apiError.fields[field]
    if (message) {
      setError(field, { message })
      matched = true
    }
  }
  if (!matched) setError('root', { message: apiError.message })
}
