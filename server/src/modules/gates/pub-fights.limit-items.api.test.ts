// Limit items from pub fights (M5 decision 14) with a won fight, a chosen combo and seeded rolls.
import type { Random } from '@pockie/game-core'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { setUpNinja } from './test-setup.js'

const mocks = vi.hoisted(() => ({ combo: null as string | null }))
vi.mock('@pockie/game-core', async (original) => {
  const core = await original<typeof import('@pockie/game-core')>()
  return {
    ...core,
    simulateFight: (input: { attackers: { hp: number; mp: number }[]; seed: number }) => ({
      seed: input.seed,
      fighters: [
        { index: 0, side: 'attackers', hp: input.attackers[0]!.hp, mp: input.attackers[0]!.mp },
      ],
      events: [],
      winner: 'attackers',
    }),
    comboRule: () => mocks.combo,
  }
})
// Every roll is 0: a win always drops, and the first item of the band is picked.
const zero = vi.hoisted((): Random => ({ next: () => 0, int: () => 0, between: (a) => a }))
vi.mock('../bloodlines/rules.js', async (original) => {
  const rules = await original<typeof import('../bloodlines/rules.js')>()
  return {
    ...rules,
    limitItemDrops: (level: number, _random: unknown, options?: { combo?: boolean }) =>
      rules.limitItemDrops(level, zero, options),
  }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  mocks.combo = null
  ninja = await setUpNinja(db)
  await ninja.ready(16, 2601)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

/** Bag count of i148023, the first level-16 band item (scene 2601 is level 16). */
const limitItems = async () => (await ninja.bag('i148023')).reduce((n, row) => n + row.count, 0)

describe('pub-fight limit items', () => {
  it('a win grants a limit item of the scene level band', async () => {
    const body = (await ninja.client.post('/api/game/gates/pub/fight')).json()
    expect(body.won).toBe(true)
    expect(body.rewards.items).toContainEqual(expect.objectContaining({ itemId: 'i148023' }))
    expect(await limitItems()).toBe(1)
  })

  it('a matched combo pull adds 4 of one item', async () => {
    mocks.combo = '500002'
    const body = (await ninja.client.post('/api/game/gates/pub/pull')).json()
    expect(body.combo.items).toContainEqual(expect.objectContaining({ itemId: 'i148023' }))
    expect(await limitItems()).toBe(4)
  })
})
