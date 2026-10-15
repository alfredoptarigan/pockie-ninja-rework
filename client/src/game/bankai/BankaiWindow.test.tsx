import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  BankaiCrystal,
  BankaiView,
  BankaiWeaponView,
} from '../../../../shared/src/schemas/bankai'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { BankaiWindow } from './index'

const gem = (id: string, extra: Partial<BankaiCrystal> = {}): BankaiCrystal => ({
  id,
  quality: 'green',
  name: 'Sky Rift',
  label: 'Strength',
  value: 4,
  level: 1,
  maxLevel: 10,
  exp: 0,
  xpNeeded: 300,
  foodXp: 25,
  price: 1,
  ...extra,
})
const ID_A = '00000000-0000-4000-8000-00000000000a'
const ID_B = '00000000-0000-4000-8000-00000000000b'

const weapon = (name: BankaiWeaponView['weapon'], extra: Partial<BankaiWeaponView> = {}) =>
  ({
    weapon: name,
    name: { zangetsu: 'Zangetsu', senbonzakura: 'Senbonzakura', iceRing: 'Ice Ring' }[name],
    level: 0,
    maxLevel: 15,
    exp: 0,
    required: 0,
    form: 0,
    forms: 0,
    unlockable: false,
    requirement: name === 'zangetsu' ? 'Character Level 40' : 'Zangetsu Level 10',
    stats: [
      {
        stat: 'strength',
        label: 'Strength',
        counterpart: 'Stamina',
        value: 0,
        percent: false,
        swappable: true,
        swapped: false,
      },
    ],
    ring: Array(8).fill(null),
    ringSlotLevels: [1, 2, 3, 4, 5, 6, 8, 10],
    soulCrystal: [],
    ...extra,
  }) satisfies BankaiWeaponView

const inventory = (cells: Record<number, BankaiCrystal>) =>
  Array.from({ length: 80 }, (_, i) => cells[i] ?? null)

const view = (extra: Partial<BankaiView> = {}): BankaiView => ({
  expPool: 0,
  coins: 0,
  activeWeapon: null,
  weapons: [weapon('zangetsu'), weapon('senbonzakura'), weapon('iceRing')],
  inventory: inventory({}),
  lockedSlots: Array.from({ length: 72 }, (_, i) => i + 8),
  forgeNpcs: [{ name: 'Konan', cost: 50 }],
  ...extra,
})

const unlocked = (extra: Partial<BankaiWeaponView> = {}) =>
  weapon('zangetsu', { level: 1, required: 3000, form: 1, forms: 1, ...extra })

const open = () => {
  renderWithProviders(<BankaiWindow onClose={vi.fn()} />)
  return screen.findByRole('dialog', { name: 'Bankai' })
}

describe('BankaiWindow', () => {
  it('shows the requirement of a locked weapon and unlocks an unlockable one', async () => {
    const fetch = mockApi({
      'GET /api/game/bankai': () =>
        json(view({ weapons: [weapon('zangetsu', { unlockable: true }), weapon('iceRing')] })),
      'POST /api/game/bankai/unlock': () => json(view({ weapons: [unlocked()] })),
    })
    const window = await open()
    expect(await within(window).findByText('Locked')).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Ice Ring' }))
    expect(
      within(window).getByText('Ice Ring is locked. Requires Zangetsu Level 10 to unlock.'),
    ).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Unlock' }))
    expect(requestBody(fetch, 'POST /api/game/bankai/unlock')).toEqual({ weapon: 'zangetsu' })
    expect(await within(window).findByText('Lv.1 Zangetsu')).toBeVisible()
  })

  it('upgrades from the EXP pool and swaps a stat', async () => {
    const fetch = mockApi({
      'GET /api/game/bankai': () => json(view({ expPool: 5000, weapons: [unlocked()] })),
      'POST /api/game/bankai/upgrade': () =>
        json(view({ expPool: 2000, weapons: [unlocked({ level: 2, required: 4500 })] })),
      'POST /api/game/bankai/stat-swap': () => json(view({ weapons: [unlocked()] })),
    })
    const window = await open()
    expect(await within(window).findByText('0 / 3,000')).toBeVisible()
    expect(within(window).getByText('EXP Pool: 5,000')).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Upgrade' }))
    expect(requestBody(fetch, 'POST /api/game/bankai/upgrade')).toEqual({ weapon: 'zangetsu' })
    expect(await within(window).findByText('EXP Pool: 2,000')).toBeVisible()
    await userEvent.click(
      within(window).getByRole('button', { name: 'Switch Strength to Stamina (same value)' }),
    )
    expect(requestBody(fetch, 'POST /api/game/bankai/stat-swap')).toEqual({ stat: 'strength' })
  })

  it('moves a held crystal into an open ring slot', async () => {
    const fetch = mockApi({
      'GET /api/game/bankai': () =>
        json(view({ weapons: [unlocked()], inventory: inventory({ 2: gem(ID_A) }) })),
      'POST /api/game/bankai/crystals/move': () => json(view({ weapons: [unlocked()] })),
    })
    const window = await open()
    expect(
      await within(window).findByRole('button', { name: 'Ring slot 2: unlocks at Bankai level 2' }),
    ).toBeDisabled()
    await userEvent.click(within(window).getByRole('button', { name: 'Cell 3: Sky Rift Lv1' }))
    await userEvent.click(within(window).getByRole('button', { name: 'Ring slot 1: empty' }))
    expect(requestBody(fetch, 'POST /api/game/bankai/crystals/move')).toEqual({
      from: { type: 'inventory', index: 2 },
      to: { type: 'ring', weapon: 'zangetsu', slot: 0 },
    })
  })

  it('devours the food crystals into the target', async () => {
    const fetch = mockApi({
      'GET /api/game/bankai': () =>
        json(view({ inventory: inventory({ 0: gem(ID_A), 1: gem(ID_B, { name: 'Chaos' }) }) })),
      'POST /api/game/bankai/crystals/devour': () =>
        json({ ...view(), xpGained: 25, targetLevel: 1 }),
    })
    const window = await open()
    await userEvent.click(
      await within(window).findByRole('button', { name: 'Cell 1: Sky Rift Lv1' }),
    )
    await userEvent.click(within(window).getByRole('button', { name: 'Set as target' }))
    await userEvent.click(within(window).getByRole('button', { name: 'Cell 2: Chaos Lv1' }))
    await userEvent.click(within(window).getByRole('button', { name: 'Add as food' }))
    expect(within(window).getByRole('button', { name: 'Food 1: Chaos Lv1' })).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Devour' }))
    expect(requestBody(fetch, 'POST /api/game/bankai/crystals/devour')).toEqual({
      targetId: ID_A,
      foodIds: [ID_B],
    })
    expect(await within(window).findByText('+25 XP → Lv.1')).toBeVisible()
  })

  it('unlocks a crystal cell with coupons', async () => {
    const fetch = mockApi({
      'GET /api/game/bankai': () => json(view()),
      'POST /api/game/bankai/slots/unlock': () => json(view({ lockedSlots: [] })),
    })
    const window = await open()
    await userEvent.click(await within(window).findByRole('button', { name: 'Cell 9: locked' }))
    const dialog = screen.getByRole('dialog', { name: 'Unlock Slot' })
    expect(within(dialog).getByText('Unlock this slot?')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '40,000 Stones' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: '400 Coupons' }))
    expect(requestBody(fetch, 'POST /api/game/bankai/slots/unlock')).toEqual({
      slot: 8,
      payWith: 'coupons',
    })
    expect(await within(window).findByText('Slot unlocked!')).toBeVisible()
  })

  it('opens the Crystal System Guide and Get Crystal', async () => {
    mockApi({ 'GET /api/game/bankai': () => json(view({ coins: 120 })) })
    const window = await open()
    await userEvent.click(await within(window).findByRole('button', { name: 'Info' }))
    const guide = screen.getByRole('dialog', { name: 'Crystal System Guide' })
    expect(within(guide).getByRole('row', { name: 'Orange 20 1600 10 Coins' })).toBeVisible()
    await userEvent.click(within(guide).getByRole('button', { name: 'Close' }))
    await userEvent.click(within(window).getByRole('button', { name: 'Get Crystal' }))
    const forge = screen.getByRole('dialog', { name: 'Get Crystal' })
    expect(within(forge).getByText('Coins: 120')).toBeVisible()
    expect(within(forge).getByRole('button', { name: 'Konan (Cost: 50)' })).toBeDisabled()
  })
})
