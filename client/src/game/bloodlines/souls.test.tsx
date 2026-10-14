import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { BloodlinesWindow } from './index'
import { batchGroups } from './soul-dialogs'
import { soulIcon } from './souls'
import { bloodlinesView } from './test-data'

const types = Array.from({ length: 13 }, (_, i) => ({
  id: i + 1,
  nameKey: `reborn_soul_${i + 1}`,
  field: 'defense',
  label: 'Defense',
  valueByLevel: [7.8, 13, 22.1, 34.45, 50.05, 69.55, 92.3, 115.7, 143, 174.2, 208],
}))
const soul = (id: string, type: number, level: number, limitId: number | null = null) => ({
  id,
  type,
  level,
  limitId,
  socket: limitId === null ? null : 0,
})
const souls = {
  souls: [soul('a', 1, 2, 1), soul('b', 2, 1), soul('c', 3, 1), soul('d', 4, 1)],
  inventory: 250,
  socketsPerLimit: 5,
  discoveredToday: 4,
  discoverPerDay: 10,
  levelLimits: [25, 25, 25, 36, 36, 51, 71, 71, 90, 90],
  types,
  prayers: [{ limitId: 1, attribute: 1, level: 2, progress: 300, needed: 20000 }],
  prayerMaxLevel: 9,
  prayerPoints: [100, 300, 900, 2700, 8100, 24300, 72900, 218700, 656100, 1968300],
  resetAt: new Date(Date.now() + 60000).toISOString(),
}
const ninja = { ...character, level: 60 }
const bloodlines = bloodlinesView({ 1: { unlocked: true, active: true } })

/** Opens the Souls tab with limit 1 (Body Enlargement Technique) selected. */
async function openSouls() {
  const grid = await screen.findByRole('list', { name: 'Limits' })
  await userEvent.dblClick(within(grid).getByRole('button', { name: /^Body Enlargement/ }))
  return screen.findByRole('list', { name: 'Souls' })
}

describe('Souls tab', () => {
  it('uses Reborn soul icons that exist in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let type = 1; type <= 13; type++) expect(urls).toContain(soulIcon(type))
  })

  it('shows the sockets and the soul inventory, and discovers', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/discover': () =>
        json({ ...souls, discoveredToday: 5, souls: [...souls.souls, soul('e', 5, 3)] }),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const inventory = await openSouls()
    expect(screen.getByText('Soul Inventory (4/250)')).toBeVisible()
    const sockets = screen.getByRole('list', { name: 'Sockets' })
    expect(within(sockets).getAllByRole('listitem')).toHaveLength(5)
    expect(
      within(sockets).getByRole('button', { name: 'Firm Lv. 2 (Defense +22.1)' }),
    ).toBeVisible()
    expect(within(inventory).getAllByRole('button')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Discover (4/10)' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/discover')).toEqual({ count: 1 })
    expect(await screen.findByRole('button', { name: 'Discover (5/10)' })).toBeVisible()
  })

  it('binds a soul from its menu and filters the inventory', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/b/bind': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const inventory = await openSouls()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search souls' }), 'zzz')
    expect(within(inventory).queryAllByRole('button')).toHaveLength(0)
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search souls' }))
    await userEvent.click(within(inventory).getAllByRole('button')[0]!)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Bind' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/b/bind')).toEqual({ limitId: 1 })
  })

  it('auto-fills three same-level souls in Soul Synthesis and creates', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/synthesize': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await openSouls()
    await userEvent.click(screen.getByRole('button', { name: 'Synth' }))
    const synthesis = screen.getByRole('dialog', { name: 'Soul Synthesis' })
    expect(within(synthesis).getByRole('button', { name: 'Create' })).toBeDisabled()
    await userEvent.click(within(synthesis).getByRole('button', { name: 'Level Match' }))
    expect(synthesis).toHaveTextContent('Auto Filled Souls')
    expect(within(synthesis).getByRole('img', { name: 'Random soul' })).toBeVisible()
    await userEvent.click(within(synthesis).getByRole('button', { name: 'Create' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/synthesize')).toEqual({
      soulIds: ['b', 'c', 'd'],
    })
    expect(await within(synthesis).findByText('Soul synthesis requested')).toBeVisible()
  })

  it('refines a soul with picked same-level materials', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/refine': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const inventory = await openSouls()
    await userEvent.click(within(inventory).getAllByRole('button')[0]!)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Refine' }))
    const refine = screen.getByRole('dialog', { name: 'Soul Refine' })
    expect(refine).toHaveTextContent('Materials (Lv.1): 2')
    await userEvent.click(within(refine).getByRole('button', { name: 'Select All' }))
    expect(refine).toHaveTextContent('Selected: 2')
    await userEvent.click(within(refine).getByRole('button', { name: 'Refine' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/refine')).toEqual({
      targetId: 'b',
      fuelIds: ['c', 'd'],
    })
    expect(await within(refine).findByText('Refined 2x')).toBeVisible()
  })

  it('prays with picked souls after confirming an attribute switch', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/1/prayer': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const inventory = await openSouls()
    await userEvent.click(screen.getByRole('button', { name: 'Prayer' }))
    expect(screen.getByText(/Strength prayer Lv\. 2\/9 \(\+16\), 300\/20000/)).toBeVisible()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Attribute' }), 'Agility')
    for (const tile of within(inventory).getAllByRole('button').slice(0, 2))
      await userEvent.click(tile)
    expect(screen.getByText(/Picked souls give 200 points/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    const warning = screen.getByRole('alertdialog')
    expect(warning).toHaveTextContent('Warning: This will reset your prayer progress.')
    await userEvent.click(within(warning).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/1/prayer')).toEqual({
      attribute: 2,
      soulIds: ['b', 'c'],
    })
  })
})

describe('batchGroups', () => {
  it('takes every full group under the target level, by level or by type', () => {
    const list = [
      soul('a', 1, 1),
      soul('b', 2, 1),
      soul('c', 1, 1),
      soul('d', 1, 1),
      soul('e', 1, 2),
      soul('f', 1, 2),
      soul('g', 1, 2),
      soul('h', 1, 1, 7),
    ]
    expect(batchGroups(list, 'level', 2, 10)).toEqual(['a', 'b', 'c'])
    expect(batchGroups(list, 'level', 3, 10)).toEqual(['a', 'b', 'c', 'e', 'f', 'g'])
    expect(batchGroups(list, 'exact', 3, 10)).toEqual(['a', 'c', 'd', 'e', 'f', 'g'])
    expect(batchGroups(list, 'level', 10, 2)).toEqual(['a', 'b', 'c'])
  })
})
