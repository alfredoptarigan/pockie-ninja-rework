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

describe('KennelWindow (Kennel)', () => {
  it('shows the storage column, the pet slot, the info box and the AURA / AID / PSV rows', async () => {
    mockApi({ 'GET /api/game/pets': () => json(view()) })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    const storage = await screen.findByRole('list', { name: 'Storage' })
    expect(within(storage).getAllByRole('listitem')).toHaveLength(4)
    expect(within(storage).getByRole('button', { name: 'Baby Vulture' })).toBeVisible()
    expect(within(storage).getByRole('button', { name: 'Unlock slot (100 Gold)' })).toBeVisible()
    expect(screen.getByText('1/2')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Baby Vulture Lv. 12')
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
    expect(screen.getByText('Growth: 40/300')).toBeVisible()
    expect(screen.getByText('Skill Locks: 1')).toBeVisible()
    const passive = screen.getByRole('group', { name: 'Passive skills' })
    expect(within(passive).getAllByRole('listitem')).toHaveLength(6)
    expect(within(passive).getByText('Empty')).toBeVisible()
    expect(within(passive).getByRole('button', { name: 'Add slot (1 Stone)' })).toBeVisible()
    await userEvent.hover(screen.getByRole('button', { name: 'Pet: Baby Vulture' }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Nature: Beast')
    expect(tooltip).toHaveTextContent('Attack: 170')
  })

  it('discovers a skill of a row and sets the pet active from the pet slot menu', async () => {
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
    const passive = await screen.findByRole('group', { name: 'Passive skills' })
    await userEvent.click(within(passive).getByRole('button', { name: 'Discover' }))
    expect(requestBody(fetchMock, 'POST /api/game/pets/pet-1/skills/learn')).toEqual({ kind: 3 })
    await userEvent.click(screen.getByRole('button', { name: 'Pet: Baby Vulture' }))
    const menu = screen.getByRole('menu')
    // Level 12 of 30 and 3 of 50 Feathers.
    expect(
      within(menu).getByRole('menuitem', { name: 'Evolve into Scavenging Vulture' }),
    ).toBeDisabled()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Set active' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Pet: Baby Vulture (active)' }))
    expect(screen.getByRole('menuitem', { name: 'Rest' })).toBeVisible()
  })

  it('locks a skill from its menu', async () => {
    const fetchMock = mockApi({
      'GET /api/game/pets': () => json(view()),
      'POST /api/game/pets/pet-1/skills/40043/lock': () => json({ ...view(), character }),
    })
    renderWithProviders(<KennelWindow onClose={vi.fn()} />)
    const passive = await screen.findByRole('group', { name: 'Passive skills' })
    await userEvent.click(within(passive).getAllByRole('button')[0]!)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lock (1 lock)' }))
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/pets/pet-1/skills/40043/lock') && init?.method === 'POST',
      ),
    ).toBe(true)
  })

  it('puts foods in the slots, feeds and shows digestion', async () => {
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
    await userEvent.click(await screen.findByRole('button', { name: 'Food slot 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /\(\+80\) x2$/ }))
    expect(screen.getByText('+ 80')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Feed' }))
    expect(requestBody(fetchMock, 'POST /api/game/pets/pet-1/feed')).toEqual({
      foods: ['i170117', null, null, null, null, null],
    })
    expect(await screen.findByRole('timer')).toHaveTextContent(/^(1:00:00|0:59:\d\d)$/)
    await userEvent.click(screen.getByRole('button', { name: 'Digestion' }))
    expect(screen.getByRole('menuitem', { name: 'Finish now (8 Gold)' })).toBeVisible()
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
