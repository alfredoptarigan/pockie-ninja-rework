// Clan Events: the clan level bar, Ninja Garden (plots, plant limit, growth on the server clock,
// harvest rewards, cooldown and scrolls, Random Level / Level Up Tree) and Picnic in Garden
// (unlock level, Stone / Gift Certificate / outfit contributions, the Monday claim).
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GARDEN_RULES,
  HOME_PLACEHOLDERS,
  PICNIC_RULES,
  type ClanLevelView,
  type GardenResult,
  type GardenView,
  type PicnicResult,
  type PicnicView,
} from '../../../../shared/src/schemas/home.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterBankai,
  characters,
  clanGardens,
  clanMembers,
  clanProgress,
  clans,
  inventoryItems,
  users,
} from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { gainClanExp } from './level.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => {
  vi.useRealTimers()
  return app.close()
})
afterAll(() => close())

type Response = Awaited<ReturnType<Client['get']>>
const code = (response: Response) => response.json().error?.code as string | undefined

/** A level-30 clan leader with currencies. */
async function leader({ clan = true } = {}) {
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: 'Player_1', email: 'player1@example.com', passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db
    .update(characters)
    .set({ level: 30, giftCoupon: 1_000, stone: 1_000_000, gold: 100 })
    .where(eq(characters.id, id))
  let clanId = ''
  if (clan)
    clanId = (await client.post('/api/game/clans/create', { name: 'Konoha' })).json().clan.id
  const get = <T>(path: string) =>
    client.get(`/api/game/clan-events${path}`).then((r) => r.json<T>())
  const post = (path: string, body: object = {}) =>
    client.post(`/api/game/clan-events/${path}`, body)
  const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
  return { client, id, clanId, get, post, row }
}
type Leader = Awaited<ReturnType<typeof leader>>

const bankai = async (id: string) =>
  (await db.select().from(characterBankai).where(eq(characterBankai.characterId, id)))[0]
const setClanLevel = (clanId: string, level: number) =>
  db.update(clans).set({ level }).where(eq(clans.id, clanId))

describe('clan level', () => {
  it('fills 35,000 x level per level, x3 from 9, x5 from 18, MAX at 20', () => {
    expect(gainClanExp(1, 34_900, 300)).toEqual({ level: 2, exp: 200 })
    expect(gainClanExp(9, 0, 35_000 * 9 * 3)).toEqual({ level: 10, exp: 0 })
    expect(gainClanExp(19, 35_000 * 19 * 5 - 1, 10)).toEqual({ level: 20, exp: 0 })
    expect(gainClanExp(20, 0, 1_000)).toEqual({ level: 20, exp: 0 })
  })

  it('needs a clan', async () => {
    const ninja = await leader({ clan: false })
    expect(code(await ninja.client.get('/api/game/clan-events'))).toBe('no_clan')
    expect(code(await ninja.post('garden/unlock', { plotIndex: 1 }))).toBe('no_clan')
  })

  it('shows the level bar', async () => {
    const ninja = await leader()
    expect(await ninja.get<ClanLevelView>('')).toEqual({ level: 1, exp: 0, next: 35_000 })
  })
})

describe('Ninja Garden', () => {
  let ninja: Leader
  beforeEach(async () => {
    ninja = await leader()
  })
  const garden = () => ninja.get<GardenView>('/garden')
  const ok = async (path: string, body: object) => {
    const response = await ninja.post(path, body)
    expect(response.statusCode, response.body).toBe(200)
    return response.json<GardenResult>()
  }
  const plots = async () =>
    (await db.select().from(clanGardens).where(eq(clanGardens.characterId, ninja.id)))[0]!.plots
  const ripen = async () =>
    db
      .update(clanGardens)
      .set({
        plots: (await plots()).map((p) => (p.tree ? { ...p, tree: { ...p.tree, readyAt: 1 } } : p)),
      })
      .where(eq(clanGardens.characterId, ninja.id))

  it('starts with plot 1 open, 18 scrolls and level 1 trees', async () => {
    const view = await garden()
    expect(view.plots).toHaveLength(9)
    expect(view.plots.map((p) => p.locked)).toEqual([false, ...Array(8).fill(true)])
    expect(view).toMatchObject({ scrolls: 18, plantsToday: 0, pendingLevel: 1 })
  })

  it('unlocks a plot for 250 Gift Certificates', async () => {
    const result = await ok('garden/unlock', { plotIndex: 4 })
    expect(result.garden.plots[4]!.locked).toBe(false)
    expect(result.character.giftCoupon).toBe(1_000 - GARDEN_RULES.unlockCost)
    expect(code(await ninja.post('garden/unlock', { plotIndex: 4 }))).toBe('unlocked')
    await db.update(characters).set({ giftCoupon: 249 }).where(eq(characters.id, ninja.id))
    expect(code(await ninja.post('garden/unlock', { plotIndex: 5 }))).toBe('not_enough')
  })

  it('plants, grows on the server clock, harvests and rests the plot', async () => {
    expect(
      code(await ninja.post('garden/plant', { plotIndex: 1, treeLevel: 1, treeType: 'money' })),
    ).toBe('locked')
    expect(
      code(await ninja.post('garden/plant', { plotIndex: 0, treeLevel: 2, treeType: 'money' })),
    ).toBe('stale_level')
    const before = Date.now()
    const planted = await ok('garden/plant', { plotIndex: 0, treeLevel: 1, treeType: 'money' })
    expect(planted.garden.plots[0]!.tree).toMatchObject({ type: 'money', level: 1 })
    expect(planted.garden.plots[0]!.tree!.readyAt).toBeGreaterThanOrEqual(before + 2 * 3_600_000)
    expect(planted.garden.plantsToday).toBe(1)
    expect(code(await ninja.post('garden/harvest', { plotIndex: 0 }))).toBe('not_ready')

    await ripen()
    const harvested = await ok('garden/harvest', { plotIndex: 0 })
    expect(harvested.harvest).toEqual({
      type: 'money',
      level: 1,
      clanHonor: 300,
      coins: 240,
      bankaiExp: 0,
    })
    expect(await bankai(ninja.id)).toMatchObject({ coins: 240, expPool: 0 })
    expect(harvested.garden.clan).toEqual({ level: 1, exp: 300, next: 35_000 })
    const [member] = await db
      .select()
      .from(clanMembers)
      .where(eq(clanMembers.characterId, ninja.id))
    expect(member).toMatchObject({ weeklyPoints: 300, totalPoints: 300 })

    const rest = harvested.garden.plots[0]!.cooldownUntil
    expect(rest).toBeGreaterThanOrEqual(
      Date.now() + HOME_PLACEHOLDERS.gardenCooldownMinutes * 60_000 - 5_000,
    )
    expect(
      code(await ninja.post('garden/plant', { plotIndex: 0, treeLevel: 1, treeType: 'zenpakuto' })),
    ).toBe('cooldown')
    const skipped = await ok('garden/skip', { plotIndex: 0 })
    expect(skipped.garden).toMatchObject({ scrolls: 17 })
    expect(skipped.garden.plots[0]!.cooldownUntil).toBe(0)
    expect(code(await ninja.post('garden/skip', { plotIndex: 0 }))).toBe('no_cooldown')
  })

  it('allows two plantings a day', async () => {
    await ok('garden/unlock', { plotIndex: 1 })
    await ok('garden/unlock', { plotIndex: 2 })
    await ok('garden/plant', { plotIndex: 0, treeLevel: 1, treeType: 'zenpakuto' })
    await ok('garden/plant', { plotIndex: 1, treeLevel: 1, treeType: 'zenpakuto' })
    expect(
      code(await ninja.post('garden/plant', { plotIndex: 2, treeLevel: 1, treeType: 'zenpakuto' })),
    ).toBe('daily_limit')
    await ripen()
    await ok('garden/harvest', { plotIndex: 1 })
    expect(await bankai(ninja.id)).toMatchObject({ coins: 0, expPool: 1150 })
  })

  it('rerolls and levels up the next tree, paid and checked', async () => {
    const rolled = await ok('garden/reroll', { payWith: 'stones' })
    expect(rolled.character.stone).toBe(1_000_000 - GARDEN_RULES.reroll.stones)
    const level = rolled.garden.pendingLevel
    expect(level).toBeGreaterThanOrEqual(1)
    expect(level).toBeLessThanOrEqual(5)
    await db
      .update(clanGardens)
      .set({ pendingLevel: 3 })
      .where(eq(clanGardens.characterId, ninja.id))
    expect(code(await ninja.post('garden/level-up', { currentLevel: 2, payWith: 'gc' }))).toBe(
      'stale_level',
    )
    const up = await ok('garden/level-up', { currentLevel: 3, payWith: 'gold' })
    expect(up.garden.pendingLevel).toBe(4)
    expect(up.character.gold).toBe(100 - GARDEN_RULES.levelUp.gold)
    await ok('garden/level-up', { currentLevel: 4, payWith: 'gc' })
    expect(code(await ninja.post('garden/level-up', { currentLevel: 5, payWith: 'gc' }))).toBe(
      'max_level',
    )
    const planted = await ok('garden/plant', { plotIndex: 0, treeLevel: 5, treeType: 'zenpakuto' })
    expect(planted.garden.plots[0]!.tree!.level).toBe(5)
    expect(planted.garden.pendingLevel).toBe(1)
  })
})

describe('Picnic in Garden', () => {
  let ninja: Leader
  beforeEach(async () => {
    ninja = await leader()
  })
  const picnic = () => ninja.get<PicnicView>('/picnic')
  const ok = async (path: string, body: object = {}) => {
    const response = await ninja.post(path, body)
    expect(response.statusCode, response.body).toBe(200)
    return response.json<PicnicResult>()
  }

  it('opens at clan level 4', async () => {
    expect(await picnic()).toMatchObject({ unlocked: false, unlockLevel: 4, clanLevel: 1 })
    expect(code(await ninja.post('picnic/stone'))).toBe('picnic_locked')
  })

  it('takes Stones, Gift Certificates and outfits into the warehouse and the leaderboard', async () => {
    await setClanLevel(ninja.clanId, 4)
    const stone = await ok('picnic/stone')
    expect(stone.pointsAdded).toBe(PICNIC_RULES.stone.points)
    expect(stone.character.stone).toBe(1_000_000 - PICNIC_RULES.stone.cost)
    const gift = await ok('picnic/gift-certificates')
    expect(gift.character.giftCoupon).toBe(1_000 - PICNIC_RULES.giftCoupon.cost)

    const [outfit] = await db
      .insert(inventoryItems)
      .values({ characterId: ninja.id, itemId: 'i291101' }) // an outfit +12
      .returning()
    const given = await ok('picnic/outfit', { uid: outfit!.id })
    expect(given.pointsAdded).toBe(3)
    expect(
      await db.select().from(inventoryItems).where(eq(inventoryItems.id, outfit!.id)),
    ).toHaveLength(0)
    expect(given.picnic).toMatchObject({ warehousePoints: 43, isFull: false })
    expect(given.picnic.contributions).toEqual([
      { characterId: ninja.id, name: 'Ninja_01', points: 43 },
    ])

    const [worn] = await db
      .insert(inventoryItems)
      .values({ characterId: ninja.id, itemId: 'i291101', equippedSlot: 'Outfit', equippedSet: 2 })
      .returning()
    expect(code(await ninja.post('picnic/outfit', { uid: worn!.id }))).toBe('not_outfit')
    await db.update(characters).set({ stone: 0 }).where(eq(characters.id, ninja.id))
    expect(code(await ninja.post('picnic/stone'))).toBe('not_enough')
  })

  it('claims last week’s full warehouse on Monday, once', async () => {
    await setClanLevel(ninja.clanId, 4)
    await db.insert(clanProgress).values({
      clanId: ninja.clanId,
      picnicWeek: '2026-10-12',
      picnicPoints: HOME_PLACEHOLDERS.picnicRequirement,
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z')) // a Monday two weeks on: nothing to claim
    expect(code(await ninja.post('picnic/claim'))).toBe('not_full')
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z')) // the Tuesday after
    expect(code(await ninja.post('picnic/claim'))).toBe('not_monday')
    vi.setSystemTime(new Date('2026-10-19T09:00:00Z')) // the Monday after
    const view = await picnic()
    expect(view).toMatchObject({ lastWeekFull: true, canClaim: true, warehousePoints: 0 })
    const claimed = await ok('picnic/claim')
    expect(claimed.claimed).toEqual({ boxes: 1, refineTalismans: 40, bankaiCoins: 16_000 })
    expect(await bankai(ninja.id)).toMatchObject({ coins: 16_000 })
    const talismans = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, ninja.id))
    expect(
      talismans.filter((r) => r.itemId === 'i161004').reduce((sum, r) => sum + r.count, 0),
    ).toBe(40)
    expect(claimed.picnic).toMatchObject({ canClaim: false, alreadyClaimedThisWeek: true })
    expect(code(await ninja.post('picnic/claim'))).toBe('claimed')
  })
})
