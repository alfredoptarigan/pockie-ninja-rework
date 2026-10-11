import type { ApiErrorBody } from '@pockie/shared'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

let csrfToken: string | null = null

async function getCsrfToken() {
  if (!csrfToken) {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    if (!response.ok) throw new ApiError(response.status, 'csrf', 'Could not reach the server.')
    csrfToken = ((await response.json()) as { token: string }).token
  }
  return csrfToken
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function send(path: string, { method = 'GET', body }: RequestOptions) {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET') headers['x-csrf-token'] = await getCsrfToken()
  return fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await send(path, options)
    // The CSRF cookie can disappear (cleared cookies, new browser session): fetch a fresh one once.
    if (response.status === 403 && options.method === 'POST') {
      const body = (await response.clone().json()) as ApiErrorBody
      if (body.error.code === 'csrf') {
        csrfToken = null
        response = await send(path, options)
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.')
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields,
    )
  }
  return data as T
}
