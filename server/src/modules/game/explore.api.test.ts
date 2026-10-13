import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterExploreSpots,
  characters,
  exploreSearches,
  inventoryItems,
} from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

const COOLDOWN_MS = 300_000
const today = () => new Date().toISOString().slice(0, 10)

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
  // Forge Highlands (2101) has spots 21011 (free) and 21012 (needs key i150046).
  await setCharacter({ sceneId: 2101 })
})
afterEach(() => app.close())
afterAll(() => close())

async function setCharacter(values: Partial<typeof characters.$inferInsert>) {
  await db.update(characters).set(values).where(eq(characters.id, characterId))
}
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const explore = (spotId: string) => client.post(`/api/game/explore/${spotId}`)
const errorCode = (response: Awaited<ReturnType<typeof explore>>) => response.json().error.code

describe('GET /api/game/explore', () => {
  it('lists the scene’s spots with the daily count and no cooldown', async () => {
    const response = await client.get('/api/game/explore')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      remaining: 7,
      total: 7,
      cooldownEndsAt: null,
      // OutSearchCommon.ini OutSearchTimeSpace.
      cooldownSeconds: 300,
      spots: [
        {
          id: '21011',
          senior: null,
          nameKey: 'lg_OutSearch_21011',
          // roleoutsearch.tab ClipName: the field's explore tree.
          clipName: 'OutCity_1110',
          requireLevel: 1,
          requireStone: 0,
          requireItems: [],
          star: { level: 0, progress: 0, perStar: 2 },
        },
        {
          id: '21012',
          senior: { itemId: 'i150046', level: 1 },
          nameKey: 'lg_OutSearch_21012',
          clipName: null,
          requireLevel: 1,
          requireStone: 0,
          requireItems: [{ itemId: 'i150046', count: 1 }],
          star: { level: 0, progress: 0, perStar: 4 },
        },
      ],
    })
  })

  it('requires a login', async () => {
    const anonymous = new Client(app)
    expect((await anonymous.get('/api/game/explore')).statusCode).toBe(401)
  })
})

describe('POST /api/game/explore/:spotId', () => {
  it('searches a spot: five cards, the first is paid out, cooldown and count are used', async () => {
    const before = await row()
    const response = await explore('21011')

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.spotId).toBe('21011')
    expect(body.star).toEqual({ level: 0, progress: 1, perStar: 2 })
    expect(body.starBonus).toBeNull()
    expect(body.otherCards).toHaveLength(4)
    // No tutorial step is an explore, so nothing is handed in.
    expect(body).toMatchObject({ completed: [], questRewards: [] })
    expect(['fight', 'stone', 'pet', 'boss', 'item', 'key', 'nothing']).toContain(body.card.type)
    expect(body.explore.remaining).toBe(6)
    expect(Date.parse(body.explore.cooldownEndsAt) - Date.now()).toBeGreaterThan(
      COOLDOWN_MS - 10_000,
    )

    // What the response says was earned is what the character got.
    const after = await row()
    expect(after.stone).toBe(before.stone + body.rewards.stone)
    expect(body.character.stone).toBe(after.stone)
    if (body.card.type === 'stone') expect(body.rewards.stone).toBe(671)
    if (body.card.type === 'fight') expect(body.fight.won).toBeTypeOf('boolean')
    else expect(body.fight).toBeNull()
    const bag = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, characterId))
    expect(bag.reduce((sum, item) => sum + item.count, 0)).toBe(body.rewards.items.length)
    expect(after).toMatchObject({ exploreUsed: 1, exploreDay: today() })
  })

  it('refuses a second search before the 300 s cooldown, including a replayed request', async () => {
    expect((await explore('21011')).statusCode).toBe(200)
    const replay = await explore('21011')
    expect(replay.statusCode).toBe(400)
    expect(errorCode(replay)).toBe('cooldown')
    await setCharacter({ exploreLastAt: new Date(Date.now() - COOLDOWN_MS + 5_000) })
    expect(errorCode(await explore('21011'))).toBe('cooldown')
    expect((await row()).exploreUsed).toBe(1)
  })

  it('allows the next search once the cooldown has passed', async () => {
    await setCharacter({ exploreLastAt: new Date(Date.now() - COOLDOWN_MS - 1_000) })
    expect((await explore('21011')).statusCode).toBe(200)
  })

  it('lets only one of two simultaneous searches through', async () => {
    const responses = await Promise.all([explore('21011'), explore('21011')])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await row()).exploreUsed).toBe(1)
  })

  it('stops at 7 + level / 10 searches a day', async () => {
    await setCharacter({ exploreDay: today(), exploreUsed: 7 })
    const response = await explore('21011')
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('daily_limit')

    await setCharacter({ level: 10 })
    expect((await explore('21011')).json().explore).toMatchObject({ remaining: 0, total: 8 })
  })

  it('resets the daily count on a new day', async () => {
    await setCharacter({ exploreDay: '2020-01-01', exploreUsed: 7 })
    const response = await explore('21011')
    expect(response.statusCode).toBe(200)
    expect(response.json().explore.remaining).toBe(6)
    expect(await row()).toMatchObject({ exploreUsed: 1, exploreDay: today() })
  })

  it('only searches spots in the current scene', async () => {
    await setCharacter({ sceneId: 111 })
    const response = await explore('21011')
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('not_here')
  })

  it('rejects spot ids that do not exist', async () => {
    expect((await explore('99999')).statusCode).toBe(404)
    expect((await explore('abc')).statusCode).toBe(400)
    expect((await explore('1e5')).statusCode).toBe(400)
  })

  it('checks the spot’s level', async () => {
    await setCharacter({ sceneId: 2102 })
    const response = await explore('21021')
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('too_low')
  })

  it('needs and consumes the spot’s key item', async () => {
    const refused = await explore('21012')
    expect(refused.statusCode).toBe(400)
    expect(errorCode(refused)).toBe('missing_item')
    expect((await row()).exploreLastAt).toBeNull()

    await db.insert(inventoryItems).values({ characterId, itemId: 'i150046', count: 2 })
    const response = await explore('21012')
    expect(response.statusCode).toBe(200)
    // A key card may hand out the same key again.
    const won = response
      .json()
      .rewards.items.filter((item: { itemId: string }) => item.itemId === 'i150046').length
    const keys = await db.select().from(inventoryItems).where(eq(inventoryItems.itemId, 'i150046'))
    expect(keys.reduce((sum, key) => sum + key.count, 0)).toBe(1 + won)
  })

  it('raises the star level every StarUp searches and rolls the star bonus', async () => {
    await db
      .insert(characterExploreSpots)
      .values({ characterId, spotId: 21011, starLevel: 0, starProgress: 1 })
    const before = await row()

    const body = (await explore('21011')).json()

    expect(body.star).toEqual({ level: 1, progress: 0, perStar: 2 })
    expect(['exp', 'pet']).toContain(body.starBonus.type)
    if (body.starBonus.type === 'exp') {
      expect(body.starBonus.exp).toBe(115)
      expect(body.rewards.exp).toBeGreaterThanOrEqual(115)
      expect((await row()).level).toBeGreaterThan(before.level)
    }
  })
})

const startSearch = (spotId = '21011', mode = 'normal') =>
  client.post(`/api/game/explore/${spotId}`, { action: 'start', mode })
const peek = (searchId: string, cardIndex: number, currency = 'gold', spotId = '21011') =>
  client.post(`/api/game/explore/${spotId}/peek`, { searchId, cardIndex, currency })
const pick = (searchId: string, cardIndex: number, spotId = '21011') =>
  client.post(`/api/game/explore/${spotId}`, { action: 'pick', searchId, cardIndex })

describe('pending searches and paid peeks', () => {
  it('starts five face-down cards without paying out the selected card', async () => {
    const body = (await startSearch()).json()
    expect(body.cards).toEqual([null, null, null, null, null])
    expect(body.searchId).toBeTypeOf('string')
    expect(body.peek).toEqual({ count: 0, limit: 3, cost: { currency: 'stone', amount: 83 } })
    expect(body.character.stone).toBe(0)
    expect(body.explore.remaining).toBe(6)
    expect((await startSearch()).json().error.code).toBe('search_pending')
    expect((await client.get('/api/game/explore')).json().pending.searchId).toBe(body.searchId)
  })

  it('keeps the pending cards and peeks across a server restart (decision 11)', async () => {
    await setCharacter({ stone: 500 })
    const { searchId } = (await startSearch()).json()
    const peeked = (await peek(searchId, 2)).json().cards[2]

    // A new process: nothing in memory, the same session.
    const cookies = client.cookieHeader
    const csrf = client.csrfToken
    await app.close()
    app = buildTestApp(db)
    client = new Client(app)
    for (const pair of cookies.split('; ')) {
      const [name = '', value = ''] = pair.split('=')
      client.setCookie(name, value)
    }
    client.csrfToken = csrf

    const pending = (await client.get('/api/game/explore')).json().pending
    expect(pending).toMatchObject({ searchId, peek: { count: 1 } })
    expect(pending.cards[2]).toEqual(peeked)
    const picked = await pick(searchId, 2)
    expect(picked.statusCode).toBe(200)
    expect(picked.json().card).toMatchObject(peeked)
    expect((await client.get('/api/game/explore')).json().pending).toBeUndefined()
  })

  it('charges Stone then coupons or Gold, retains revealed cards and enforces the peek limit', async () => {
    await setCharacter({ stone: 500, gold: 20, giftCoupon: 10 })
    const { searchId } = (await startSearch()).json()
    const first = await peek(searchId, 4)
    expect(first.statusCode).toBe(200)
    expect(first.json().cards[4]).not.toBeNull()
    expect((await row()).stone).toBe(417)
    expect((await peek(searchId, 4)).statusCode).toBe(200)
    expect((await row()).stone).toBe(417)
    expect((await peek(searchId, 0, 'giftCoupon')).statusCode).toBe(200)
    expect((await row()).giftCoupon).toBe(8)
    expect(errorCode(await peek(searchId, 1, 'giftCoupon'))).toBe('invalid_currency')
    expect((await peek(searchId, 1)).statusCode).toBe(200)
    expect((await row()).gold).toBe(13)
    expect(errorCode(await peek(searchId, 2))).toBe('peek_limit')
    const picked = await pick(searchId, 4)
    expect(picked.statusCode).toBe(200)
    expect(picked.json().card).toMatchObject(first.json().cards[4])
    expect(picked.json().otherCards).toHaveLength(4)
    expect((await row()).exploreUsed).toBe(1)
    expect(errorCode(await pick(searchId, 4))).toBe('no_search')
  })

  it('refuses unaffordable peeks without revealing cards or consuming a peek', async () => {
    const { searchId } = (await startSearch()).json()
    expect(errorCode(await peek(searchId, 0))).toBe('no_stone')
    await setCharacter({ stone: 83 })
    const response = await peek(searchId, 0)
    expect(response.statusCode).toBe(200)
    expect(response.json().peek.count).toBe(1)
    expect(errorCode(await peek(searchId, 1))).toBe('no_gold')
  })

  it('serializes duplicate peeks and picks, awarding only once', async () => {
    await setCharacter({ stone: 1000 })
    const { searchId } = (await startSearch()).json()
    const peeks = await Promise.all([peek(searchId, 1), peek(searchId, 1)])
    expect(peeks.map((r) => r.statusCode)).toEqual([200, 200])
    expect((await row()).stone).toBe(917)
    const picks = await Promise.all([pick(searchId, 1), pick(searchId, 1)])
    expect(picks.map((r) => r.statusCode).sort()).toEqual([200, 400])
  })

  it('validates card indexes, search identity, spot and login', async () => {
    const { searchId } = (await startSearch()).json()
    expect((await peek(searchId, -1)).statusCode).toBe(400)
    expect((await peek(searchId, 5)).statusCode).toBe(400)
    expect((await peek(searchId, 1.5)).statusCode).toBe(400)
    expect((await peek('forged', 0)).statusCode).toBe(400)
    expect(errorCode(await peek(searchId, 0, 'gold', '21012'))).toBe('no_search')
    const anonymous = new Client(app)
    expect(
      (await anonymous.post('/api/game/explore/21011/peek', { searchId, cardIndex: 0 })).statusCode,
    ).toBe(401)
    await setCharacter({ sceneId: 2201 })
    expect(errorCode(await peek(searchId, 0))).toBe('not_here')
    expect(errorCode(await pick(searchId, 0))).toBe('not_here')
  })
})

describe('senior searches', () => {
  it('consumes a mapped key, bypasses scene, daily quota and cooldown, and still has five cards', async () => {
    await setCharacter({
      sceneId: 2201,
      exploreDay: today(),
      exploreUsed: 7,
      exploreLastAt: new Date(),
    })
    await db.insert(inventoryItems).values({ characterId, itemId: 'i150046', count: 2 })
    const before = await row()
    const response = await startSearch('21012', 'senior')
    expect(response.statusCode).toBe(200)
    expect(response.json().cards).toHaveLength(5)
    expect(await row()).toMatchObject({ exploreUsed: 7, exploreLastAt: before.exploreLastAt })
    expect(
      (await db.select().from(inventoryItems).where(eq(inventoryItems.itemId, 'i150046')))[0]!
        .count,
    ).toBe(1)
    expect((await pick(response.json().searchId, 0, '21012')).statusCode).toBe(200)
  })

  it('requires the mapped key and its UseLevel and refuses the original forbidden scenes', async () => {
    expect(errorCode(await startSearch('21012', 'senior'))).toBe('missing_item')
    await db.insert(inventoryItems).values({ characterId, itemId: 'i150066' })
    expect(errorCode(await startSearch('27012', 'senior'))).toBe('too_low')
    await setCharacter({ level: 46, sceneId: 111 })
    expect(errorCode(await startSearch('27012', 'senior'))).toBe('not_here')
    await setCharacter({ sceneId: 2101 })
    expect(errorCode(await startSearch('21011', 'senior'))).toBe('no_senior_key')
  })
})

describe('explore bag guard', () => {
  it('reserves the original six cells before spending a search or key', async () => {
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 115 }, () => ({ characterId, itemId: 'i160006' })))
    const response = await startSearch()
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatchObject({
      code: 'bag_full',
      message: 'Your bag is full. Free at least six cells before exploring.',
    })
    expect(await row()).toMatchObject({ exploreUsed: 0, exploreLastAt: null })
  })
})

it('grants explore item-card equipment with the original plain identify defaults', async () => {
  const { searchId } = (await startSearch()).json()
  await db
    .update(exploreSearches)
    .set({
      cards: Array.from({ length: 5 }, () => ({ type: 'item', itemId: 'i250101', bound: true })),
    })
    .where(eq(exploreSearches.characterId, characterId))
  const response = await pick(searchId, 0)
  expect(response.statusCode).toBe(200)
  const [gear] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))
  expect(gear).toMatchObject({
    itemId: 'i250101',
    bound: true,
    canIdentify: false,
    identifyCount: 0,
    identifyTimes: 0,
    props: [],
  })
})
