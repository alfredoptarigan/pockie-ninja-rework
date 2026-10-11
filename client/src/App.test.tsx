import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { apiError, json, mockApi } from './test/utils'

function renderAt(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App', () => {
  it('renders the landing page with all sections', async () => {
    mockApi({
      'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'x'),
      'GET /api/status': () => json({ online: true, playersActiveNow: 3 }),
      'GET /api/posts': () => json({ items: [], nextCursor: null }),
      'GET /api/lore': () => json({ items: [] }),
      'GET /api/faq': () => json({ items: [] }),
    })
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pockie NinjaRemastered')
    expect(await screen.findByText(/3 players active now/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'News, updates and events' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lore of the five seals' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Frequently asked questions' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Claim your ninja name' }),
    ).toBeInTheDocument()
  })

  it('renders a not found page for unknown routes', () => {
    mockApi({})
    renderAt('/nowhere')
    expect(screen.getByRole('heading', { name: 'Lost in the sand' })).toBeInTheDocument()
  })
})
