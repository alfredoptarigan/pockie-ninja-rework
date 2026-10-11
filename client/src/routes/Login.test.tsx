import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { Login } from './Login'

const user = {
  id: 'u1',
  username: 'Naruto',
  email: 'naruto@konoha.example',
  role: 'player',
  createdAt: '2026-10-11T00:00:00Z',
}

function renderLogin() {
  return renderWithProviders(<Login />, { route: '/login', path: '/login', otherPaths: ['/play'] })
}

async function submit(login: string, password: string, remember = false) {
  await userEvent.type(screen.getByLabelText('Username or email'), login)
  await userEvent.type(screen.getByLabelText('Password'), password)
  if (remember) await userEvent.click(screen.getByLabelText('Remember me for 30 days'))
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('Login', () => {
  it('requires both fields', async () => {
    mockApi({ 'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x') })
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Enter your username or email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('shows the generic error from the server as an alert', async () => {
    mockApi({
      'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x'),
      'POST /api/auth/login': () =>
        apiError(401, 'invalid_credentials', 'Wrong username, email or password.'),
    })
    renderLogin()

    await submit('Naruto', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username, email or password.')
  })

  it('sends remember me and redirects to the play page', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x'),
      'POST /api/auth/login': () => json({ user }),
    })
    renderLogin()

    await submit('Naruto', 'believe-it', true)

    expect(await screen.findByTestId('location')).toHaveTextContent('/play')
    expect(requestBody(fetchMock, 'POST /api/auth/login')).toEqual({
      login: 'Naruto',
      password: 'believe-it',
      rememberMe: true,
    })
  })

  it('redirects straight away when already logged in', async () => {
    mockApi({ 'GET /api/auth/me': () => json({ user }) })
    renderLogin()
    expect(await screen.findByTestId('location')).toHaveTextContent('/play')
  })
})
