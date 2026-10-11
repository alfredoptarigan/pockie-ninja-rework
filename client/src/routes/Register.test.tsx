import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { Register } from './Register'

const user = {
  id: 'u1',
  username: 'Naruto',
  email: 'naruto@konoha.example',
  role: 'player',
  createdAt: '2026-10-11T00:00:00Z',
}

function renderRegister() {
  return renderWithProviders(<Register />, {
    route: '/register',
    path: '/register',
    otherPaths: ['/play'],
  })
}

async function fill(username: string, email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('Register', () => {
  it('shows inline errors without calling the API when the form is invalid', async () => {
    const fetchMock = mockApi({ 'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x') })
    renderRegister()

    await fill('ab', 'not-an-email', 'short')

    expect(await screen.findByText('Username must be at least 3 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows a taken username under the field', async () => {
    mockApi({
      'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x'),
      'POST /api/auth/register': () =>
        apiError(409, 'conflict', 'That account already exists.', {
          username: 'That username is already taken.',
        }),
    })
    renderRegister()

    await fill('Naruto', 'naruto@konoha.example', 'believe-it')

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
  })

  it('creates the account with a CSRF token and goes to the play page', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x'),
      'POST /api/auth/register': () => json({ user }, 201),
    })
    renderRegister()

    await fill('Naruto', 'Naruto@Konoha.example', 'believe-it')

    expect(await screen.findByTestId('location')).toHaveTextContent('/play')
    expect(requestBody(fetchMock, 'POST /api/auth/register')).toEqual({
      username: 'Naruto',
      email: 'naruto@konoha.example',
      password: 'believe-it',
    })
    const registerCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(registerCall?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'test-token' })
  })
})
