// Gear rules around the forge (blacksmith.md "Durability", "Item state"; equipment-sets.md):
// wear from fights and revives, broken items and sets, unappraised gear, rolled drops.
import { and, eq, isNull } from 'drizzle-orm'
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
  // Clothing 3: Ggio Vega (fists), level 1, Stamina 1365.
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
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]!
const setCharacter = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const stats = async () => (await client.get('/api/game/character')).json().stats

describe('equipping', () => {
  it('refuses unappraised gear (EquipSystem.java:421)', async () => {
    const fists = await giveItem('i270100', { canIdentify: true, identifyCount: 2 })
    const response = await client.post(`/api/game/items/${fists.id}/equip`)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('unappraised')
    expect((await itemRow(fists.id)).equippedSlot).toBeNull()
  })

  it('refuses a broken item (CheckEquipProp: Hardiness > 0)', async () => {
    const fists = await giveItem('i270100', { durability: 0 })
    const response = await client.post(`/api/game/items/${fists.id}/equip`)
    expect(response.json().error.code).toBe('broken')
  })

  it('wears appraised gear', async () => {
    const fists = await giveItem('i270100', {
      canIdentify: true,
      identifyCount: 2,
      identifyTimes: 1,
    })
    expect((await client.post(`/api/game/items/${fists.id}/equip`)).statusCode).toBe(200)
  })
})

describe('broken gear', () => {
  it('stops giving stats and stops counting toward its set at durability 0', async () => {
    // Oracle Outfit 8160: Cloth i281601 (Def 119) + Hat i281602 (Def 34), 2 pieces: +28 Stamina.
    const cloth = await giveItem('i281601', { equippedSlot: 'Cloth' })
    await giveItem('i281602', { equippedSlot: 'Hat' })
    expect(await stats()).toMatchObject({ defense: 153, stamina: 1365 + 2800 })

    await db.update(inventoryItems).set({ durability: 0 }).where(eq(inventoryItems.id, cloth.id))

    expect(await stats()).toMatchObject({ defense: 34, stamina: 1365 })
  })
})

async function fightSunflower() {
  await setCharacter({ sceneId: 2101 })
  return (await client.post('/api/game/fight', { monsterId: 'n33017' })).json()
}

describe('durability loss', () => {
  it('takes 1 from every worn item per enemy killed in a won fight', async () => {
    const fists = await giveItem('i270100', { equippedSlot: 'Weapon' })
    const ring = await giveItem('i300111', { equippedSlot: 'Ring' })
    const inBag = await giveItem('i220102')

    expect((await fightSunflower()).won).toBe(true)

    expect((await itemRow(fists.id)).durability).toBe(99)
    // UnDecHardiness items and the bag keep theirs.
    expect((await itemRow(ring.id)).durability).toBeNull()
    expect((await itemRow(inBag.id)).durability).toBeNull()
  })

  it('takes nothing after a lost fight', async () => {
    const fists = await giveItem('i270100', { equippedSlot: 'Weapon' })
    await setCharacter({ sceneId: 2101 })
    const body = (await client.post('/api/game/fight', { monsterId: 'n32002' })).json()
    expect(body.won).toBe(false)
    expect((await itemRow(fists.id)).durability).toBeNull()
  })

  it('takes 5% of MaxHardiness from worn items on a revive at home', async () => {
    const cloth = await giveItem('i281601', { equippedSlot: 'Cloth' })
    await setCharacter({ hp: 0, sceneId: 2101 })
    expect((await client.post('/api/game/revive', { mode: 'home' })).statusCode).toBe(200)
    expect((await itemRow(cloth.id)).durability).toBe(190)
  })

  it('takes nothing on a paid revive on the spot', async () => {
    const cloth = await giveItem('i281601', { equippedSlot: 'Cloth' })
    await setCharacter({ hp: 0, sceneId: 2101, gold: 1 })
    expect((await client.post('/api/game/revive', { mode: 'gold' })).statusCode).toBe(200)
    expect((await itemRow(cloth.id)).durability).toBeNull()
  })
})

describe('set bonus in fights', () => {
  it('raises the fighter’s max HP in the replay with the 2-piece Oracle bonus', async () => {
    await setCharacter({ hp: 5000 })
    await giveItem('i270100', { equippedSlot: 'Weapon' })
    const cloth = await giveItem('i281601', { equippedSlot: 'Cloth' })
    const hat = await giveItem('i281602', { equippedSlot: 'Hat' })
    const withSet = (await fightSunflower()).replay.fighters[0].maxHp

    // Same defence without the set: the hat is broken, so only the cloth counts.
    await db.update(inventoryItems).set({ durability: 0 }).where(eq(inventoryItems.id, hat.id))
    await setCharacter({ hp: 5000 })
    const withoutSet = (await fightSunflower()).replay.fighters[0].maxHp

    expect(withSet).toBeGreaterThan(withoutSet)
    expect((await itemRow(cloth.id)).durability).toBe(198)
  })
})

describe('granted gear rolls its properties', () => {
  it('opens Mythbeast box i150322 into 3 appraised weapons with 1 property each', async () => {
    await setCharacter({ level: 16 })
    const box = await giveItem('i150322')
    expect((await client.post(`/api/game/items/${box.id}/use`)).statusCode).toBe(200)

    const weapons = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), isNull(inventoryItems.equippedSlot)))
    expect(weapons).toHaveLength(3)
    for (const weapon of weapons) {
      expect(weapon).toMatchObject({ canIdentify: true, identifyCount: 1, identifyTimes: 1 })
      expect(weapon.props).toHaveLength(1)
    }
  })
})
