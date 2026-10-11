import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { Play } from './Play'

const user = {
  id: 'u1',
  username: 'Naruto',
  email: 'naruto@konoha.example',
  role: 'admin',
  createdAt: '2026-10-11T00:00:00Z',
}

function renderPlay() {
  return renderWithProviders(<Play />, {
    route: '/play',
    path: '/play',
    otherPaths: ['/login', '/'],
  })
}

describe('Play', () => {
  it('sends visitors without a session to the login page', async () => {
    mockApi({ 'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'Please log in.') })
    renderPlay()
    expect(await screen.findByTestId('location')).toHaveTextContent('/login')
  })

  it('greets the player and shows their account', async () => {
    mockApi({ 'GET /api/auth/me': () => json({ user }) })
    renderPlay()

    expect(
      await screen.findByRole('heading', { name: 'The gate is almost open, Naruto' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText(/naruto@konoha.example · Ninja since Oct 11, 2026/)).toBeInTheDocument()
  })

  it('logs out and returns to the landing page', async () => {
    mockApi({
      'GET /api/auth/me': () => json({ user }),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
