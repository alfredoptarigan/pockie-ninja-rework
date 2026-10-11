import type { ApiErrorBody } from '@pockie/shared'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { z, ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

function body(code: string, message: string, fields?: Record<string, string>): ApiErrorBody {
  return { error: fields ? { code, message, fields } : { code, message } }
}

function firstFieldErrors(error: ZodError) {
  const { fieldErrors } = z.flattenError(error)
  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, string[] | undefined>).flatMap(
      ([field, messages]) => (messages?.[0] ? [[field, messages[0]]] : []),
    ),
  )
}

export function errorHandler(
  error: FastifyError | HttpError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply
      .code(400)
      .send(body('validation', 'Please check the highlighted fields.', firstFieldErrors(error)))
  }
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send(body(error.code, error.message, error.fields))
  }
  const status = error.statusCode ?? 500
  if (status < 500) {
    return reply.code(status).send(body(error.code ?? 'bad_request', error.message))
  }
  request.log.error(error)
  return reply.code(500).send(body('internal', 'Something went wrong. Please try again.'))
}
