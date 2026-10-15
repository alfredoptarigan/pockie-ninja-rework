// Hunt, Chain Attack and Adventure with Jiraiya, and the battle guard they put on other battles.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADVENTURE_PLACEHOLDERS,
  HUNT_PLACEHOLDERS,
  type AdventureReturnResult,
  type AdventureView,
  type ChainAttackClaimResult,
  type ChainAttackView,
  type HuntCompleteResult,
  type HuntView,
} from '../../../../shared/src/schemas/hunt.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  arenaPlayers,
  chainAttacks,
  characterBankai,
  clanProgress,
  hunts,
  jiraiyaAdventures,
} from '../../db/schema.js'
import { visitRequiredScenes } from '../game/field-data.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { dueMonsters } from './chain-attack.js'
import { specialChance } from './adventure.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

/** Forge Highlands (2101): Sunflowers (n33017, level 2) that a level-30 ninja always beats. */
const FIELD = 2101
const SUNFLOWER = 'n33017'
const MINUTE = 60_000

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.give('i270100', { equippedSlot: 'Weapon' })
  await ninja.ready(30, FIELD)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const get = async <T>(path: string) => {
  const response = await ninja.client.get(`/api/game/${path}`)
  expect(response.statusCode).toBe(200)
  return response.json<T>()
}
const post = (path: string, body: object = {}) => ninja.client.post(`/api/game/${path}`, body)
const ok = async <T>(path: string, body: object = {}) => {
  const response = await post(path, body)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<T>()
}
const fight = () => post('fight', { monsterId: SUNFLOWER })
/** Moves the running chain's start back by `minutes`. */
const ageChain = (minutes: number) =>
  db
    .update(chainAttacks)
    .set({
      startedAt: new Date(Date.now() - minutes * MINUTE),
      endsAt: new Date(Date.now() - minutes * MINUTE + 3 * MINUTE * 3),
    })
    .where(eq(chainAttacks.characterId, ninja.characterId))

describe('Chain Attack', () => {
  it('counts a monster for every 3 minutes passed, never more than the chain', () => {
    const startedAt = new Date(0)
    expect(dueMonsters({ amount: 3, startedAt }, new Date(179_999))).toBe(0)
    expect(dueMonsters({ amount: 3, startedAt }, new Date(6 * MINUTE))).toBe(2)
    expect(dueMonsters({ amount: 3, startedAt }, new Date(60 * MINUTE))).toBe(3)
  })

  it('starts on a monster of this area, 3 minutes a monster, and blocks other battles', async () => {
    expect(errorCode(await post('chain-attack', { monsterId: 'n99999', amount: 2 }))).toBe(
      'not_here',
    )
    expect((await post('chain-attack', { monsterId: SUNFLOWER, amount: 31 })).statusCode).toBe(400)
    const { chain } = await ok<ChainAttackView>('chain-attack', { monsterId: SUNFLOWER, amount: 3 })
    expect(chain).toMatchObject({ monsterId: SUNFLOWER, nameKey: 'lg_name_n33017', amount: 3 })
    expect(Date.parse(chain!.endsAt) - Date.parse(chain!.startedAt)).toBe(9 * MINUTE)
    expect((await get<ChainAttackView>('chain-attack')).chain?.monsterId).toBe(SUNFLOWER)

    const refused = await fight()
    expect(errorCode(refused)).toBe('chain_attack')
    expect(refused.json().error.message).toBe(
      'Cannot start a battle while chain attack is in progress.',
    )
    expect(errorCode(await post('chain-attack', { monsterId: SUNFLOWER, amount: 1 }))).toBe(
      'chain_attack',
    )
  })

  it('claims early with what was fought so far, then frees the ninja', async () => {
    await ok('chain-attack', { monsterId: SUNFLOWER, amount: 3 })
    await ageChain(7)
    const before = await ninja.row()
    const result = await ok<ChainAttackClaimResult>('chain-attack/claim')
    expect(result).toMatchObject({ fought: 2, won: 2 })
    expect(result.rewards.exp).toBeGreaterThan(0)
    expect((await ninja.row()).stone).toBe(before.stone + result.rewards.stone)
    expect((await get<ChainAttackView>('chain-attack')).chain).toBeNull()
    expect(errorCode(await post('chain-attack/claim'))).toBe('no_chain')
    expect((await fight()).statusCode).toBe(200)
  })

  it('Instant Finish costs 5 Gift Certificates per 3 minutes left and fights them all', async () => {
    await ok('chain-attack', { monsterId: SUNFLOWER, amount: 3 })
    await ninja.set({ giftCoupon: 14 })
    expect(errorCode(await post('chain-attack/instant-finish'))).toBe('not_enough')
    await ninja.set({ giftCoupon: 20 })
    const result = await ok<ChainAttackClaimResult>('chain-attack/instant-finish')
    expect(result).toMatchObject({ fought: 3, won: 3 })
    expect((await ninja.row()).giftCoupon).toBe(5)
  })

  it('stops at the first loss', async () => {
    await ok('chain-attack', { monsterId: 'n33026', amount: 3 })
    await ninja.set({ hp: 1, level: 5 })
    await ageChain(60)
    const result = await ok<ChainAttackClaimResult>('chain-attack/claim')
    expect(result).toMatchObject({ fought: 1, won: 0 })
    expect(result.character.hp).toBe(0)
  })
})

describe('Hunt', () => {
  const ARENA_VILLAGE = 111

  it('is offered by the Arena NPC: three reachable monsters at or under the ninja’s level', async () => {
    expect(errorCode(await post('hunt/begin'))).toBe('not_here')
    await ninja.set({ sceneId: ARENA_VILLAGE, scenesEntered: [ARENA_VILLAGE] })
    expect(errorCode(await post('hunt/begin'))).toBe('no_monsters')
    await ninja.set({ scenesEntered: visitRequiredScenes() })
    const { hunt } = await ok<{ hunt: HuntView }>('hunt/begin')
    expect(hunt.monsters).toHaveLength(3)
    expect(new Set(hunt.monsters.map((m) => m.id)).size).toBe(3)
    for (const monster of hunt.monsters) {
      expect(monster.level).toBeLessThanOrEqual(30)
      expect(monster.level).toBeGreaterThanOrEqual(30 - HUNT_PLACEHOLDERS.levelsBelow)
      expect(monster.killed).toBe(false)
    }
    expect((await get<HuntView>('hunt')).monsters).toEqual(hunt.monsters)
    expect(errorCode(await post('hunt/begin'))).toBe('hunt_running')
    expect(errorCode(await post('hunt/complete'))).toBe('hunt_unfinished')
  })

  it('ticks off a hunted monster on a won field fight and pays arena challenges back', async () => {
    await db.insert(hunts).values({
      characterId: ninja.characterId,
      targets: [SUNFLOWER, SUNFLOWER],
      targetScenes: [FIELD, FIELD],
      killed: [false, false],
    })
    await ninja.set({ sceneId: FIELD })
    expect((await fight()).statusCode).toBe(200)
    expect((await get<HuntView>('hunt')).monsters.map((m) => m.killed)).toEqual([true, false])
    expect((await fight()).statusCode).toBe(200)

    await db
      .insert(arenaPlayers)
      .values({ characterId: ninja.characterId, day: today(), triesUsed: 7 })
    await ninja.set({ sceneId: ARENA_VILLAGE })
    const result = await ok<HuntCompleteResult>('hunt/complete')
    expect(result.arenaTriesRestored).toBe(HUNT_PLACEHOLDERS.arenaTries)
    expect(result.hunt).toMatchObject({ monsters: [], huntsToday: 1 })
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, ninja.characterId))
    expect(arena!.triesUsed).toBe(7 - HUNT_PLACEHOLDERS.arenaTries)
    expect(errorCode(await post('hunt/complete'))).toBe('no_hunt')
  })

  it('allows a few hunts a UTC day', async () => {
    await db.insert(hunts).values({
      characterId: ninja.characterId,
      day: today(),
      huntsDone: HUNT_PLACEHOLDERS.huntsPerDay,
    })
    await ninja.set({ sceneId: ARENA_VILLAGE })
    expect(errorCode(await post('hunt/begin'))).toBe('no_hunts')
  })
})

describe('Adventure with Jiraiya', () => {
  const joinClan = async () => {
    await ninja.set({ stone: 1_000_000, giftCoupon: 1_000 })
    const created = await post('clans/create', { name: 'Konoha' })
    expect(created.statusCode, created.body).toBe(200)
    return created.json().clan.id as string
  }
  const sendAway = (hours: number) =>
    db
      .update(jiraiyaAdventures)
      .set({ startedAt: new Date(Date.now() - hours * 3_600_000 - MINUTE) })
      .where(eq(jiraiyaAdventures.characterId, ninja.characterId))

  it('gives a special item 5% of the time from 12 hours and 10% from 24', () => {
    expect([0, 11, 12, 23, 24].map(specialChance)).toEqual([0, 0, 5, 5, 10])
  })

  it('needs a clan, and blocks battles and chain attacks while away', async () => {
    expect(errorCode(await post('adventure/start'))).toBe('no_clan')
    await joinClan()
    const { adventure } = await ok<{ adventure: AdventureView }>('adventure/start')
    expect(adventure).toMatchObject({ active: true, hours: 0 })
    expect(errorCode(await post('adventure/start'))).toBe('on_adventure')
    const refused = await fight()
    expect(errorCode(refused)).toBe('on_adventure')
    expect(refused.json().error.message).toBe(
      'You are on an adventure with Jiraiya! Return from your adventure first.',
    )
    expect(errorCode(await post('chain-attack', { monsterId: SUNFLOWER, amount: 1 }))).toBe(
      'on_adventure',
    )
  })

  it('pays EXP, Bankai EXP and Clan EXP per full hour (24 at most) on return', async () => {
    const clanId = await joinClan()
    await ok('adventure/start')
    await sendAway(30)
    const view = await get<AdventureView>('adventure')
    expect(view.hours).toBe(24)
    const before = await ninja.row()
    const result = await ok<AdventureReturnResult>('adventure/return')
    expect(result.totalHours).toBe(24)
    expect(result.rewards).toEqual({
      charExp: 24 * 30 * ADVENTURE_PLACEHOLDERS.charExpPerHourPerLevel,
      bankaiExp: 24 * ADVENTURE_PLACEHOLDERS.bankaiExpPerHour,
      clanExp: 24 * ADVENTURE_PLACEHOLDERS.clanExpPerHour,
    })
    expect(result.story.length).toBeGreaterThan(0)
    const after = await ninja.row()
    expect(after.level > before.level || after.exp > before.exp).toBe(true)
    const [bankai] = await db
      .select()
      .from(characterBankai)
      .where(eq(characterBankai.characterId, ninja.characterId))
    expect(bankai!.expPool).toBe(result.rewards.bankaiExp)
    const [progress] = await db.select().from(clanProgress).where(eq(clanProgress.clanId, clanId))
    expect(progress!.exp).toBe(result.rewards.clanExp)
    const specials = await ninja.bag(ADVENTURE_PLACEHOLDERS.specialItemId)
    expect(specials).toHaveLength(result.specialItem ? 1 : 0)
    expect((await get<AdventureView>('adventure')).active).toBe(false)
    expect(errorCode(await post('adventure/return'))).toBe('not_away')
    expect((await fight()).statusCode).toBe(200)
  })
})
