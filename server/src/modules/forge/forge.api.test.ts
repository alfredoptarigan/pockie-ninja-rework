// Forge actions (docs/original-data/blacksmith.md): appraise, refine, enhance, inscribe, repair.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, inventoryItems } from '../../db/schema.js'

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
  // Clothing 3: Ggio Vega (fists).
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
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
const itemRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]
const characterRow = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const setMoney = (money: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(money).where(eq(characters.id, characterId))
const gear = async (id: string) => (await client.get('/api/game/forge/gear')).json().gear[id]
const errorCode = (response: { json: () => { error: { code: string } } }) =>
  response.json().error.code

/** An unappraised item with 2 hidden properties. */
const hidden = { canIdentify: true, identifyCount: 2, identifyTimes: 0 }

describe('GET /api/game/forge', () => {
  it('lists costs, rates and the talismans in the bag', async () => {
    await giveItem('i161003', { count: 2, bound: true })
    await giveItem('i161008', { count: 5 })
    const body = (await client.get('/api/game/forge')).json()
    expect(body).toMatchObject({
      enhanceCost: 8,
      refineCost: 8,
      sealOdds: { low: 3, high: 6 },
      talismans: { enhance: 2, refine: 0, lowSeal: 5, highSeal: 0 },
    })
    expect(body.enhanceRates).toMatchObject({ '1': 100, '2': 67, '12': 1 })
    expect(body.inscribeLevels['11']).toMatchObject({ BaseOdds: 3, StoneCost: 1200 })
  })

  it('requires a login', async () => {
    expect((await new Client(app).get('/api/game/forge')).statusCode).toBe(401)
  })
})

describe('POST /api/game/forge/appraise', () => {
  it('rolls the properties for (int)(-0.0009 L^2 + 0.27 L + 12) Stone: L30 = 19', async () => {
    // i282607: a level 30 ring with an identify list.
    const ring = await giveItem('i282607', hidden)
    await setMoney({ stone: 100 })
    expect((await gear(ring.id)).appraiseCost).toBe(19)

    const response = await client.post('/api/game/forge/appraise', { itemId: ring.id })

    expect(response.statusCode).toBe(200)
    expect(response.json().character.stone).toBe(81)
    const row = await itemRow(ring.id)
    expect(row).toMatchObject({ identifyTimes: 1 })
    expect(row!.props).toHaveLength(2)
    expect(response.json().item.gear).toMatchObject({ appraised: true })
  })

  it('refuses without enough Stone and charges nothing', async () => {
    const ring = await giveItem('i282607', hidden)
    await setMoney({ stone: 18 })
    const response = await client.post('/api/game/forge/appraise', { itemId: ring.id })
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('no_money')
    expect(await itemRow(ring.id)).toMatchObject({ identifyTimes: 0 })
    expect((await characterRow()).stone).toBe(18)
  })

  it('refuses an item already appraised and items that are not equipment', async () => {
    const ring = await giveItem('i282607')
    expect(errorCode(await client.post('/api/game/forge/appraise', { itemId: ring.id }))).toBe(
      'cannot_appraise',
    )
    const potion = await giveItem('i160006')
    expect(errorCode(await client.post('/api/game/forge/appraise', { itemId: potion.id }))).toBe(
      'wrong_item',
    )
  })

  it('cannot touch another player’s item or a malformed id', async () => {
    const missing = await client.post('/api/game/forge/appraise', {
      itemId: '00000000-0000-7000-8000-000000000000',
    })
    expect(missing.statusCode).toBe(404)
    expect((await client.post('/api/game/forge/appraise', { itemId: 'x' })).statusCode).toBe(400)
  })
})

describe('POST /api/game/forge/appraise-all', () => {
  it('appraises every hidden item on the page for the summed cost', async () => {
    const ring = await giveItem('i282607', hidden)
    const fists = await giveItem('i270100', hidden)
    const plain = await giveItem('i270100')
    await setMoney({ stone: 100 })

    const response = await client.post('/api/game/forge/appraise-all', {
      itemIds: [ring.id, fists.id, plain.id],
    })

    expect(response.statusCode).toBe(200)
    // 19 (level 30) + 12 (level 1).
    expect(response.json().character.stone).toBe(100 - 31)
    expect(response.json().appraised).toEqual([ring.id, fists.id])
    expect(await itemRow(fists.id)).toMatchObject({ identifyTimes: 1 })
  })

  it('refuses when the total is more than the Stone, appraising nothing', async () => {
    const ring = await giveItem('i282607', hidden)
    const fists = await giveItem('i270100', hidden)
    await setMoney({ stone: 30 })
    const response = await client.post('/api/game/forge/appraise-all', {
      itemIds: [ring.id, fists.id],
    })
    expect(errorCode(response)).toBe('no_money')
    expect(await itemRow(ring.id)).toMatchObject({ identifyTimes: 0 })
  })

  it('says so when nothing needs appraising', async () => {
    const plain = await giveItem('i270100')
    const response = await client.post('/api/game/forge/appraise-all', { itemIds: [plain.id] })
    expect(errorCode(response)).toBe('nothing_to_appraise')
  })
})

describe('POST /api/game/forge/enhance', () => {
  it('raises Mythbeast Bat 34-41 to +1 35-43 for 8 Gold (FailRate 0 never fails)', async () => {
    const bat = await giveItem('i250104')
    await setMoney({ gold: 10 })

    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'gold',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ success: true, character: { gold: 2 } })
    expect(response.json().item.gear).toMatchObject({
      enhanceLevel: 1,
      attack: { min: 35, max: 43 },
    })
    expect(await itemRow(bat.id)).toMatchObject({ enhanceLevel: 1, bound: false })
  })

  it('shows +12 as 54-66 and refuses to go past the cap', async () => {
    const bat = await giveItem('i250104', { enhanceLevel: 12 })
    await setMoney({ gold: 10 })
    expect((await gear(bat.id)).attack).toEqual({ min: 54, max: 66 })
    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'gold',
    })
    expect(errorCode(response)).toBe('max_level')
    expect((await characterRow()).gold).toBe(10)
  })

  it('adds flat HP per level on armour (i220102: 4 per level)', async () => {
    const hat = await giveItem('i220102')
    await setMoney({ gold: 8 })
    await client.post('/api/game/forge/enhance', { itemId: hat.id, payment: 'gold' })
    expect((await gear(hat.id)).maxHp).toBe(4)
  })

  it('binds the item when paid with Gift Coupons', async () => {
    const bat = await giveItem('i250104')
    await setMoney({ giftCoupon: 8, gold: 0 })
    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'giftCoupon',
    })
    expect(response.json().character).toMatchObject({ giftCoupon: 0, gold: 0 })
    expect(await itemRow(bat.id)).toMatchObject({ enhanceLevel: 1, bound: true })
  })

  it('uses an Enhance Talisman, binding the item when the talisman is bound', async () => {
    const bat = await giveItem('i250104')
    const talisman = await giveItem('i161003', { count: 2, bound: true })
    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'talisman',
    })
    expect(response.statusCode).toBe(200)
    expect(await itemRow(talisman.id)).toMatchObject({ count: 1 })
    expect(await itemRow(bat.id)).toMatchObject({ enhanceLevel: 1, bound: true })
  })

  it('refuses without the currency or the talisman', async () => {
    const bat = await giveItem('i250104')
    await setMoney({ gold: 7, giftCoupon: 7 })
    for (const payment of ['gold', 'giftCoupon']) {
      const response = await client.post('/api/game/forge/enhance', { itemId: bat.id, payment })
      expect(errorCode(response)).toBe('no_money')
    }
    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'talisman',
    })
    expect(errorCode(response)).toBe('no_talisman')
    expect(await itemRow(bat.id)).toMatchObject({ enhanceLevel: 0 })
  })

  it('refuses rings, non-equipment and unappraised gear', async () => {
    await setMoney({ gold: 100 })
    const ring = await giveItem('i300111')
    const potion = await giveItem('i160006')
    const unappraised = await giveItem('i250104', hidden)
    const enhance = (id: string) =>
      client.post('/api/game/forge/enhance', { itemId: id, payment: 'gold' })
    expect(errorCode(await enhance(ring.id))).toBe('wrong_item')
    expect(errorCode(await enhance(potion.id))).toBe('wrong_item')
    expect(errorCode(await enhance(unappraised.id))).toBe('unappraised')
    expect((await characterRow()).gold).toBe(100)
  })

  it('rejects an unknown payment', async () => {
    const bat = await giveItem('i250104')
    const response = await client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'stone',
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('POST /api/game/forge/refine', () => {
  it('re-rolls the properties for 8 Gold', async () => {
    const fists = await giveItem('i270100', { ...hidden, identifyTimes: 1 })
    await setMoney({ gold: 8 })
    const response = await client.post('/api/game/forge/refine', {
      itemId: fists.id,
      payment: 'gold',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().character.gold).toBe(0)
    const row = await itemRow(fists.id)
    expect(row).toMatchObject({ identifyTimes: 2, bound: false })
    expect(row!.props).toHaveLength(2)
  })

  it('binds on Gift Coupons and spends a Refine Talisman', async () => {
    const fists = await giveItem('i270100', { ...hidden, identifyTimes: 1 })
    await setMoney({ giftCoupon: 8 })
    await client.post('/api/game/forge/refine', { itemId: fists.id, payment: 'giftCoupon' })
    expect(await itemRow(fists.id)).toMatchObject({ bound: true, identifyTimes: 2 })

    const talisman = await giveItem('i161004', { bound: false })
    const response = await client.post('/api/game/forge/refine', {
      itemId: fists.id,
      payment: 'talisman',
    })
    expect(response.statusCode).toBe(200)
    expect(await itemRow(talisman.id)).toBeUndefined()
  })

  it('refuses unappraised gear, gear without properties and missing money', async () => {
    await setMoney({ gold: 100 })
    const unappraised = await giveItem('i270100', hidden)
    const white = await giveItem('i270100')
    const refine = (id: string) =>
      client.post('/api/game/forge/refine', { itemId: id, payment: 'gold' })
    expect(errorCode(await refine(unappraised.id))).toBe('unappraised')
    expect(errorCode(await refine(white.id))).toBe('no_props')
    await setMoney({ gold: 7 })
    const appraised = await giveItem('i270100', { ...hidden, identifyTimes: 1 })
    expect(errorCode(await refine(appraised.id))).toBe('no_money')
  })
})

describe('POST /api/game/forge/inscribe', () => {
  it('reaches +1 with 2 Low Seals (94 + 2 x 3 = 100) for 60 Stone and keeps the third', async () => {
    const bat = await giveItem('i250104')
    const seals = await giveItem('i161008', { count: 3 })
    await setMoney({ stone: 60 })

    const response = await client.post('/api/game/forge/inscribe', {
      itemId: bat.id,
      seal: 'low',
      seals: 3,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ success: true, sealsUsed: 2, character: { stone: 0 } })
    expect(response.json().item.gear.inscription).toEqual([
      { name: 'MaxAtkEquip', value: 2 },
      { name: 'MinAtkEquip', value: 2 },
    ])
    expect(await itemRow(seals.id)).toMatchObject({ count: 1 })
  })

  it('shows +12 as +21 / +25 attack and refuses to go further', async () => {
    const bat = await giveItem('i250104', { inscribeLevel: 12 })
    await giveItem('i161008')
    await setMoney({ stone: 5000 })
    expect((await gear(bat.id)).inscription).toEqual([
      { name: 'MaxAtkEquip', value: 25 },
      { name: 'MinAtkEquip', value: 21 },
    ])
    const response = await client.post('/api/game/forge/inscribe', {
      itemId: bat.id,
      seal: 'low',
      seals: 1,
    })
    expect(errorCode(response)).toBe('max_level')
  })

  it('needs one seal of the chosen kind in the bag, even when using none', async () => {
    const bat = await giveItem('i250104')
    await giveItem('i161008')
    await setMoney({ stone: 1000 })
    const response = await client.post('/api/game/forge/inscribe', {
      itemId: bat.id,
      seal: 'high',
      seals: 0,
    })
    expect(errorCode(response)).toBe('no_seals')
  })

  it('refuses without the Stone, keeping the seals', async () => {
    const bat = await giveItem('i250104')
    const seals = await giveItem('i161009', { count: 2 })
    await setMoney({ stone: 59 })
    const response = await client.post('/api/game/forge/inscribe', {
      itemId: bat.id,
      seal: 'high',
      seals: 1,
    })
    expect(errorCode(response)).toBe('no_money')
    expect(await itemRow(seals.id)).toMatchObject({ count: 2 })
  })

  it('refuses items that are not equipment and more than 3 seals', async () => {
    const potion = await giveItem('i160006')
    await giveItem('i161008')
    await setMoney({ stone: 1000 })
    const wrong = await client.post('/api/game/forge/inscribe', {
      itemId: potion.id,
      seal: 'low',
      seals: 1,
    })
    expect(errorCode(wrong)).toBe('wrong_item')
    const tooMany = await client.post('/api/game/forge/inscribe', {
      itemId: potion.id,
      seal: 'low',
      seals: 4,
    })
    expect(tooMany.statusCode).toBe(400)
  })
})

describe('POST /api/game/forge/repair and /repair-all', () => {
  it('repairs a broken level 1 item (Max 100) for 123 Stone', async () => {
    const fists = await giveItem('i270100', { durability: 0 })
    await setMoney({ stone: 200 })
    expect((await gear(fists.id)).repairCost).toBe(123)

    const response = await client.post('/api/game/forge/repair', { itemId: fists.id })

    expect(response.statusCode).toBe(200)
    expect(response.json().character.stone).toBe(77)
    expect(await itemRow(fists.id)).toMatchObject({ durability: 100 })
  })

  it('refuses an undamaged item and missing Stone', async () => {
    const fists = await giveItem('i270100')
    expect(errorCode(await client.post('/api/game/forge/repair', { itemId: fists.id }))).toBe(
      'not_damaged',
    )
    const broken = await giveItem('i270100', { durability: 0 })
    await setMoney({ stone: 122 })
    expect(errorCode(await client.post('/api/game/forge/repair', { itemId: broken.id }))).toBe(
      'no_money',
    )
  })

  it('repairs every damaged equipped item and leaves the bag alone', async () => {
    const fists = await giveItem('i270100', { durability: 0, equippedSlot: 'Weapon' })
    const hat = await giveItem('i220102', { durability: 50, equippedSlot: 'Hat' })
    const inBag = await giveItem('i270100', { durability: 0 })
    await setMoney({ stone: 1000 })

    const response = await client.post('/api/game/forge/repair-all')

    expect(response.statusCode).toBe(200)
    // 123 + (int)(0.5 * (-0.009 * 169 + 2.7 * 13 + 120)) + 1 = 123 + 77.
    expect(response.json().character.stone).toBe(1000 - 123 - 77)
    expect(await itemRow(fists.id)).toMatchObject({ durability: 100 })
    expect(await itemRow(hat.id)).toMatchObject({ durability: 100 })
    expect(await itemRow(inBag.id)).toMatchObject({ durability: 0 })
  })

  it('says so when nothing worn is damaged', async () => {
    await giveItem('i270100', { equippedSlot: 'Weapon' })
    expect(errorCode(await client.post('/api/game/forge/repair-all'))).toBe('not_damaged')
  })
})
