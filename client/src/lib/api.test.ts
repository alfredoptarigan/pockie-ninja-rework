import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi } from '../test/utils'
import { api, ApiError } from './api'

describe('api', () => {
  it('returns parsed JSON for GET requests without a CSRF header', async () => {
    const fetchMock = mockApi({ 'GET /api/faq': () => json({ items: [] }) })
    await expect(api('/api/faq')).resolves.toEqual({ items: [] })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-csrf-token')
  })

  it('throws an ApiError carrying the field errors', async () => {
    mockApi({
      'POST /api/auth/register': () =>
        apiError(409, 'conflict', 'That account already exists.', { email: 'Taken.' }),
    })
    const error = await api('/api/auth/register', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'conflict', fields: { email: 'Taken.' } })
  })

  it('fetches a new CSRF token and retries once when the token was rejected', async () => {
    let attempts = 0
    mockApi({
      'POST /api/auth/logout': () => {
        attempts += 1
        return attempts === 1
          ? apiError(403, 'csrf', 'Your session expired.')
          : new Response(null, { status: 204 })
      },
    })
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })

  it('reports network failures in plain English', async () => {
    mockApi({
      'GET /api/status': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await expect(api('/api/status')).rejects.toMatchObject({
      code: 'network',
      message: 'Could not reach the server. Check your connection.',
    })
  })
})
