import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  ZanpakutoCrystal,
  ZanpakutoStat,
  ZanpakutoView,
} from '../../../../shared/src/schemas/zanpakuto'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ZanpakutoWindow } from './index'

const ID = '00000000-0000-4000-8000-00000000000a'

const crystal = (extra: Partial<ZanpakutoCrystal> = {}): ZanpakutoCrystal => ({
  id: ID,
  iid: 480001,
  name: 'Sharp Blue Crystal I',
  icon: 'zanpakuto/rui_s1',
  category: 0,
  tab: 'sharp',
  position: 1,
  coins: 1,
  stats: [[8, 100]],
  bulkOptions: [],
  ...extra,
})

const empty = (length: number) => Array.from({ length }, () => null)

const view = (extra: Partial<ZanpakutoView> = {}): ZanpakutoView => ({
  coins: 25,
  freeRefines: 3,
  spirit: empty(16),
  lockedSlots: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  tabs: { sharp: empty(6), blunt: empty(6), fist: empty(6) },
  lockedWeaponSlots: [1, 2, 3, 4, 5],
  activeTab: 'sharp',
  ...extra,
})

const withSpirit = (gem: ZanpakutoCrystal) => view({ spirit: [gem, ...empty(15)] })
const withSharp = (gem: ZanpakutoCrystal) =>
  view({ tabs: { sharp: [gem, ...empty(5)], blunt: empty(6), fist: empty(6) } })

const open = () => {
  renderWithProviders(<ZanpakutoWindow onClose={vi.fn()} />)
  return screen.findByRole('dialog', { name: 'Zanpakuto' })
}

describe('ZanpakutoWindow', () => {
  it('shows Spirit Coins and buys a locked spirit slot with coupons', async () => {
    const fetch = mockApi({
      'GET /api/game/zanpakuto': () => json(view()),
      'POST /api/game/zanpakuto/slots/unlock': () => json(view({ lockedSlots: [] })),
    })
    const window = await open()
    expect(await within(window).findByText('SC: 25')).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Spirit slot 5: locked' }))
    const unlock = screen.getByRole('dialog', { name: 'Unlock Spirit Slot' })
    expect(within(unlock).getByRole('button', { name: '100000 Stones' })).toBeVisible()
    await userEvent.click(within(unlock).getByRole('button', { name: '800 Coupons' }))
    expect(requestBody(fetch, 'POST /api/game/zanpakuto/slots/unlock')).toEqual({
      slot: 4,
      currency: 'coupons',
    })
  })

  it('equips a spirit crystal from its menu and sells another after confirming', async () => {
    const fetch = mockApi({
      'GET /api/game/zanpakuto': () => json(withSpirit(crystal())),
      'POST /api/game/zanpakuto/equip': () => json(withSharp(crystal())),
      'POST /api/game/zanpakuto/sell': () => json(view()),
    })
    const window = await open()
    await userEvent.click(
      await within(window).findByRole('button', { name: 'Spirit slot 1: Sharp Blue Crystal I' }),
    )
    await userEvent.click(within(window).getByRole('menuitem', { name: 'Equip Crystal' }))
    expect(requestBody(fetch, 'POST /api/game/zanpakuto/equip')).toEqual({ id: ID })
    expect(await within(window).findByText('Max Health: 50')).toBeVisible()
    expect(within(window).getByText('Zanpakuto activated')).toBeVisible()
    expect(within(window).getByRole('button', { name: 'Spirit slot 1: empty' })).toBeDisabled()
  })

  it('sells a spirit crystal after the confirm prompt', async () => {
    const fetch = mockApi({
      'GET /api/game/zanpakuto': () => json(withSpirit(crystal({ coins: 6 }))),
      'POST /api/game/zanpakuto/sell': () => json(view()),
    })
    const window = await open()
    await userEvent.click(
      await within(window).findByRole('button', { name: 'Spirit slot 1: Sharp Blue Crystal I' }),
    )
    await userEvent.click(within(window).getByRole('menuitem', { name: 'Sell' }))
    const prompt = within(window).getByRole('alertdialog', { name: 'Sell this crystal for 6 SC?' })
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/zanpakuto/sell')).toEqual({ id: ID })
  })

  it('marks a tab that does not match the weapon as Wrong weapon', async () => {
    mockApi({ 'GET /api/game/zanpakuto': () => json(view({ activeTab: 'fist' })) })
    const window = await open()
    expect(await within(window).findByRole('tab', { name: 'Fist' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(within(window).getByRole('tab', { name: 'Sharp' }))
    expect(within(window).getByText('Wrong weapon')).toBeVisible()
    expect(within(window).getByRole('button', { name: 'Sharp slot 2: locked' })).toBeDisabled()
  })

  it('refines an equipped crystal after confirming', async () => {
    const fetch = mockApi({
      'GET /api/game/zanpakuto': () => json(withSharp(crystal())),
      'POST /api/game/zanpakuto/refine': () =>
        json({ ...withSharp(crystal({ stats: [[15, 20]] })), freeRefines: 2 }),
    })
    const window = await open()
    await userEvent.click(await within(window).findByRole('button', { name: 'Refine' }))
    const refine = screen.getByRole('dialog', { name: 'Zanpakuto Refine' })
    expect(within(refine).getByText('3')).toBeVisible()
    expect(within(refine).getByText('20 ~ 100')).toBeVisible()
    await userEvent.click(within(refine).getByRole('button', { name: 'Refine' }))
    await userEvent.click(within(refine).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/zanpakuto/refine')).toEqual({ id: ID })
    expect(await within(refine).findByText('Critical: 10')).toBeVisible()
  })

  it('opens Bulk Refine and saves an option with a locked stat', async () => {
    const stats: ZanpakutoStat[] = [
      [8, 100],
      [15, 10],
    ]
    const options: ZanpakutoStat[][] = [
      [
        [13, 60],
        [16, 8],
      ],
    ]
    const fetch = mockApi({
      'GET /api/game/zanpakuto': () => json(withSharp(crystal({ stats }))),
      'POST /api/game/zanpakuto/bulk': () =>
        json(withSharp(crystal({ stats, bulkOptions: options }))),
      'POST /api/game/zanpakuto/bulk/apply': () => json(withSharp(crystal())),
    })
    const window = await open()
    await userEvent.click(await within(window).findByRole('button', { name: 'Refine' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Zanpakuto Refine' })).getByRole('button', {
        name: 'Bulk Refine',
      }),
    )
    const bulk = await screen.findByRole('dialog', { name: 'Zanpakuto Bulk Refine' })
    await userEvent.click(within(bulk).getByRole('radio', { name: /Max Chakra: 30/ }))
    await userEvent.click(within(bulk).getByRole('checkbox', { name: 'Lock Max Health' }))
    expect(within(bulk).getByRole('radio', { name: /Max Health: 50/ })).toBeChecked()
    await userEvent.click(within(bulk).getByRole('button', { name: 'Save' }))
    const prompt = within(bulk).getByRole('alertdialog')
    expect(prompt).toHaveTextContent(
      'You are locking 1 attribute(s). This will cost 6 spirit coins and 10000 stones.',
    )
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/zanpakuto/bulk/apply')).toEqual({
      id: ID,
      index: 0,
      locks: [0],
    })
  })
})
