import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WingsView } from '../../../../shared/src/schemas/wings'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { CollectionWindow, WING_ICONS, WingEnhanceWindow } from './index'

const WING_IDS = [
  ...Array.from({ length: 16 }, (_, i) => `i${218000 + i}`),
  'i218017',
  'i218018',
  ...Array.from({ length: 8 }, (_, i) => `i${218200 + i}`),
]

const wing = {
  id: '00000000-0000-4000-8000-000000000001',
  itemId: 'i218000',
  nameKey: 'lg_reborn_item_218000',
  kind: 'wing' as const,
  level: 25,
  equipped: true,
  stats: [{ field: 'hp', label: 'Max HP', value: 1360 }],
  next: [{ field: 'hp', label: 'Max HP', value: 1376 }],
}
const view: WingsView = {
  maxLevel: 30,
  equipped: wing,
  owned: [wing],
  stones: [
    { itemId: 'i218020', nameKey: 'lg_reborn_item_218020', levelJump: 1, count: 0 },
    { itemId: 'i218021', nameKey: 'lg_reborn_item_218021', levelJump: 1, count: 3 },
  ],
  talismans: [
    {
      itemId: 'i218034',
      nameKey: 'lg_reborn_item_218034',
      family: 'integrity',
      value: 100,
      count: 1,
    },
    { itemId: 'i218054', nameKey: 'lg_reborn_item_218054', family: 'luck', value: 100, count: 1 },
  ],
  rewardItemId: 'i218021',
  collection: WING_IDS.map((itemId, i) => ({
    itemId,
    nameKey: `lg_reborn_item_${itemId.slice(1)}`,
    kind: itemId >= 'i218200' ? ('aura' as const) : ('wing' as const),
    reward: i < 9 ? 5 : 10,
    registered: itemId === 'i218001',
    owned: itemId === 'i218000',
  })),
}

describe('WingsWindow', () => {
  it('has an icon for each of the 26 wings and auras', () => {
    for (const itemId of WING_IDS) expect(WING_ICONS[itemId]).toMatch(/^\/assets\/reborn\//)
  })

  it('enhances the chosen wing with a material and talismans', async () => {
    const fetch = mockApi({
      'GET /api/game/wings': () => json(view),
      [`POST /api/game/wings/${wing.id}/enhance`]: () =>
        json({ ...view, equipped: null, owned: [], outcome: 'destroy', level: null }),
    })
    renderWithProviders(<WingEnhanceWindow onClose={vi.fn()} />)
    const window = screen.getByRole('dialog', { name: 'Wing Enhancement' })
    expect(await within(window).findByText('Level: +25')).toBeVisible()
    expect(within(window).getByText('Max HP +1360')).toBeVisible()
    expect(within(window).getByText('Next (+26): Max HP +1376')).toBeVisible()
    expect(within(window).getByRole('button', { name: 'Enhance' })).toBeDisabled()

    await userEvent.selectOptions(within(window).getByLabelText('Material'), 'i218021')
    expect(within(window).getByText('Success Rate: 15%')).toBeVisible()
    const odds = within(window).getByRole('list', { name: 'Outcome odds' })
    expect(within(odds).getByText('Destroyed: 4.25%')).toBeVisible()
    await userEvent.selectOptions(within(window).getByLabelText('Luck'), 'i218054')
    expect(within(window).getByText('Success Rate: 30%')).toBeVisible()
    await userEvent.selectOptions(within(window).getByLabelText('Integrity'), 'i218034')
    expect(within(odds).getByText('Destroyed: 0%')).toBeVisible()
    await userEvent.click(within(window).getByRole('button', { name: 'Enhance' }))

    expect(requestBody(fetch, `POST /api/game/wings/${wing.id}/enhance`)).toEqual({
      stone: 'i218021',
      luck: 'i218054',
      integrity: 'i218034',
    })
    expect(await within(window).findByText('Wing Destroyed!')).toBeVisible()
  })

  it('shows the Wings tab of the Collection and submits an owned wing', async () => {
    const fetch = mockApi({
      'GET /api/game/wings': () => json(view),
      'POST /api/game/wings/collection/i218000': () => json({ ...view, reward: 5 }),
    })
    renderWithProviders(<CollectionWindow onClose={vi.fn()} />)
    for (const tab of ['Avatars', 'Pets', 'Gear Sets']) {
      expect(screen.getByRole('tab', { name: tab })).toBeDisabled()
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute(
        'title',
        `${tab}: not available yet`,
      )
    }
    expect(screen.getByRole('tab', { name: 'Wings' })).toHaveAttribute('aria-selected', 'true')
    const list = await screen.findByRole('list', { name: 'Wing Collection' })
    expect(list.querySelectorAll('li')).toHaveLength(26)
    expect(screen.getByText('Total Collected: 1/26')).toBeVisible()
    expect(screen.getByText('Ready to Submit: 1')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(list.querySelectorAll('li')).toHaveLength(1)
    await userEvent.click(within(list).getByRole('button', { name: 'Fallen Wings' }))
    const submit = screen.getByRole('dialog', { name: 'Submit Wing' })
    await userEvent.click(within(submit).getByRole('button', { name: 'Submit' }))

    expect(requestBody(fetch, 'POST /api/game/wings/collection/i218000')).toEqual({})
    expect(
      await screen.findByText('Registered. You received Plume Shard [First Grade] x5.'),
    ).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Submit Wing' })).toBeNull()
  })
})
