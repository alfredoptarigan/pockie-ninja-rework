import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { InventoryItem } from '../types'
import { Reroll } from './Reroll'

const pet: InventoryItem = {
  id: '00000000-0000-7000-8000-0000000000a1',
  itemId: 'i320002',
  count: 1,
  bound: false,
  equippedSlot: null,
  nameKey: 'lg_reborn_item_320002',
  page: 0,
  slot: 0,
  locked: false,
  info: { kind: 'use', level: 1, sellPrice: null, stack: 1, w: 2, h: 2, class: 'PetItem' },
}
const outcome = (itemId: string, hit: boolean) => ({
  character: { ...character, stone: 10_000 },
  items: [{ ...pet, itemId }],
  reroll: { itemId, rolls: 1, spent: 1500, hit },
})

function renderReroll(results: ReturnType<typeof outcome>[]) {
  let call = 0
  const fetch = mockApi({
    'POST /api/game/pet-reroll': () => json(results[Math.min(call++, results.length - 1)]),
  })
  const onStored = vi.fn()
  const view = renderWithProviders(
    <Reroll held={pet} items={[pet]} stones={20_000} onStored={onStored} onClose={() => {}} />,
  )
  return { fetch, onStored, view }
}

async function setUp() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Item: put a pet here' }))
  await user.click(screen.getByRole('button', { name: 'Target: choose a pet' }))
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await user.click(screen.getAllByRole('button', { name: /^Target [^:]/ })[0]!)
  return user
}

afterEach(() => vi.restoreAllMocks())

describe('Reroll', () => {
  it('needs a pet and a target before Reroll', async () => {
    const { onStored } = renderReroll([outcome('i320003', false)])
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeDisabled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Item: put a pet here' }))
    expect(onStored).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Target: choose a pet' }))
    expect(screen.getAllByRole('button', { name: /^Target [^:]/ })).toHaveLength(8)
  })

  it('sends the pet, the target and Max Stones', async () => {
    const { fetch } = renderReroll([outcome('i320003', false)])
    const user = await setUp()
    await user.click(screen.getByRole('button', { name: 'Reroll' }))
    await waitFor(() =>
      expect(requestBody(fetch, 'POST /api/game/pet-reroll')).toMatchObject({
        inventoryId: pet.id,
        maxStones: 1500,
      }),
    )
    expect(requestBody(fetch, 'POST /api/game/pet-reroll').target).toMatch(/^i3200\d\d$/)
  })

  it('Auto Reroll presses until the target', async () => {
    const { fetch } = renderReroll([outcome('i320003', false), outcome('i320033', true)])
    const user = await setUp()
    await user.click(screen.getByRole('button', { name: 'Auto Reroll' }))
    await waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => String(url).includes('pet-reroll'))).toHaveLength(
        2,
      ),
    )
    expect(await screen.findByRole('button', { name: 'Auto Reroll' })).toBeEnabled()
  })
})
