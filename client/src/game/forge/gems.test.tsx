// Reborn's Armory gem and enchantment tabs, and the gear tooltip's SOCKETED GEMS / ENCHANTMENTS.
import type { GearView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, fists, potion } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ItemTooltip } from '../ItemTooltip'
import type { InventoryItem } from '../types'
import { ForgeWindow } from './ForgeWindow'

// i220103: a level 23 helmet with 2 gem slots.
const helmet: InventoryItem = {
  ...fists,
  id: '00000000-0000-7000-8000-000000000020',
  itemId: 'i220103',
  nameKey: 'lg_Equip_PiKui2',
  bound: false,
  info: { ...fists.info!, equipSlot: 'Hat', level: 23 },
}
const ruby = {
  itemId: 'i110101',
  nameKey: 'lg_Gem121_itemname',
  name: 'StrengthEquip',
  value: 1400,
}

const helmetGear: GearView = {
  baseType: 2,
  enhanceLevel: 0,
  enhanceMax: 12,
  inscribeLevel: 0,
  durability: 100,
  maxDurability: 100,
  appraised: true,
  identifyCount: 0,
  props: [],
  level: 23,
  equipType: 'Hat',
  special: [],
  attack: { min: 0, max: 0 },
  defense: 40,
  maxHp: 0,
  enhanceAttack: { min: 0, max: 0 },
  inscription: [],
  sockets: [ruby, null],
  maxSockets: 2,
  enchant: {
    itemId: 'i412102',
    nameKey: 'lg_MagicStone_Defence1_2102',
    lines: [
      { name: 'ParryMulEquip', value: 13 },
      { name: 'DodgeMulEquip', value: 6 },
    ],
  },
  appraiseCost: 15,
  repairCost: 0,
}

// Level 21 Helm/Wrist Enchantment Stone I: Block +16.
const stone: InventoryItem = {
  ...potion,
  id: '00000000-0000-7000-8000-000000000021',
  itemId: 'i412101',
  count: 1,
  nameKey: 'lg_MagicStone_Defence1_2101',
  slot: 8,
  info: {
    kind: 'other',
    level: 0,
    sellPrice: 50,
    stack: 1,
    w: 1,
    h: 1,
    class: 'MagicItem',
    enchant: { lines: [{ name: 'ParryMulEquip', value: 16 }], slots: ['Hat', 'Glove'], level: 21 },
  },
}
const talisman: InventoryItem = {
  ...potion,
  id: '00000000-0000-7000-8000-000000000022',
  itemId: 'i161040',
  count: 2,
  nameKey: 'lg_Debris348_itemname',
  slot: 9,
  info: {
    kind: 'other',
    level: 0,
    sellPrice: null,
    stack: 999,
    w: 1,
    h: 1,
    class: 'FreeTimesItem',
  },
}

const armory = (extra: Record<string, () => Response> = {}) =>
  mockApi({
    'GET /api/game/character': () => json({ character }),
    'GET /api/game/inventory': () => json({ items: [helmet, stone, talisman] }),
    'GET /api/game/forge/gear': () => json({ gear: { [helmet.id]: helmetGear } }),
    'GET /api/game/forge': () =>
      json({
        enhanceCost: 8,
        refineCost: 8,
        enhanceRates: { '1': 100 },
        inscribeLevels: {},
        sealOdds: { low: 3, high: 6 },
        talismans: { enhance: 0, refine: 0, lowSeal: 0, highSeal: 0 },
      }),
    ...extra,
  })

async function openTab(name: string) {
  renderWithProviders(<ForgeWindow onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('tab', { name }))
  const panel = screen.getByRole('tabpanel', { name })
  await userEvent.click(await within(panel).findByRole('button', { name: 'Light Leather Hat' }))
  return panel
}

describe('Armory gem and enchantment tabs', () => {
  it('compares the enchantment with the stone, then enchants after the confirm', async () => {
    const fetchMock = armory({ 'POST /api/game/forge/enchant': () => json({ character }) })
    const panel = await openTab('Enchantment')
    const info = within(panel).getByRole('list', { name: 'Enchantment Info' })
    expect(info).toHaveTextContent('Block: +13')

    await userEvent.selectOptions(
      within(panel).getByRole('combobox', { name: 'Enchanting Stone' }),
      stone.id,
    )
    expect(within(info).getByLabelText('higher')).toHaveTextContent('▲')
    expect(within(info).getByLabelText('lost')).toHaveTextContent('▼')
    await userEvent.click(within(panel).getByRole('button', { name: 'Attempt' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Enchantment' })).getByRole('button', {
        name: 'Accept',
      }),
    )

    expect(await within(panel).findByRole('status')).toHaveTextContent('Enchantment applied.')
    expect(requestBody(fetchMock, 'POST /api/game/forge/enchant')).toEqual({
      itemId: helmet.id,
      stoneId: stone.id,
    })
  })

  it('creates a gem slot with a Slot Talisman', async () => {
    const fetchMock = armory({ 'POST /api/game/forge/gems/hole': () => json({ character }) })
    const panel = await openTab('Create Hole')
    expect(panel).toHaveTextContent('2 / 2')
    await userEvent.selectOptions(
      within(panel).getByRole('combobox', { name: 'Talisman' }),
      'i161040',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Attempt' }))
    const confirm = screen.getByRole('dialog', { name: 'Create Hole' })
    expect(confirm).toHaveTextContent('Create Gem Slot for Light Leather Hat?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/forge/gems/hole')).toEqual({
      itemId: helmet.id,
      talisman: 'i161040',
    })
  })

  it('removes every gem of the chosen gear', async () => {
    const fetchMock = armory({ 'POST /api/game/forge/gems/remove': () => json({ character }) })
    const panel = await openTab('Remove')
    expect(panel).toHaveTextContent('Ruby Level 1')
    expect(panel).toHaveTextContent('Open Socket')
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove Gems' }))
    expect(await within(panel).findByRole('status')).toHaveTextContent(
      'The gems are back in your bag.',
    )
    expect(requestBody(fetchMock, 'POST /api/game/forge/gems/remove')).toEqual({
      itemId: helmet.id,
    })
  })
})

describe('ItemTooltip gems and enchantments', () => {
  it('lists the sockets, then the set, then the enchantments of armour', () => {
    renderWithProviders(
      <ItemTooltip entry={{ item: helmet, gear: helmetGear }} at={{ x: 0, y: 0 }} />,
    )
    const tip = screen.getByRole('tooltip')
    const text = tip.textContent ?? ''
    expect(text.indexOf('Socketed Gems')).toBeLessThan(text.indexOf('Enchantments'))
    expect(within(tip).getByRole('list', { name: 'Socketed Gems' })).toHaveTextContent(
      'Strength+14Open Socket',
    )
    expect(tip).toHaveTextContent('EnchantmentsBlock+13Dodge+6')
  })

  it('marks enchant lines against the worn item', () => {
    const worn = {
      item: { ...helmet, id: 'worn' },
      gear: { ...helmetGear, enchant: { ...helmetGear.enchant!, lines: [] } },
    }
    renderWithProviders(
      <ItemTooltip entry={{ item: helmet, gear: helmetGear }} worn={worn} at={{ x: 0, y: 0 }} />,
    )
    // Lines the worn item lacks are new (blue ●) in the bag item's panel.
    expect(screen.getByRole('tooltip')).toHaveTextContent('Block+13●')
  })
})
