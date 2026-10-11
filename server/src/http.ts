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

const DEFAULT_400 = 'The request could not be understood.'
const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  404: 'Not found.',
  413: 'The request is too large.',
  415: 'Unsupported content type.',
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send(body('not_found', 'Not found.'))
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
  if (status === 429 && error.code === 'rate_limited') {
    return reply.code(429).send(body(error.code, error.message))
  }
  if (status < 500) {
    // Framework errors (JSON parser, content type, body size) keep their internals to the log.
    request.log.info({ err: error }, 'client error')
    return reply
      .code(status)
      .send(body('bad_request', CLIENT_ERROR_MESSAGES[status] ?? DEFAULT_400))
  }
  request.log.error(error)
  return reply.code(500).send(body('internal', 'Something went wrong. Please try again.'))
}
