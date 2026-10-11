import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { ServerStatus } from './ServerStatus'

describe('ServerStatus', () => {
  it('shows a checking state, then the active player count', async () => {
    mockApi({ 'GET /api/status': () => json({ online: true, playersActiveNow: 12 }) })
    renderWithProviders(<ServerStatus />)

    expect(screen.getByText('Checking server...')).toBeInTheDocument()
    expect(await screen.findByText(/Server online · 12 players active now/)).toBeInTheDocument()
  })

  it('uses the singular for one player', async () => {
    mockApi({ 'GET /api/status': () => json({ online: true, playersActiveNow: 1 }) })
    renderWithProviders(<ServerStatus />)
    expect(await screen.findByText(/1 player active now/)).toBeInTheDocument()
  })

  it('reports the server as offline when the API fails', async () => {
    mockApi({ 'GET /api/status': () => apiError(502, 'bad_gateway', 'Down') })
    renderWithProviders(<ServerStatus />)
    expect(await screen.findByText('Server offline')).toBeInTheDocument()
  })
})
