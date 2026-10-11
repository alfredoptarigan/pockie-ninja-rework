import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function apiError(status: number, code: string, message: string, fields?: object) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status)
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>

/**
 * Stubs fetch with handlers keyed by "METHOD /path". The CSRF endpoint is answered by default.
 * Unknown requests fail the test loudly.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler =
      handlers[key] ?? (key === 'GET /api/auth/csrf' ? () => json({ token: 'test-token' }) : null)
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function requestBody(fetchMock: ReturnType<typeof mockApi>, key: string) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}` === key,
  )
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined
}

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

/** Renders inside a fresh QueryClient and a memory router; extra routes render their path. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '/', otherPaths = [] as string[] } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          {otherPaths.map((other) => (
            <Route key={other} path={other} element={<LocationProbe />} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
