// VIP (decision 14) on every reward path: the EXP paid and the chance factor handed to the drop
// roll, with and without VIP. Fights are fixed (simulateFight mocked) so every path pays out.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characterDailyQuests,
  characterExploreSpots,
  characterQuests,
  exploreSearches,
  singleGate,
} from '../db/schema.js'
import { tollGateTables } from '../modules/gates/data.js'
import { setUpNinja } from '../modules/gates/test-setup.js'
import { npc } from './data.js'
import { loadQuests, saveQuests } from './progress.js'
import { recordCollect } from './quests.js'

const mocks = vi.hoisted(() => ({ won: true, chanceMuls: [] as number[] }))
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
      winner: mocks.won ? 'attackers' : 'defenders',
    }),
    rollDrops: (...args: Parameters<typeof core.rollDrops>) => {
      mocks.chanceMuls.push(args[3] ?? 1)
      return core.rollDrops(...args)
    },
  }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  await db.delete(singleGate)
  ninja = await setUpNinja(db)
  mocks.won = true
  mocks.chanceMuls = []
})
afterEach(async () => {
  vi.useRealTimers()
  await ninja.app.close()
})
afterAll(() => close())

const npcExp = (id: string) => Number(npc(id)!.NpcExp)
const post = (path: string, body?: object) => ninja.client.post(`/api/game${path}`, body)
const fight = (monsterId: string) => post('/fight', { monsterId })

const ACTIVE = new Date('2099-01-01T00:00:00Z')
const EXPIRED = new Date('2000-01-01T00:00:00Z')

describe.each([
  { label: 'without VIP', vipUntil: null, expMul: 1, dropMul: 1 },
  { label: 'with VIP', vipUntil: ACTIVE, expMul: 1.5, dropMul: 1.25 },
])('reward paths $label', ({ vipUntil, expMul, dropMul }) => {
  const exp = (base: number) => Math.floor(base * expMul)
  /** The action rolled drops, every roll with the VIP factor. */
  const expectDropMul = () => {
    expect(mocks.chanceMuls.length).toBeGreaterThan(0)
    expect(mocks.chanceMuls.every((mul) => mul === dropMul)).toBe(true)
  }
  beforeEach(() => ninja.set({ vipUntil }))

  it('field fights', async () => {
    // Sunflower (n33017) in Forge Highlands: 8 EXP, independent drop list 3000001.
    await ninja.set({ sceneId: 2101 })
    const body = (await fight('n33017')).json()
    expect(body.rewards.exp).toBe(exp(8))
    expect(body.character.exp).toBe(exp(8))
    expectDropMul()
  })

  it('task bosses', async () => {
    await ninja.set({ sceneId: 2601, level: 25 })
    await db
      .insert(characterQuests)
      .values({ characterId: ninja.characterId, taskId: 10045, progress: [0] })
    expect((await fight('n32005')).json().rewards.exp).toBe(exp(npcExp('n32005')))
  })

  it('ticket bosses', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T12:15:00Z'))
    await ninja.set({ sceneId: 2601, level: 25 })
    await ninja.give('i150078')
    // Soulender's level 25 variant n320144.
    expect((await fight('n320140')).json().rewards.exp).toBe(exp(npcExp('n320144')))
    expectDropMul()
  })

  it('explore fight cards', async () => {
    await ninja.set({ sceneId: 2101 })
    const { searchId } = (await post('/explore/21011', { action: 'start' })).json()
    await db
      .update(exploreSearches)
      .set({ cards: Array.from({ length: 5 }, () => ({ type: 'fight', monsterId: 'n33017' })) })
    const body = (await post('/explore/21011', { action: 'pick', searchId, cardIndex: 0 })).json()
    expect(body.rewards.exp).toBe(exp(8))
    expectDropMul()
  })

  it('explore star bonus EXP', async () => {
    await ninja.set({ sceneId: 2101 })
    // Spot 21011 rises to star 1 on this search; its bonus is EXP or a pet egg, so retry.
    for (let attempt = 0; attempt < 30; attempt++) {
      await db.delete(characterExploreSpots)
      await db
        .insert(characterExploreSpots)
        .values({ characterId: ninja.characterId, spotId: 21011, starLevel: 0, starProgress: 1 })
      await ninja.set({ exploreLastAt: null, exploreUsed: 0 })
      const body = (await post('/explore/21011')).json()
      if (body.starBonus?.type !== 'exp') continue
      expect(body.starBonus.exp).toBe(exp(115))
      return
    }
    throw new Error('The star bonus never rolled EXP')
  })

  it('quest hand-ins', async () => {
    // Quest 37102 (n11003 in 111) pays 263 EXP.
    await db
      .insert(characterQuests)
      .values({ characterId: ninja.characterId, taskId: 37102, progress: [4], state: 1 })
    const body = (await post('/npcs/n11003/talk')).json()
    expect(body.rewards[0].exp).toBe(exp(263))
  })

  it('daily quests', async () => {
    // 2260102: collect 12 i140016, pays 1344 EXP and a roll of drop list 4000064.
    const taskId = 2260102
    await ninja.set({ sceneId: 2601, level: 20 })
    await ninja.client.get('/api/game/daily')
    await db
      .insert(characterDailyQuests)
      .values({ characterId: ninja.characterId, taskId })
      .onConflictDoNothing()
    expect((await post(`/daily/${taskId}/accept`)).statusCode).toBe(200)
    await db.transaction(async (tx) => {
      for (let i = 0; i < 12; i++) {
        await saveQuests(
          tx,
          ninja.characterId,
          recordCollect(await loadQuests(tx, ninja.characterId), 'i140016'),
        )
      }
    })
    await ninja.give('i140016', { count: 12, bound: true })
    const body = (await post(`/daily/${taskId}/hand-in`)).json()
    expect(body.reward.exp).toBe(exp(1344))
    expectDropMul()
  })

  it('toll gates', async () => {
    await ninja.give('i270100', { equippedSlot: 'Weapon' })
    await ninja.ready(20)
    await post('/gates/enter', { gateId: 100001 })
    // The first sub gate (200011) has five points; its RewardExp is paid on the fifth win.
    let gained = 0
    for (let point = 0; point < 5; point++) {
      gained += (await post('/gates/run/fight')).json().rewards.exp
    }
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBe(exp(Number(tollGateTables().subs['200011']!.RewardExp)))
    expectDropMul()
  })

  it('Las Noches pot', async () => {
    await ninja.ready(13)
    await db.insert(singleGate).values({
      characterId: ninja.characterId,
      currentFloor: 170,
      potExp: 501,
      lives: 0,
    })
    mocks.won = false
    // A loss without lives halves the pot to 250 and pays it.
    const lost = (await post('/gates/las-noches/fight')).json()
    expect(lost).toMatchObject({ potPaid: exp(250), rewards: { exp: exp(250) } })

    await db
      .update(singleGate)
      .set({ currentFloor: 4, potExp: 120, lives: 1 })
      .where(eq(singleGate.characterId, ninja.characterId))
    expect((await post('/gates/las-noches/withdraw')).json().potPaid).toBe(exp(120))
  })

  it('pub fights', async () => {
    await ninja.ready(16, 2601)
    const body = (await post('/gates/pub/fight')).json()
    expect(body.won).toBe(true)
    expect(body.rewards.exp).toBeGreaterThan(0)
    expect(body.rewards.exp).toBe(exp(npcExp(body.npcIds.at(-1))))
    expectDropMul()
  })
})

it('an expired VIP gives no bonus', async () => {
  await ninja.set({ sceneId: 2101, vipUntil: EXPIRED })
  const body = (await fight('n33017')).json()
  expect(body.rewards.exp).toBe(8)
  expect(mocks.chanceMuls).toEqual([1])
})
