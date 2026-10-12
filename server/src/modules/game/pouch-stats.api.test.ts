// HP/MP pouches (RoleUseSystem), derived stats in GET /character, available quests and the
// revive terms of GET /scene.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'
import { EXPLORE_MIN_HP, fightMonster } from '../../game/combat.js'

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
  // Clothing 3: Ggio Vega (fists), Fire Village; level 1 max HP 220.
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

const MAX_HP = 220
const SUNFLOWER = 'n33017'
const BOSS = 'n32002'

const update = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const giveItem = async (itemId: string, extra: Partial<typeof inventoryItems.$inferInsert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const useItem = (id: string) => client.post(`/api/game/items/${id}/use`)
const inField = async () => {
  await update({ sceneId: 2101 })
  await giveItem('i270100', { equippedSlot: 'Weapon' })
}

describe('pouches', () => {
  it('start empty with a size of 9000 + level * 1000', async () => {
    const { character } = (await client.get('/api/game/character')).json()
    expect(character).toMatchObject({ hpPouch: 0, mpPouch: 0, pouchMax: 10_000 })
  })

  it('refill HP and MP after a won fight (OnCommandFightEnd)', async () => {
    await inField()
    await update({ hp: 150, mp: 10, hpPouch: 1000, mpPouch: 5 })
    const body = (await client.post('/api/game/fight', { monsterId: SUNFLOWER })).json()
    expect(body.won).toBe(true)
    const left = body.replay.fighters[0].hp
    expect(body.character.hp).toBe(MAX_HP)
    expect(body.character.hpPouch).toBe(1000 - (MAX_HP - left))
    expect(body.character.mp).toBe(15)
    expect(body.character.mpPouch).toBe(0)
  })

  it('stay untouched after a lost field fight: the ninja stays defeated', async () => {
    await update({ sceneId: 2101, hpPouch: 5000 })
    // n32002 is a task boss: it can only be fought while one of its quests (10014) is held.
    await db.insert(characterQuests).values({ characterId, taskId: 10014, progress: [0], state: 0 })
    const body = (await client.post('/api/game/fight', { monsterId: BOSS })).json()
    expect(body.won).toBe(false)
    expect(body.character).toMatchObject({ hp: 0, hpPouch: 5000 })
  })

  it('refill HP after every explore fight, even a lost one (OutSearchSystem)', async () => {
    await update({ sceneId: 2101, hpPouch: 100 })
    const result = await db.transaction(async (tx) =>
      fightMonster(tx, await row(), BOSS, EXPLORE_MIN_HP),
    )
    expect(result.won).toBe(false)
    expect(await row()).toMatchObject({ hp: 100, hpPouch: 0 })
  })

  it('fill from the tutorial pouch item, never above the size', async () => {
    // i160050 (HP Container, hmpcontainer.js) adds 1000 to the HP pouch.
    const pouch = await giveItem('i160050')
    const body = (await useItem(pouch.id)).json()
    expect(body.character).toMatchObject({ hpPouch: 1000, mpPouch: 0 })

    await update({ hpPouch: 9500 })
    const second = await giveItem('i160050')
    expect((await useItem(second.id)).json().character.hpPouch).toBe(10_000)
  })

  it('refuse a pouch item when the pouch is full and keep the item', async () => {
    await update({ hpPouch: 10_000 })
    const pouch = await giveItem('i160050')
    const response = await useItem(pouch.id)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('pouch_full')
    expect(await db.select().from(inventoryItems)).toHaveLength(1)
  })
})

describe('POST /api/game/pouches/buy (OnCustomBuy)', () => {
  const buy = (body: object) => client.post('/api/game/pouches/buy', body)

  it('charges Gold, 1 per 1000 points, and fills the pouches', async () => {
    await update({ gold: 20, mpPouch: 9000 })
    const response = await buy({ currency: 'gold', hp: 5, mp: 'full' })
    expect(response.statusCode).toBe(200)
    expect(response.json().character).toMatchObject({
      gold: 14,
      hpPouch: 5000,
      mpPouch: 10_000,
    })
    expect(response.json()).toMatchObject({ completed: [], rewards: [] })
  })

  it('can pay with Gift Coupons', async () => {
    await update({ giftCoupon: 10 })
    const { character } = (await buy({ currency: 'giftCoupon', hp: 'full' })).json()
    expect(character).toMatchObject({ giftCoupon: 0, hpPouch: 10_000, gold: 0 })
  })

  it('refuses without enough currency and charges nothing', async () => {
    await update({ gold: 4 })
    const response = await buy({ currency: 'gold', hp: 5 })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_money')
    expect(await row()).toMatchObject({ gold: 4, hpPouch: 0 })
  })

  it('refuses when the chosen pouches are full', async () => {
    await update({ gold: 10, hpPouch: 10_000 })
    const response = await buy({ currency: 'gold', hp: 'full' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('pouch_full')
    expect((await row()).gold).toBe(10)
  })

  it('rejects amounts the original never offered and other currencies', async () => {
    await update({ gold: 1000, stone: 1000 })
    expect((await buy({ currency: 'gold', hp: 7 })).statusCode).toBe(400)
    expect((await buy({ currency: 'stone', hp: 5 })).statusCode).toBe(400)
    expect((await row()).hpPouch).toBe(0)
  })
})

describe('potions', () => {
  it('do not end the defeated state (heal after reviving)', async () => {
    await update({ hp: 0 })
    const potion = await giveItem('i160006')
    const response = await useItem(potion.id)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('defeated')
    expect((await row()).hp).toBe(0)
  })

  it('are refused at full HP (hp.js) and kept', async () => {
    const potion = await giveItem('i160006')
    const response = await useItem(potion.id)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('full')
    expect(await db.select().from(inventoryItems)).toHaveLength(1)
  })

  it('restore chakra (mp.js)', async () => {
    await update({ mp: 1 })
    const potion = await giveItem('i160016')
    expect((await useItem(potion.id)).json().character.mp).toBe(151)
  })
})

describe('GET /api/game/character stats', () => {
  it('returns the stats fights use, including the weapon', async () => {
    const before = (await client.get('/api/game/character')).json().stats
    // AvatarID 3 at level 1 (RoleInitProperty.ini, RefreshSystem): attack 1 without a weapon.
    expect(before).toMatchObject({
      strength: 1365,
      minAttack: 1,
      maxAttack: 1,
      maxHp: MAX_HP,
      defense: 0,
      critAttach: 230,
      counter: 5,
      pierce: 0,
      tough: 0,
    })
    expect(before.atkTime).toBeGreaterThan(0)

    await giveItem('i270100', { equippedSlot: 'Weapon' })
    const after = (await client.get('/api/game/character')).json().stats
    // Fists i270100: AttackMin 7, AttackMax 8.
    expect(after).toMatchObject({ minAttack: 8, maxAttack: 9 })
  })

  it('includes armour defence and the item.ini OtherProp bonuses', async () => {
    // Hat i298005 (Def 55, HitMulEquip 66) and Cloth Armour i240101 (Def 71); the bag hat does not count.
    await giveItem('i298005', { equippedSlot: 'Hat' })
    await giveItem('i240101', { equippedSlot: 'Cloth' })
    await giveItem('i220101')
    const { stats } = (await client.get('/api/game/character')).json()
    expect(stats).toMatchObject({ defense: 126, hit: 66 })
  })

  it('requires a login', async () => {
    const anonymous = new Client(app)
    expect((await anonymous.get('/api/game/character')).statusCode).toBe(401)
  })
})

describe('GET /api/game/quests/available', () => {
  const available = async () => (await client.get('/api/game/quests/available')).json()

  it('lists nothing while the tutorial is running and no quest is done', async () => {
    // 90000 is held; 90002 needs 90001 first.
    const body = await available()
    expect(body.completed).toEqual([])
    expect(body.available.map((q: { taskId: number }) => q.taskId)).not.toContain(90002)
  })

  it('offers the next NPC quest once its previous quest is done, with its quest giver', async () => {
    await client.post('/api/game/npcs/n11001/talk')
    const pack = (await db.select().from(inventoryItems))[0]!
    await useItem(pack.id)

    const body = await available()
    expect(body.completed).toEqual(expect.arrayContaining([90000, 90001]))
    expect(body.available).toContainEqual({
      taskId: 90002,
      npcId: 'n11001',
      sceneId: 111,
      nameKey: 'lg_Task_90002',
      talkKey: expect.any(String),
      rewards: expect.objectContaining({ exp: 10, giftCoupon: 10 }),
    })
    // Every listed quest can really be accepted (same rules as the accept route).
    const accepted = await client.post('/api/game/quests/90002/accept')
    expect(accepted.statusCode).toBe(200)
    const after = await available()
    expect(after.available.map((q: { taskId: number }) => q.taskId)).not.toContain(90002)
  })

  it('never offers another village’s quests or quests above the level', async () => {
    await update({ level: 90 })
    const ids = (await available()).available.map((q: { taskId: number }) => q.taskId)
    // 91002 is the Water Village tutorial step.
    expect(ids).not.toContain(91002)
  })
})

describe('GET /api/game/scene revive terms', () => {
  it('states the EXP going home costs and the Gold revive', async () => {
    // Level 10 → 11 costs 1036 EXP: 5% = 51.
    await update({ level: 10 })
    const { revive } = (await client.get('/api/game/scene')).json()
    expect(revive).toEqual({ homeExpLoss: 51, gold: 1, goldAllowed: true })
  })
})
