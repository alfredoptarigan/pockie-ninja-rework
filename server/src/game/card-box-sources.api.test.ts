// Card box drop sources (M6 decision 29). Every roll hits and every fight is won, so each source's
// box is certain; the box's rarity shows which source rolled it.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_BOX_ITEMS,
  CARD_BOX_SOURCES,
  type CardBoxSource,
} from '../../../game-core/src/cards/constants.js'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { inventoryItems, singleGate, tailedBeastPlayers, teamStonePlayers } from '../db/schema.js'
import { setUpNinja } from '../modules/gates/test-setup.js'
import { weekStart } from '../modules/rankings/toll-gate-weekly.js'
import { payTeamStoneWeek } from '../modules/team-stone/store.js'
import { BAG_CELLS } from './bag.js'
import { fightMonster } from './combat.js'

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
  }
})
vi.mock('../../../game-core/src/cards/boxes.js', async (original) => ({
  ...(await original<typeof import('../../../game-core/src/cards/boxes.js')>()),
  rollCardBox: (source: CardBoxSource) => CARD_BOX_ITEMS[CARD_BOX_SOURCES[source].rarity],
}))

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
const DAY_MS = 86_400_000

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const held = async (itemId: string) =>
  (await ninja.bag(itemId)).reduce((sum, row) => sum + row.count, 0)
const fillBag = () =>
  db.insert(inventoryItems).values(
    Array.from({ length: BAG_CELLS }, () => ({
      characterId: ninja.characterId,
      itemId: 'i160006',
      count: 1,
    })),
  )
const fightField = async () =>
  db.transaction(async (tx) => fightMonster(tx, await ninja.row(), 'n33017'))

describe('card box sources', () => {
  it('a field monster win drops a Green box', async () => {
    await ninja.ready(10, 2101)
    const { rewards } = await fightField()
    expect(rewards.items).toContainEqual({ itemId: 'i171001', bound: true })
    expect(await held('i171001')).toBe(1)
  })

  it('a field win on a full bag loses the box like other loot', async () => {
    await ninja.ready(10, 2101)
    await fillBag()
    const { rewards } = await fightField()
    expect(rewards.lost).toBeGreaterThanOrEqual(1)
    expect(await held('i171001')).toBe(0)
  })

  it('a pub-fight win drops a Blue box', async () => {
    await ninja.ready(16, 2601)
    const body = (await ninja.client.post('/api/game/gates/pub/fight')).json()
    expect(body.won).toBe(true)
    expect(body.rewards.items).toContainEqual({ itemId: 'i171002', bound: true })
    expect(await held('i171002')).toBe(1)
  })

  it('clearing Las Noches floor 10 drops a Red box, floor 9 none', async () => {
    await ninja.ready(13)
    await db
      .insert(singleGate)
      .values({ characterId: ninja.characterId, mode: 2, currentFloor: 9, lives: 1 })
    const ninth = (await ninja.client.post('/api/game/gates/las-noches/fight')).json()
    expect(ninth.rewards.items).toEqual([])
    const tenth = (await ninja.client.post('/api/game/gates/las-noches/fight')).json()
    expect(tenth.won).toBe(true)
    expect(tenth.rewards.items).toEqual([{ itemId: 'i171004', bound: true }])
    expect(await held('i171004')).toBe(1)
  })

  it('an auto run clearing floor 10 drops a Red box', async () => {
    await ninja.ready(13)
    await db.insert(singleGate).values({
      characterId: ninja.characterId,
      mode: 1,
      currentFloor: 10,
      autoRunsLeft: 1,
      autoRunsBought: 1,
      autoEndFloor: 160,
      autoReachFloor: 12,
      autoTickAt: new Date(Date.now() - 31_000),
    })
    await ninja.client.get('/api/game/gates/las-noches')
    expect(await held('i171004')).toBe(1)
  })

  it('the Tailed Beast 10-fight box adds a Purple box', async () => {
    await db.insert(tailedBeastPlayers).values({
      week: weekStart(new Date()),
      characterId: ninja.characterId,
      village: 0,
      fights: 10,
    })
    const box = (fights: number) => ninja.client.post('/api/game/tailed-beast/box', { fights })
    expect((await box(5)).statusCode).toBe(200)
    expect(await held('i171003')).toBe(0)
    expect((await box(10)).statusCode).toBe(200)
    expect(await held('i171003')).toBe(1)
  })

  it('the Team Stone weekly pay adds a Gold box in leagues 7-8 only', async () => {
    const now = new Date()
    const values = {
      characterId: ninja.characterId,
      week: weekStart(new Date(now.getTime() - 7 * DAY_MS)),
      month: `${now.toISOString().slice(0, 7)}-01`,
      playedThisWeek: true,
    }
    await db.insert(teamStonePlayers).values({ ...values, score: 2500 })
    await payTeamStoneWeek(db, now)
    expect(await held('i171005')).toBe(0)

    await db
      .update(teamStonePlayers)
      .set({ ...values, score: 3300, paidWeek: null })
      .where(eq(teamStonePlayers.characterId, ninja.characterId))
    await payTeamStoneWeek(db, now)
    expect(await held('i171005')).toBe(1)
  })
})
