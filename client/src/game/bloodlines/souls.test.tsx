import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { BloodlinesWindow } from './index'
import { soulIcon } from './souls'

const limit = (id: number, extra: object = {}) => ({
  limitId: id,
  nameKey: `reborn_limit_${id}`,
  npcId: 81000 + id,
  npcNameKey: `reborn_npc_${81000 + id}`,
  requiredLevel: 16,
  unlockItem: 'i148023',
  itemsHeld: 0,
  amity: 0,
  amityNeeded: 30,
  unlocked: false,
  active: false,
  stats: [],
  ...extra,
})
const bloodlines = {
  turnInsUsed: 0,
  turnInsPerDay: 10,
  itemsPerTurnIn: 4,
  amityPerTurnIn: 30,
  maxActive: 3,
  resetAt: new Date(Date.now() + 60000).toISOString(),
  bonuses: [],
  limits: [limit(1, { unlocked: true, active: true }), limit(2)],
}
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

describe('Souls tab', () => {
  it('uses Reborn soul icons that exist in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let type = 1; type <= 13; type++) expect(urls).toContain(soulIcon(type))
  })

  it('shows sockets, loose souls and discovers', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/discover': () =>
        json({ ...souls, discoveredToday: 5, souls: [...souls.souls, soul('e', 5, 3)] }),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Souls' }))
    expect(await screen.findByText(/Discoveries left today: 6\/10/)).toBeVisible()
    const sockets = screen.getByRole('list', { name: 'Soul sockets' })
    expect(sockets.querySelectorAll('li')).toHaveLength(5)
    expect(sockets).toHaveTextContent('Firm Lv 2 (Defense +22.1)')
    expect(screen.getByRole('list', { name: 'Loose souls' }).querySelectorAll('li')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Discover' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/discover')).toEqual({ count: 1 })
    expect(await screen.findByText('Soul discovered.')).toBeVisible()
  })

  it('synthesizes the selected souls and binds a single one', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/souls/synthesize': () => json(souls),
      'POST /api/game/bloodlines/souls/b/bind': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Souls' }))
    const loose = await screen.findByRole('list', { name: 'Loose souls' })
    const boxes = within(loose).getAllByRole('checkbox')
    await userEvent.click(boxes[0]!)
    expect(screen.getByRole('button', { name: 'Synthesize' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Bind' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/b/bind')).toEqual({ limitId: 1 })
    for (const box of within(loose).getAllByRole('checkbox')) await userEvent.click(box)
    expect(screen.getByRole('button', { name: 'Bind' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Synthesize' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/souls/synthesize')).toEqual({
      soulIds: ['b', 'c', 'd'],
    })
  })
})

describe('Prayer tab', () => {
  it('shows the prayer, warns on an attribute switch and prays', async () => {
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(bloodlines),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/1/prayer': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Prayer' }))
    expect(await screen.findByText(/Strength prayer level 2\/9: Strength \+16/)).toBeVisible()
    expect(screen.getByRole('meter', { name: 'Prayer' })).toHaveAttribute('aria-valuenow', '300')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Attribute' }), 'Agility')
    expect(screen.getByText(/resets this prayer/)).toBeVisible()
    const loose = screen.getByRole('list', { name: 'Loose souls' })
    for (const box of within(loose).getAllByRole('checkbox').slice(0, 2)) await userEvent.click(box)
    expect(screen.getByText('Selected souls give 200 prayer points.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pray' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/1/prayer')).toEqual({
      attribute: 2,
      soulIds: ['b', 'c'],
    })
  })
})
