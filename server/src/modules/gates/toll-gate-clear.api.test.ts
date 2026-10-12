// The clear path with a fixed fight result: real toll gate bosses can beat any test ninja.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { errorCode, setUpNinja } from './test-setup.js'

const outcome = vi.hoisted(() => ({ hp: 500 }))
vi.mock('@pockie/game-core', async (original) => ({
  ...(await original<typeof import('@pockie/game-core')>()),
  simulateFight: () => ({
    seed: 0,
    fighters: [{ index: 0, side: 'attackers', hp: outcome.hp, mp: 0 }],
    events: [],
    winner: 'attackers',
  }),
}))

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.give('i270100', { equippedSlot: 'Weapon' })
  await ninja.ready(20)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const fight = () => ninja.client.post('/api/game/gates/run/fight')

describe('a won toll gate run (100001)', () => {
  it('restores 20% HP and 40% MP after each win', async () => {
    await ninja.client.post('/api/game/gates/enter', { gateId: 100001 })
    const body = (await fight()).json()
    const { maxHp, maxMp } = body.character
    expect(body.character.hp).toBe(Math.min(maxHp, 500 + Math.trunc(maxHp * 0.2)))
    expect(body.character.mp).toBe(Math.trunc(maxMp * 0.4))
    expect(body.run).toMatchObject({ subGate: 0, point: 1, passedPoint: 0 })
  })

  it('pays the sub gates and the gate, then deals five face-down cards', async () => {
    const before = (await ninja.row()).stone
    await ninja.client.post('/api/game/gates/enter', { gateId: 100001 })
    let body
    for (let point = 0; point < 10; point++) body = (await fight()).json()
    // SubTollGate 200011 + 200012 and TollGate 100001 Stone (group NPCs drop no Stone).
    expect((await ninja.row()).stone - before).toBe(1100 + 1700 + 2800)
    expect(body.run).toMatchObject({ cleared: true, nextNpcIds: null, passedPoint: 9 })
    expect(body.run.cards).toMatchObject({ state: 1, peeks: 0, peekCost: 15 })
    expect(body.run.cards.cards).toEqual([null, null, null, null, null])
    expect(errorCode(await fight())).toBe('run_cleared')
  })
})
