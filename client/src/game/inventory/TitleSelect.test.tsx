import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { timeLeft, titleStatText, TitleSelect } from './TitleSelect'

const titles = [
  {
    titleId: 10,
    nameKey: 'lg_EffortTitle10',
    active: true,
    expiresAt: null,
    stats: [{ name: 'AtkTimeMulEquip', value: 40 }],
  },
  {
    titleId: 1,
    nameKey: 'lg_EffortTitle01',
    active: false,
    expiresAt: null,
    stats: [{ name: 'StrengthEquip', value: 1300 }],
  },
]

async function renderTitles(handlers: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /api/game/buffs': () => json({ buffs: [], titles }),
    ...handlers,
  })
  renderWithProviders(<TitleSelect />)
  const select = await screen.findByRole('combobox', { name: 'Title' })
  await waitFor(() => expect(select).toHaveValue('10'))
  return { fetchMock, select }
}

describe('TitleSelect (Reborn title plate)', () => {
  it('draws the equipped title art and equips another title from the select', async () => {
    const { fetchMock, select } = await renderTitles({
      'POST /api/game/titles/activate': () => json({ character, buffs: [], titles }),
    })
    expect(document.querySelector('img')).toHaveAttribute('src', '/assets/reborn/titles/10.webp')
    // Reborn lists the unlocked titles, and every character has unlocked title 0, "No Title".
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No Title',
      'Come Come Paradise',
      'Beginner Ninja',
    ])
    await userEvent.selectOptions(select, '1')
    await waitFor(() =>
      expect(requestBody(fetchMock, 'POST /api/game/titles/activate')).toEqual({ titleId: 1 }),
    )
  })

  it('shows title 0, No Title, on the plate when no title is equipped', async () => {
    mockApi({
      'GET /api/game/buffs': () =>
        json({ buffs: [], titles: titles.map((title) => ({ ...title, active: false })) }),
    })
    renderWithProviders(<TitleSelect />)
    expect(await screen.findByRole('combobox', { name: 'Title' })).toHaveValue('0')
    expect(document.querySelector('img')).toHaveAttribute('src', '/assets/reborn/titles/0.webp')
    expect(screen.getByText('Equipped title: No Title')).toBeInTheDocument()
  })

  it('lists the equipped title stats on hover', async () => {
    const { select } = await renderTitles()
    await userEvent.hover(select)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Speed +4%')
  })

  it('falls back to the title name when Reborn has no art for it', async () => {
    await renderTitles()
    fireEvent.error(document.querySelector('img')!)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Come Come Paradise', { selector: 'span' })).toBeVisible()
  })
})

describe('title stat lines and countdown', () => {
  it('prints stats like Reborn', () => {
    expect(titleStatText({ name: 'StrengthEquip', value: 1300 })).toBe('Strength +13')
    expect(titleStatText({ name: 'AtkTimeMulEquip', value: 45 })).toBe('Speed +4.5%')
    expect(titleStatText({ name: 'CapMulEquip', value: 5 })).toBe('Stone Bonus +5')
  })

  it('counts down days, hours and minutes', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(timeLeft('2030-01-03T03:04:00Z', now)).toBe('2d 3h 4m')
    expect(timeLeft('2030-01-01T03:04:30Z', now)).toBe('3h 4m')
    expect(timeLeft('2029-12-31T00:00:00Z', now)).toBe('Expired')
  })
})
