import type { Post } from '@pockie/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { NewsTabs } from './NewsTabs'

function post(n: number, kind: Post['kind']): Post {
  return {
    id: `00000000-0000-7000-8000-00000000000${n}`,
    kind,
    slug: `post-${n}`,
    title: `Post title ${n}`,
    summary: `Summary ${n}`,
    body: `Body ${n}`,
    publishedAt: '2026-10-10T09:00:00Z',
  }
}

describe('NewsTabs', () => {
  it('shows a skeleton, then the latest posts with their kind and date', async () => {
    mockApi({ 'GET /api/posts': () => json({ items: [post(1, 'news')], nextCursor: null }) })
    renderWithProviders(<NewsTabs />)

    expect(screen.getByRole('status', { name: 'Loading posts' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Post title 1' })).toBeInTheDocument()
    expect(screen.getByText('Oct 10, 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('corrects both legacy level-cap claims in news from the API', async () => {
    mockApi({
      'GET /api/posts': () =>
        json({
          items: [
            {
              ...post(1, 'news'),
              title: 'Uzumaki Naruto',
              summary: 'Level cap: 100',
              body: 'We keep the level cap at 100, just like the original.',
            },
            { ...post(2, 'update'), body: 'A level table that tops out at 100.' },
          ],
          nextCursor: null,
        }),
    })
    renderWithProviders(<NewsTabs />)
    expect(await screen.findByRole('heading', { name: 'Naruto Uzumaki' })).toBeInTheDocument()
    expect(screen.getByText('Level cap: 90')).toBeInTheDocument()
    await userEvent.click(screen.getAllByText('Read more')[0]!)
    expect(screen.getByText('We keep the level cap at 90, just like the original.')).toBeVisible()
    expect(screen.getByText('A level table that tops out at 90.')).toBeInTheDocument()
    expect(screen.queryByText(/level cap at 100/)).not.toBeInTheDocument()
  })

  it('filters by kind and shows an empty state', async () => {
    const fetchMock = mockApi({
      'GET /api/posts': (url) =>
        json({
          items: url.searchParams.get('kind') === 'event' ? [] : [post(1, 'news')],
          nextCursor: null,
        }),
    })
    renderWithProviders(<NewsTabs />)
    await screen.findByRole('heading', { name: 'Post title 1' })

    await userEvent.click(screen.getByRole('tab', { name: 'Events' }))

    expect(await screen.findByText('No events yet. Check back soon.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('kind=event'))).toBe(true)
  })

  it('loads the next page with the cursor', async () => {
    mockApi({
      'GET /api/posts': (url) =>
        url.searchParams.get('cursor') === 'page-2'
          ? json({ items: [post(2, 'update')], nextCursor: null })
          : json({ items: [post(1, 'news')], nextCursor: 'page-2' }),
    })
    renderWithProviders(<NewsTabs />)

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('heading', { name: 'Post title 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('shows an error with a working retry', async () => {
    let fail = true
    mockApi({
      'GET /api/posts': () =>
        fail
          ? apiError(500, 'internal', 'Boom')
          : json({ items: [post(1, 'news')], nextCursor: null }),
    })
    renderWithProviders(<NewsTabs />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load the latest posts.',
    )
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Post title 1' })).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys', async () => {
    mockApi({ 'GET /api/posts': () => json({ items: [], nextCursor: null }) })
    renderWithProviders(<NewsTabs />)

    screen.getByRole('tab', { name: 'All' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'News' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
  })
})
