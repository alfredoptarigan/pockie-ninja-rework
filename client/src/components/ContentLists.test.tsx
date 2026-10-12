import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { FaqAccordion } from './FaqAccordion'
import { LoreList } from './LoreList'

describe('LoreList', () => {
  it('renders chapters in the order the API returns', async () => {
    mockApi({
      'GET /api/lore': () =>
        json({
          items: [
            { id: 'a', position: 1, title: 'The Five Seals', body: 'Long ago...' },
            { id: 'b', position: 2, title: 'The Fire Village', body: 'Every journey...' },
          ],
        }),
    })
    renderWithProviders(<LoreList />)

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'Chapter 1: The Five Seals',
      'Chapter 2: The Fire Village',
    ])
  })

  it('shows an empty state', async () => {
    mockApi({ 'GET /api/lore': () => json({ items: [] }) })
    renderWithProviders(<LoreList />)
    expect(await screen.findByText('The story is still being written.')).toBeInTheDocument()
  })
})

describe('FaqAccordion', () => {
  it('reveals an answer when its question is opened', async () => {
    mockApi({
      'GET /api/faq': () =>
        json({ items: [{ id: 'q', position: 1, question: 'Is it free?', answer: 'Yes.' }] }),
    })
    renderWithProviders(<FaqAccordion />)

    const question = await screen.findByText('Is it free?')
    expect(screen.getByText('Yes.')).not.toBeVisible()
    await userEvent.click(question)
    expect(screen.getByText('Yes.')).toBeVisible()
  })

  it('shows an error state', async () => {
    mockApi({ 'GET /api/faq': () => apiError(500, 'internal', 'Boom') })
    renderWithProviders(<FaqAccordion />)
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the questions.')
  })

  it('shows an empty state', async () => {
    mockApi({ 'GET /api/faq': () => json({ items: [] }) })
    renderWithProviders(<FaqAccordion />)
    expect(await screen.findByText('No questions yet.')).toBeInTheDocument()
  })
})
