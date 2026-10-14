import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { digestCountdown, fits, KennelWindow, petIcon, PetSlot } from './index'

const pet = (extra: object = {}) => ({
  id: 'pet-1',
  species: 'i320002',
  nameKey: 'lg_reborn_item_320002',
  avatar: 10050,
  nature: 2,
  foodType: 2,
  kennelSlot: 0,
  active: false,
  level: 12,
  exp: 40,
  expToNext: 300,
  growth: 120,
  totals: { attack: 170, defence: 97, disturb: 121, active: 121, savvy: 97 },
  appetite: 7200,
  appetiteMax: 7200,
  digestEndsAt: null,
  foodSlots: Array.from({ length: 6 }, () => ({ type: 1, mul: 0, item: null })),
  skills: [
    { skillId: 40043, nameKey: 'lg_Skill_40043', kind: 3, slot: 0, level: 1, locked: false },
  ],
  slots: [0, 0, 2],
  slotCap: 9,
  nextSlotCost: 1,
  nextLockCost: 1,
  evolvesTo: [{ species: 'i320071', nameKey: 'lg_reborn_item_320071' }],
  ...extra,
})
const view = (pets = [pet()]) => ({
  pets,
  petSlots: 2,
  maxSlots: 5,
  slotPrice: 100,
  digestPrice: 8,
  evolve: { level: 30, feathers: 50 },
  feathers: 3,
  lockItem: { itemId: 'i150406', nameKey: 'lg_x', count: 1 },
  removeItem: { itemId: 'i152027', nameKey: 'lg_y', count: 0 },
  foods: [{ itemId: 'i170117', nameKey: 'lg_cropitem_017', count: 2, type: 3, hunger: 80 }],
  books: [],
})

describe('KennelWindow', () => {
  it('shows the pet card with nature, props, slots and skills', async () => {
    mockApi({ 'GET /api/game/pets': () => json(view()) })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    const card = await screen.findByRole('region', { name: 'Baby Vulture' })
    expect(card).toHaveTextContent('Nature: Beast')
    expect(card).toHaveTextContent('Attack:170')
    expect(within(card).getByRole('group', { name: 'Passive skills' })).toHaveTextContent(
      'Empty slot',
    )
    expect(screen.getByRole('button', { name: 'Unlock slot (100 Gold)' })).toBeInTheDocument()
    // Level 12 of 30 and 3 of 50 Feathers.
    expect(within(card).getByRole('button', { name: 'Scavenging Vulture' })).toBeDisabled()
  })

  it('learns a skill of a kind and sets the pet active', async () => {
    // The server state after each action (the window refetches after applying a result).
    let state = view()
    const fetchMock = mockApi({
      'GET /api/game/pets': () => json(state),
      'POST /api/game/pets/pet-1/skills/learn': () => json({ ...state, character }),
      'POST /api/game/pets/pet-1/active': () => {
        state = view([pet({ active: true })])
        return json({ ...state, character })
      },
    })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    const pass = await screen.findByRole('group', { name: 'Passive skills' })
    await userEvent.click(within(pass).getByRole('button', { name: 'Learn' }))
    expect(requestBody(fetchMock, 'POST /api/game/pets/pet-1/skills/learn')).toEqual({ kind: 3 })
    await userEvent.click(screen.getByRole('button', { name: 'Set active' }))
    expect(await screen.findByRole('button', { name: 'Rest' })).toBeInTheDocument()
  })

  it('feeds the chosen foods and shows the digest timer', async () => {
    const digesting = pet({
      appetite: 0,
      digestEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    let state = view([pet({ appetite: 0 })])
    const fetchMock = mockApi({
      'GET /api/game/pets': () => json(state),
      'POST /api/game/pets/pet-1/feed': () => {
        state = view([digesting])
        return json({ ...state, character })
      },
    })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    await userEvent.selectOptions(await screen.findByLabelText('Food slot 1'), 'i170117')
    await userEvent.click(screen.getByRole('button', { name: 'Feed' }))
    expect(requestBody(fetchMock, 'POST /api/game/pets/pet-1/feed')).toEqual({
      foods: ['i170117', null, null, null, null, null],
    })
    expect(await screen.findByRole('timer')).toHaveTextContent(
      /Digesting: (1:00:00|0:59:\d\d) left/,
    )
    expect(screen.getByRole('button', { name: 'Finish now (8 Gold)' })).toBeInTheDocument()
  })

  it('shows an empty kennel', async () => {
    mockApi({ 'GET /api/game/pets': () => json(view([])) })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    expect(await screen.findByText(/Your kennel is empty/)).toBeInTheDocument()
  })
})

describe('PetSlot', () => {
  it('shows the active pet icon', async () => {
    mockApi({ 'GET /api/game/pets': () => json(view([pet({ active: true })])) })
    const { container } = renderWithProviders(<PetSlot />)
    expect(await screen.findByText('Pet: Baby Vulture, level 12')).toBeInTheDocument()
    expect(container.querySelector(`img[src="${petIcon(10050)}"]`)).not.toBeNull()
  })
})

describe('helpers', () => {
  it('formats the countdown and matches food types', () => {
    expect(digestCountdown(new Date(7_200_000).toISOString(), 0)).toBe('2:00:00')
    expect(fits(1, 3)).toBe(true)
    expect(fits(2, 1)).toBe(true)
    expect(fits(2, 3)).toBe(false)
    expect(petIcon(10052)).toMatch(/pets\/10052\.webp$/)
  })
})
