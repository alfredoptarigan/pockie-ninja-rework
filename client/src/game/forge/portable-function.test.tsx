// Portable Function tabs: Synthesis, Recast and Impress over mocked /api/game/portable-function.
import type { GearView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, outfitStats } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ToastHost } from '../toast'
import type { InventoryItem } from '../types'
import { PortableFunctionWindow } from './PortableFunction'

const row = (n: number, itemId: string, nameKey: string, extra: Partial<InventoryItem> = {}) => ({
  id: `00000000-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`,
  itemId,
  nameKey,
  count: 1,
  bound: false,
  equippedSlot: null,
  ...extra,
})
const outfitInfo = (plus: number) => ({
  kind: 'equip' as const,
  equipSlot: 'Outfit',
  level: 0,
  sellPrice: null,
  stack: 1,
  w: 2,
  h: 2,
  class: 'AvatarItem',
  outfit: { ...outfitStats, clothing: 1, plus },
})
const other = (itemClass: string, stack = 1) => ({
  kind: 'other' as const,
  level: 0,
  sellPrice: null,
  stack,
  w: 1,
  h: 1,
  class: itemClass,
})
const outfits = [1, 2, 3].map((n) => row(n, 'i290001', 'lg_avatar1', { info: outfitInfo(1) }))
const weapon = row(4, 'i250101', 'lg_Equip_Blunt1', { info: { ...other('EquipItem'), w: 2, h: 3 } })
const blade = row(5, 'i350001', 'lg_Impressitem1_itemname', { info: other('ImpressItem') })
const crystals = row(6, 'i350101', 'lg_Impressrateitem1_itemname', {
  count: 6,
  info: other('ImpressRateItem', 100),
})
const weaponGear: GearView = {
  baseType: 1,
  enhanceLevel: 0,
  enhanceMax: 12,
  inscribeLevel: 0,
  durability: 100,
  maxDurability: 100,
  appraised: true,
  identifyCount: 1,
  props: [{ propId: 1, name: 'StrengthEquip', value: 3000, min: 2800, max: 3400, tier: 1 }],
  level: 1,
  equipType: 'Weapon',
  weaponType: 'Blunt',
  special: [],
  attack: { min: 14, max: 16 },
  defense: 0,
  maxHp: 0,
  enhanceAttack: { min: 0, max: 0 },
  inscription: [],
  sockets: [],
  maxSockets: 3,
  appraiseCost: 12,
  repairCost: 0,
}

const portableApi = (extra: Record<string, () => Response> = {}) =>
  mockApi({
    'GET /api/game/character': () => json({ character }),
    'GET /api/game/inventory': () => json({ items: [...outfits, weapon, blade, crystals] }),
    'GET /api/game/forge/gear': () => json({ gear: { [weapon.id]: weaponGear } }),
    ...extra,
  })

const open = () =>
  renderWithProviders(
    <>
      <PortableFunctionWindow onClose={() => {}} />
      <ToastHost />
    </>,
  )

describe('Synthesis tab', () => {
  it('fills the slots from the bag, previews the recipe and creates it', async () => {
    const fetchMock = portableApi({
      'POST /api/game/portable-function/synthesis/preview': () =>
        json({
          kind: 'recipe',
          resultItemId: 'i290101',
          resultNameKey: 'lg_avatar101',
          resultInfo: outfitInfo(2),
          rate: 100,
        }),
      'POST /api/game/portable-function/synthesis': () =>
        json({
          success: true,
          resultItemId: 'i290101',
          resultNameKey: 'lg_avatar101',
          character,
        }),
    })
    open()

    const picker = await screen.findByRole('list', { name: 'Items to synthesize' })
    const pick = within(picker).getAllByRole('button', { name: 'Ichigo Kurosaki +1' })
    for (const button of pick) await userEvent.click(button)

    expect(await screen.findByText('Ichigo Kurosaki +2')).toBeVisible()
    expect(screen.getByText('100%')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/portable-function/synthesis/preview')).toEqual({
      mainId: outfits[0]!.id,
      catalystIds: [outfits[1]!.id, outfits[2]!.id],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Synthesized Ichigo Kurosaki +2.')
    expect(screen.queryByRole('button', { name: /^Take .* out of Main Item$/ })).toBeNull()
  })

  it("shows a star Synthesis like Reborn: the outfit's name and its new stars", async () => {
    portableApi({
      'POST /api/game/portable-function/synthesis/preview': () =>
        json({
          kind: 'star',
          resultItemId: 'i290001',
          resultNameKey: 'lg_avatar1',
          resultInfo: { ...outfitInfo(1), outfit: { ...outfitInfo(1).outfit, stars: 2 } },
          rate: 100,
          stars: 2,
        }),
    })
    open()
    const picker = await screen.findByRole('list', { name: 'Items to synthesize' })
    for (const button of within(picker).getAllByRole('button', { name: 'Ichigo Kurosaki +1' }))
      await userEvent.click(button)

    expect(await screen.findByText('Ichigo Kurosaki +1 ★★')).toBeVisible()
    expect(screen.getByText(/gains one guaranteed star, up to 5/)).toBeVisible()
  })

  it('shows the server refusal in red and keeps Create disabled', async () => {
    portableApi({
      'POST /api/game/portable-function/synthesis/preview': () =>
        json(
          { error: { code: 'socketed', message: 'Remove the gems from that item first.' } },
          400,
        ),
    })
    open()
    const picker = await screen.findByRole('list', { name: 'Items to synthesize' })
    await userEvent.click(within(picker).getByRole('button', { name: 'Dogsmasher' }))
    for (const button of within(picker)
      .getAllByRole('button', { name: 'Ichigo Kurosaki +1' })
      .slice(0, 2))
      await userEvent.click(button)

    expect(await screen.findByText('Remove the gems from that item first.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })
})

describe('Recast tab', () => {
  it('locks a stat, shows the cost and rerolls', async () => {
    const outfit = outfits[0]!
    const fetchMock = portableApi({
      [`GET /api/game/portable-function/recast/${outfit.id}`]: () =>
        json({
          isv: [120, 136, 150],
          base: [120, 120, 120],
          max: [150, 150, 150],
          talismans: 5,
          canRecast: true,
        }),
      'POST /api/game/portable-function/recast': () =>
        json({ isv: [120, 140, 150], character, item: outfit }),
    })
    open()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recast' }))
    const picker = await screen.findByRole('list', { name: 'Outfits' })
    await userEvent.click(within(picker).getAllByRole('button', { name: 'Ichigo Kurosaki +1' })[0]!)

    const values = await screen.findByRole('list', { name: 'Individual Stat Values' })
    expect(values).toHaveTextContent('Strength: 1.2/1.5')
    expect(values).toHaveTextContent('Stamina: 1.5/1.5')
    expect(screen.getByText(/Recast Cost: 1 Recast Talisman \(you have 5\)/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Lock Strength' }))
    expect(screen.getByText(/Recast Cost: 5 Recast Talismans/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Lock Agility' }))
    // Two locks cost 15: more than the 5 owned.
    expect(screen.getByRole('button', { name: 'Attempt' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Lock Agility' }))
    await userEvent.click(screen.getByRole('button', { name: 'Attempt' }))

    expect(await screen.findByText('Recast complete!')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/portable-function/recast')).toEqual({
      itemId: outfit.id,
      locked: [0],
    })
  })
})

describe('Impress tab', () => {
  it('previews the rate with blade and crystals, then impresses', async () => {
    const fetchMock = portableApi({
      'POST /api/game/portable-function/impress/preview': () =>
        json({ rate: 100, crystalsUsed: 5 }),
      'POST /api/game/portable-function/impress': () =>
        json({ success: true, character, item: { ...weapon, gear: weaponGear } }),
    })
    open()
    await userEvent.click(await screen.findByRole('tab', { name: 'Impress' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dogsmasher' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Blade' }), blade.id)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Crystals' }), crystals.id)

    expect(await screen.findByText('Rate: 100%')).toBeVisible()
    expect(screen.getByText('Uses 5 crystals.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Attempt' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Impress succeeded')
    expect(requestBody(fetchMock, 'POST /api/game/portable-function/impress')).toEqual({
      itemId: weapon.id,
      bladeId: blade.id,
      crystalId: crystals.id,
    })
  })
})
