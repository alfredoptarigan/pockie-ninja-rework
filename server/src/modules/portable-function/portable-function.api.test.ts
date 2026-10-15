// Portable Function: Synthesis (ComposeSystem), Recast (AvatarSystem) and Impress
// (IdentifySystem) over Reborn's Compose window.
import { and, eq, isNull } from 'drizzle-orm'
import type { InventoryItemView } from '@pockie/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, inventoryItems, outfitRecasts } from '../../db/schema.js'
import { BAG_CELLS, itemCells } from '../../game/bag.js'
import { outfitBonuses } from '../../game/outfit.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

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
  await db.update(characters).set({ level: 15 }).where(eq(characters.id, characterId))
})
afterEach(() => app.close())
afterAll(() => close())

type Insert = typeof inventoryItems.$inferInsert
const giveItem = async (itemId: string, extra: Partial<Insert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const rowsOf = async (itemId: string) =>
  (
    await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId))
  ).filter((row) => row.itemId === itemId)
const held = async (itemId: string) =>
  (await rowsOf(itemId)).reduce((sum, row) => sum + row.count, 0)
const code = (response: { json: () => { error: { code: string } } }) => response.json().error.code

// i290001 Outfit +0 x3 makes its +1 (i290101), rate 100. i250101 a level 1 weapon (common group
// 1001, gold group 2001); i150302 Lucky Gem (JudgeValueScore 43); i141012 a quest item.
const OUTFIT = 'i290001'
const OUTFIT_2 = 'i290101'
const WEAPON = 'i250101'
const LUCKY_GEM = 'i150302'
/** A weapon with `lines` rolled properties (props 1, 21, 41, 61 of group 1001). */
const weapon = (lines: number, extra: Partial<Insert> = {}) =>
  giveItem(WEAPON, {
    canIdentify: lines > 0,
    identifyCount: lines,
    identifyTimes: lines > 0 ? 1 : 0,
    props: [1, 21, 41, 61].slice(0, lines).map((propId) => ({ propId, value: 3000 })),
    ...extra,
  })

describe('Synthesis', () => {
  const synth = (mainId: string, a: string, b: string) =>
    client.post('/api/game/portable-function/synthesis', { mainId, catalystIds: [a, b] })
  const preview = (mainId: string, a: string, b: string) =>
    client.post('/api/game/portable-function/synthesis/preview', { mainId, catalystIds: [a, b] })

  it('follows a recipe: three +0 outfits make the +1 and are used up', async () => {
    const [a, b, c] = [
      await giveItem(OUTFIT),
      await giveItem(OUTFIT, { bound: true }),
      await giveItem(OUTFIT),
    ]

    const shown = await preview(a.id, b.id, c.id)
    const made = await synth(a.id, b.id, c.id)

    expect(shown.json()).toEqual({
      kind: 'recipe',
      resultItemId: OUTFIT_2,
      resultNameKey: 'lg_avatar101',
      resultInfo: expect.objectContaining({
        outfit: expect.objectContaining({ clothing: 1, plus: 1 }),
      }),
      rate: 100,
    })
    expect(made.statusCode).toBe(200)
    expect(made.json()).toMatchObject({ success: true, resultItemId: OUTFIT_2 })
    expect(await rowsOf(OUTFIT)).toEqual([])
    // A bound source binds the result.
    expect(await rowsOf(OUTFIT_2)).toMatchObject([{ bound: true, equippedSlot: null }])
  })

  it('keeps a recast outfit ISV on the outfit it becomes', async () => {
    const [a, b, c] = [await giveItem(OUTFIT), await giveItem(OUTFIT), await giveItem(OUTFIT)]
    await db
      .insert(outfitRecasts)
      .values({ itemId: a.id, strength: 150, agility: 130, stamina: 121 })

    await synth(a.id, b.id, c.id)

    const [result] = await rowsOf(OUTFIT_2)
    const [recast] = await db
      .select()
      .from(outfitRecasts)
      .where(eq(outfitRecasts.itemId, result!.id))
    expect(recast).toMatchObject({ strength: 150, agility: 130, stamina: 121 })
  })

  it('makes random gear: one stack of Lucky Gems fills both catalysts and adds lines', async () => {
    const main = await weapon(2)
    const gems = await giveItem(LUCKY_GEM, { count: 3 })

    const shown = await preview(main.id, gems.id, gems.id)
    const made = await synth(main.id, gems.id, gems.id)

    expect(shown.json()).toEqual({
      kind: 'random',
      resultItemId: null,
      resultNameKey: null,
      resultInfo: null,
      rate: 100,
      value: { min: 39, max: 43, lines: [3, 3] },
    })
    const resultId = made.json().resultItemId as string
    expect(made.json().success).toBe(true)
    expect(await held(LUCKY_GEM)).toBe(1)
    const result = (await rowsOf(resultId)).find((row) => row.id !== main.id)!
    expect(result).toMatchObject({ identifyCount: 3, identifyTimes: 1 })
    expect(result.props).toHaveLength(3)
    expect((await rowsOf(WEAPON)).some((row) => row.id === main.id)).toBe(false)
  })

  it('refuses what Synthesis would destroy or cannot use, using nothing', async () => {
    const main = await weapon(1)
    const gems = await giveItem(LUCKY_GEM)
    const two = await giveItem(LUCKY_GEM, { count: 2 })
    const socketed = await weapon(1, { gems: ['i110101'] })
    const locked = await weapon(1, { locked: true })
    const worn = await weapon(1, { equippedSlot: 'Weapon' })
    const quest = await giveItem('i141012')

    expect(code(await synth(main.id, gems.id, gems.id))).toBe('not_enough')
    expect(code(await synth(socketed.id, two.id, two.id))).toBe('socketed')
    expect(code(await synth(locked.id, two.id, two.id))).toBe('locked')
    expect(code(await synth(worn.id, two.id, two.id))).toBe('worn')
    expect(code(await synth(quest.id, two.id, two.id))).toBe('cannot_synthesize')
    expect(code(await preview(main.id, two.id, quest.id))).toBe('cannot_synthesize')
    expect(await held(LUCKY_GEM)).toBe(3)
    expect(await rowsOf(WEAPON)).toHaveLength(4)
  })

  it('opens at level 15', async () => {
    await db.update(characters).set({ level: 14 }).where(eq(characters.id, characterId))
    const [a, b, c] = [await giveItem(OUTFIT), await giveItem(OUTFIT), await giveItem(OUTFIT)]
    expect(code(await synth(a.id, b.id, c.id))).toBe('too_low')
    expect(await rowsOf(OUTFIT)).toHaveLength(3)
  })

  it('checks bag room before using anything', async () => {
    const [a, b, c] = [await giveItem(OUTFIT), await giveItem(OUTFIT), await giveItem(OUTFIT)]
    const bag = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), isNull(inventoryItems.equippedSlot)))
    const free = BAG_CELLS - bag.reduce((sum, row) => sum + itemCells(row.itemId), 0)
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: free }, () => ({ characterId, itemId: 'i160001', count: 999 })))

    expect(code(await synth(a.id, b.id, c.id))).toBe('bag_full')
    expect(await rowsOf(OUTFIT)).toHaveLength(3)
  })
})

describe('Synthesis: outfit stars', () => {
  // i2932010: Ichigo at Reborn's top +N (+32), where its star rule applies.
  const TOP = 'i2932010'
  const synth = (mainId: string, a: string, b: string) =>
    client.post('/api/game/portable-function/synthesis', { mainId, catalystIds: [a, b] })
  const preview = (mainId: string, a: string, b: string) =>
    client.post('/api/game/portable-function/synthesis/preview', { mainId, catalystIds: [a, b] })
  const starsOf = async (id: string) =>
    (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]?.stars

  it('gives the main outfit one sure star and uses up two unstarred matching copies', async () => {
    const main = await giveItem(TOP, { stars: 2 })
    const [a, b] = [await giveItem(TOP), await giveItem(TOP)]

    const shown = await preview(main.id, a.id, b.id)
    const made = await synth(main.id, a.id, b.id)

    expect(shown.json()).toMatchObject({ kind: 'star', resultItemId: TOP, rate: 100, stars: 3 })
    expect(made.statusCode).toBe(200)
    expect(made.json()).toMatchObject({ success: true, resultItemId: TOP })
    expect(await starsOf(main.id)).toBe(3)
    expect(await starsOf(a.id)).toBeUndefined()
    expect(await starsOf(b.id)).toBeUndefined()
    const items = (await client.get('/api/game/inventory')).json().items as InventoryItemView[]
    expect(items.find((row) => row.id === main.id)!.info.outfit).toMatchObject({ stars: 3 })
  })

  it('refuses starred catalysts, a main outfit at five stars and outfits below the top +N', async () => {
    const main = await giveItem(TOP)
    const starred = await giveItem(TOP, { stars: 1 })
    const plain = await giveItem(TOP)
    expect(code(await synth(main.id, starred.id, plain.id))).toBe('starred_catalyst')

    const full = await giveItem(TOP, { stars: 5 })
    const other = await giveItem(TOP)
    expect(code(await synth(full.id, plain.id, other.id))).toBe('max_stars')

    const low = await giveItem('i2931010')
    expect(code(await synth(low.id, plain.id, other.id))).toBe('cannot_synthesize')
    expect(await starsOf(main.id)).toBe(0)
    expect(await starsOf(plain.id)).toBe(0)
  })
})

describe('Synthesis: outfits from before the +32 star rule', () => {
  it('refuses to upgrade a starred +31 (stars came at +31 before), so its stars are not lost', async () => {
    const main = await giveItem('i2931010', { stars: 2 })
    const [a, b] = [await giveItem('i290001'), await giveItem('i290001')]
    const made = await client.post('/api/game/portable-function/synthesis', {
      mainId: main.id,
      catalystIds: [a.id, b.id],
    })
    expect(code(made)).toBe('starred')
    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, main.id))
    expect(row).toMatchObject({ itemId: 'i2931010', stars: 2 })
  })
})

describe('Recast', () => {
  const outfitRow = async () =>
    (
      await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    ).find((row) => row.equippedSlot === 'Outfit')!
  const info = (itemId: string) => client.get(`/api/game/portable-function/recast/${itemId}`)
  const recast = (itemId: string, locked: number[]) =>
    client.post('/api/game/portable-function/recast', { itemId, locked })

  it('shows the ISV bounds and the talismans', async () => {
    const outfit = await outfitRow()
    await giveItem('i161007', { count: 4 })

    const response = await info(outfit.id)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ talismans: 4, canRecast: true })
    const { isv, base, max } = response.json()
    expect(isv).toEqual(base)
    expect(max.every((cap: number, stat: number) => cap >= base[stat])).toBe(true)
  })

  it('rerolls the free stats of the worn outfit, keeps the locked one and counts in the stats', async () => {
    const outfit = await outfitRow()
    await giveItem('i161007', { count: 6 })
    const before = (await client.get('/api/game/character')).json().stats
    const { base } = (await info(outfit.id)).json()

    const response = await recast(outfit.id, [0])

    expect(response.statusCode).toBe(200)
    const isv = response.json().isv as number[]
    expect(isv[0]).toBe(base[0])
    expect(await held('i161007')).toBe(1)
    const [stored] = await db
      .select()
      .from(outfitRecasts)
      .where(eq(outfitRecasts.itemId, outfit.id))
    expect([stored!.strength, stored!.agility, stored!.stamina]).toEqual(isv)
    const after = (await client.get('/api/game/character')).json().stats
    const bonus = outfitBonuses({ itemId: outfit.itemId, stars: 0, isv }, 15)
    expect(after.agility - before.agility).toBe(bonus.agility)
    expect(after.stamina - before.stamina).toBe(bonus.stamina)
    // The bag tooltip reads the recast ISV too.
    const items = (await client.get('/api/game/inventory')).json().items as InventoryItemView[]
    expect(items.find((row) => row.id === outfit.id)!.info.outfit!.isv).toEqual(isv)
  })

  it('needs enough talismans, a recastable outfit and at most two locks', async () => {
    const outfit = await outfitRow()
    await giveItem('i161007', { count: 4 })

    expect(code(await recast(outfit.id, [0, 1]))).toBe('no_talisman')
    expect(code(await recast((await weapon(0)).id, []))).toBe('cannot_recast')
    expect((await recast(outfit.id, [0, 1, 2])).statusCode).toBe(400)
    expect(await held('i161007')).toBe(4)
  })
})

describe('Impress', () => {
  // i350001 Carving Blade (items up to 30); i350101 Carving Crystal (+5 each, up to 30).
  const BLADE = 'i350001'
  const CRYSTAL = 'i350101'
  const preview = (body: object) => client.post('/api/game/portable-function/impress/preview', body)
  const impress = (body: object) => client.post('/api/game/portable-function/impress', body)

  it('adds a stat line at 100% with enough crystals, using only those it needs', async () => {
    const gear = await weapon(1)
    const blade = await giveItem(BLADE, { bound: true })
    const crystals = await giveItem(CRYSTAL, { count: 6 })
    const body = { itemId: gear.id, bladeId: blade.id, crystalId: crystals.id }

    const shown = await preview(body)
    const response = await impress(body)

    // Level 1-30 common rate 75, +5 per crystal: 5 crystals reach 100.
    expect(shown.json()).toEqual({ rate: 100, crystalsUsed: 5 })
    expect(response.json()).toMatchObject({ success: true })
    expect(response.json().item.gear.props).toHaveLength(2)
    const [row] = await rowsOf(WEAPON)
    expect(row).toMatchObject({ identifyCount: 2, bound: true })
    expect(await held(BLADE)).toBe(0)
    expect(await held(CRYSTAL)).toBe(1)
  })

  it('shows the base rate without crystals', async () => {
    const gear = await weapon(0)
    const blade = await giveItem(BLADE)
    expect((await preview({ itemId: gear.id, bladeId: blade.id })).json()).toEqual({
      rate: 75,
      crystalsUsed: 0,
    })
  })

  it('refuses full gear, a blade below the gear level and non-blades', async () => {
    const full = await weapon(4)
    const high = await giveItem('i210105', { canIdentify: false })
    const blade = await giveItem(BLADE)
    const notBlade = await giveItem(LUCKY_GEM)

    expect(code(await impress({ itemId: full.id, bladeId: blade.id }))).toBe('full')
    expect(code(await impress({ itemId: high.id, bladeId: blade.id }))).toBe('blade_level')
    expect(code(await impress({ itemId: (await weapon(1)).id, bladeId: notBlade.id }))).toBe(
      'not_blade',
    )
    expect(await held(BLADE)).toBe(1)
  })
})
