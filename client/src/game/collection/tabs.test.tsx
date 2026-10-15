import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CollectionView } from '../../../../shared/src/schemas/collection'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { CollectionWindow } from '../wings'

const copy = (id: string, itemId: string, level: number, source: 'bag' | 'kennel' = 'bag') => ({
  id,
  source,
  itemId,
  nameKey: `lg_${itemId}`,
  level,
})
const OUTFIT_COPY = '00000000-0000-4000-8000-000000000001'
const PET_COPY = '00000000-0000-4000-8000-000000000002'
const GEAR_COPY = '00000000-0000-4000-8000-000000000003'
const milestone = { count: 5, bonus: [21, 21, 21] as [number, number, number], reached: false }

const view: CollectionView = {
  outfits: {
    level: 0,
    stats: [1, 2, 1],
    bonus: [0, 0, 0],
    rarities: [
      {
        id: 'gray',
        milestones: [milestone],
        entries: [
          { clothing: 3, stats: [1, 2, 1], collected: true, candidates: [] },
          {
            clothing: 9,
            stats: [3, 0, 1],
            collected: false,
            candidates: [copy(OUTFIT_COPY, 'i290109', 2)],
          },
          { clothing: 12, stats: [1, 2, 1], collected: false, candidates: [] },
        ],
      },
    ],
  },
  pets: {
    level: 0,
    stats: [0, 0, 0],
    bonus: [0, 0, 0],
    natures: [
      {
        nature: 1,
        milestones: [{ ...milestone, bonus: [20, 20, 20] }],
        entries: [
          {
            family: 'i320015',
            nameKey: 'lg_reborn_item_320015',
            avatar: 10050,
            stats: [1, 1, 1],
            collected: false,
            candidates: [copy(PET_COPY, 'i320015', 7, 'kennel')],
          },
        ],
      },
    ],
  },
  gear: {
    level: 0,
    stats: [0, 0, 0],
    bonus: [0, 0, 0],
    requiredLines: 4,
    piece: 1,
    complete: 3,
    tiers: [
      {
        label: 'Lv 1-30',
        milestones: [{ count: 1, bonus: [20, 20, 20], reached: false }],
        sets: [
          {
            id: 8160,
            pieces: [
              {
                slot: 'Hat',
                itemId: 'i281602',
                nameKey: 'lg_Equip_BuMao5',
                collected: false,
                candidates: [copy(GEAR_COPY, 'i281602', 2)],
              },
              {
                slot: 'Cloth',
                itemId: 'i281601',
                nameKey: 'lg_Equip_BuJia5',
                collected: false,
                candidates: [],
              },
            ],
          },
        ],
      },
    ],
  },
}

describe('Collection Avatars / Pets / Gear Sets', () => {
  it('shows outfit progress, filters and submits a spare outfit after confirming', async () => {
    const fetch = mockApi({
      'GET /api/game/wings': () => json({ collection: [], owned: [] }),
      'GET /api/game/collection': () => json(view),
      'POST /api/game/collection/submit': () => json(view),
    })
    renderWithProviders(<CollectionWindow onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Outfits' })
    expect(list.querySelectorAll('li')).toHaveLength(3)
    const progress = screen.getByRole('region', { name: 'Outfit Progress' })
    expect(within(progress).getByText('Total Collected').nextSibling).toHaveTextContent('1/3')
    expect(within(progress).getByText('Ready to Submit').nextSibling).toHaveTextContent('1')
    expect(screen.getByRole('region', { name: 'Set Unlocks' })).toHaveTextContent(
      '5 outfits+2.1% HP/ATK/SPD',
    )

    await userEvent.click(screen.getByRole('button', { name: 'READY' }))
    expect(list.querySelectorAll('li')).toHaveLength(1)
    await userEvent.click(within(list).getByRole('button'))
    const dialog = screen.getByRole('dialog', { name: 'Submit Outfit' })
    // The only copy is preselected; Submit asks first, Confirm sends.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))
    expect(dialog).toHaveTextContent('Are you sure you want to destroy this outfit?')
    expect(requestBody(fetch, 'POST /api/game/collection/submit')).toBeUndefined()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/collection/submit')).toEqual({
      kind: 'outfit',
      id: OUTFIT_COPY,
      source: 'bag',
    })
    expect(screen.queryByRole('dialog', { name: 'Submit Outfit' })).not.toBeInTheDocument()
  })

  it('submits a kennel pet and a gear piece from their tabs', async () => {
    const fetch = mockApi({
      'GET /api/game/wings': () => json({ collection: [], owned: [] }),
      'GET /api/game/collection': () => json(view),
      'POST /api/game/collection/submit': () => json(view),
    })
    renderWithProviders(<CollectionWindow onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Pets' }))
    const pets = await screen.findByRole('list', { name: 'Pets' })
    expect(screen.getByRole('button', { name: /Plant 0\/1/ })).toBeVisible()
    await userEvent.click(within(pets).getByRole('button'))
    const petDialog = screen.getByRole('dialog', { name: 'Submit Pet' })
    expect(within(petDialog).getByRole('button', { name: /Lv\. 7 \(Kennel\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(petDialog).getByRole('button', { name: 'Submit' }))
    await userEvent.click(within(petDialog).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/collection/submit')).toEqual({
      kind: 'pet',
      id: PET_COPY,
      source: 'kennel',
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Gear Sets' }))
    const sets = await screen.findByRole('list', { name: 'Gear Sets' })
    expect(screen.getByText('Pieces need 4 refine lines (top tier)')).toBeVisible()
    await userEvent.click(within(sets).getAllByRole('button')[1]!)
    const empty = screen.getByRole('dialog', { name: 'Submit Gear' })
    expect(empty).toHaveTextContent('refined to 4 lines, unlocked and without gems')
    expect(within(empty).getByRole('button', { name: 'Submit' })).toBeDisabled()
    await userEvent.click(within(empty).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(within(sets).getAllByRole('button')[0]!)
    const gear = screen.getByRole('dialog', { name: 'Submit Gear' })
    await userEvent.click(within(gear).getByRole('button', { name: 'Submit' }))
    await userEvent.click(within(gear).getByRole('button', { name: 'Confirm' }))
    expect(
      fetch.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init!.body))),
    ).toContainEqual({ kind: 'gear', id: GEAR_COPY, source: 'bag' })
  })
})
