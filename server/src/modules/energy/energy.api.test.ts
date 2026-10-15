// Energy (VP): the lazy daily restore, the spenders (field fight, chain attack), Energy Refill,
// energy items, and Battle Power in the character stats.
import type { Character, CharacterStats } from '@pockie/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { battlePower, ENERGY_RULES } from '../../../../shared/src/schemas/energy.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { energyState } from './energy.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

/** Forge Highlands (2101): Sunflowers (n33017, level 2) that a level-30 ninja always beats. */
const FIELD = 2101
const SUNFLOWER = 'n33017'
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const state = (current: number, extra: object = {}) => ({
  energy: { current, day: today(), refills: 0, items: {}, ...extra },
})

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.give('i260100', { equippedSlot: 'Weapon' })
  await ninja.ready(30, FIELD)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const post = (path: string, body: object = {}) => ninja.client.post(`/api/game/${path}`, body)
const me = async () =>
  (await ninja.client.get('/api/game/character')).json<{
    character: Character
    stats: CharacterStats
  }>()

describe('energy state', () => {
  const at = new Date('2026-10-15T12:00:00Z')
  const row = (energy: unknown, vipUntil: Date | null = null) => ({ energy, vipUntil })

  it('starts full for a ninja that never used energy', () => {
    expect(energyState(row(null), at)).toEqual({
      current: 200,
      day: '2026-10-15',
      refills: 0,
      items: {},
    })
  })

  it('adds 100 once on a new UTC day, 200 with VIP, capped at the max, and resets the counters', () => {
    const old = { current: 30, day: '2026-10-10', refills: 3, items: { i160001: 3 } }
    expect(energyState(row(old), at)).toEqual({
      current: 130,
      day: '2026-10-15',
      refills: 0,
      items: {},
    })
    expect(energyState(row(old, new Date('2026-11-01')), at).current).toBe(200)
    expect(energyState(row({ ...old, current: 150 }), at).current).toBe(200)
    const same = { ...old, day: '2026-10-15' }
    expect(energyState(row(same), at)).toEqual(same)
  })
})

describe('spending energy', () => {
  it('a field fight costs 1 energy and needs some left', async () => {
    const fight = await post('fight', { monsterId: SUNFLOWER })
    expect(fight.statusCode, fight.body).toBe(200)
    expect(fight.json<{ character: Character }>().character.energy).toEqual({
      current: 199,
      max: 200,
      refillsToday: 0,
    })

    await ninja.set(state(0))
    const tired = await post('fight', { monsterId: SUNFLOWER })
    expect(errorCode(tired)).toBe('no_energy')
    expect(tired.json().error.message).toBe('Not enough energy. No energy left.')
  })

  it('a chain attack pays 1 energy per monster at Begin', async () => {
    await ninja.set(state(3))
    const tooMany = await post('chain-attack', { monsterId: SUNFLOWER, amount: 4 })
    expect(errorCode(tooMany)).toBe('no_energy')
    expect(tooMany.json().error.message).toContain('You need 4 energy but only have 3')

    const started = await post('chain-attack', { monsterId: SUNFLOWER, amount: 3 })
    expect(started.statusCode, started.body).toBe(200)
    expect(started.json<{ character: Character }>().character.energy.current).toBe(0)
    expect((await ninja.row()).energy).toMatchObject({ current: 0 })
  })

  it('the daily restore is applied when yesterday’s state is read', async () => {
    await ninja.set({ energy: { current: 10, day: YESTERDAY, refills: 2, items: {} } })
    expect((await me()).character.energy).toEqual({ current: 110, max: 200, refillsToday: 0 })
  })
})

describe('Energy Refill', () => {
  it('fills to full for 35 x 2^refills Gold, refuses when full or poor', async () => {
    expect(errorCode(await post('energy/refill'))).toBe('energy_full')

    await ninja.set({ gold: 100, ...state(50, { refills: 1 }) })
    const refilled = await post('energy/refill')
    expect(refilled.statusCode, refilled.body).toBe(200)
    const result = refilled.json<{ restored: number; character: Character }>()
    expect(result.restored).toBe(150)
    expect(result.character.energy).toEqual({ current: 200, max: 200, refillsToday: 2 })
    expect(result.character.gold).toBe(30)

    await ninja.set(state(0, { refills: 2 }))
    expect(errorCode(await post('energy/refill'))).toBe('not_enough')
  })
})

describe('energy items', () => {
  it('restore their energy, 3 uses a day per item, not past full', async () => {
    await ninja.set(state(100))
    const drinks = await Promise.all([1, 2, 3, 4].map(() => ninja.give('i160001')))
    for (const [i, drink] of drinks.slice(0, 3).entries()) {
      const used = await post(`items/${drink.id}/use`)
      expect(used.statusCode, used.body).toBe(200)
      expect(used.json<{ character: Character }>().character.energy.current).toBe(120 + 20 * i)
    }
    expect(errorCode(await post(`items/${drinks[3]!.id}/use`))).toBe('daily_limit')

    await ninja.set(state(ENERGY_RULES.max))
    expect(errorCode(await post(`items/${drinks[3]!.id}/use`))).toBe('energy_full')
  })
})

describe('Battle Power', () => {
  it('is in the stats and rises with a weapon', async () => {
    const armed = (await me()).stats
    expect(armed.battlePower).toBe(battlePower(armed))
    await ninja.set({ activeSet: 2 })
    expect((await me()).stats.battlePower).toBeLessThan(armed.battlePower)
  })
})
