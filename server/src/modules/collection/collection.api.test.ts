// Collection Avatars / Pets / Gear Sets: the view, Submit and the fighter bonus.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterCollection, characterPets, characters, inventoryItems } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'

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
})
afterEach(() => app.close())
afterAll(() => close())

const give = async (itemId: string, extra: Partial<typeof inventoryItems.$inferInsert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const fourLines = [1, 2, 3, 4].map((propId) => ({ propId, value: 1 }))
const giveKennelPet = async (species: string, extra: Partial<typeof characterPets.$inferInsert>) =>
  (
    await db
      .insert(characterPets)
      .values({
        characterId,
        species,
        kennelSlot: 0,
        growth: 100,
        baseAttack: 0,
        baseDefence: 0,
        baseDisturb: 0,
        baseActive: 0,
        baseSavvy: 0,
        ...extra,
      })
      .returning()
  )[0]!
const submit = (body: object) => client.post('/api/game/collection/submit', body)
const view = async () => (await client.get('/api/game/collection')).json()
const exists = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id))).length > 0
const strength = async () => {
  const [row] = await db.select().from(characters).where(eq(characters.id, characterId))
  return (await playerFighter(db, row!)).strength
}

describe('GET /api/game/collection', () => {
  it('lists the three tabs with nothing collected', async () => {
    const data = await view()
    expect(data.outfits.rarities.map((r: { id: string }) => r.id)).toEqual([
      'gray',
      'blue',
      'orange',
    ])
    expect(data.outfits).toMatchObject({ level: 0, stats: [0, 0, 0], bonus: [0, 0, 0] })
    expect(data.pets.natures).toHaveLength(6)
    expect(data.gear).toMatchObject({ requiredLines: 4, piece: 1, complete: 3 })
    expect(data.gear.tiers.map((t: { label: string }) => t.label)).toEqual([
      'Lv 1-30',
      'Lv 31-50',
      'Lv 51-60',
      'Lv 61-80',
      'Lv 81+',
    ])
  })

  it('offers outfits at +2 or more in the bag, never +1, locked or worn copies', async () => {
    const spare = await give('i290203')
    await give('i290003')
    await give('i290103', { locked: true })
    const data = await view()
    const entry = data.outfits.rarities[0].entries.find(
      (e: { clothing: number }) => e.clothing === 3,
    )
    expect(entry).toMatchObject({ collected: false, stats: [1, 2, 1] })
    expect(entry.candidates).toEqual([
      expect.objectContaining({ id: spare.id, source: 'bag', level: 3 }),
    ])
  })
})

describe('POST /api/game/collection/submit', () => {
  it('collects an outfit once, destroys the copy and adds its stats to the fighter', async () => {
    const before = await strength()
    const copy = await give('i290103')
    const response = await submit({ kind: 'outfit', id: copy.id })
    expect(response.statusCode).toBe(200)
    const data = response.json()
    expect(data.outfits.stats).toEqual([1, 2, 1])
    expect(data.outfits.rarities[0].entries[0]).toMatchObject({ clothing: 3, collected: true })
    expect(await exists(copy.id)).toBe(false)
    expect(await strength()).toBe(before + 100)

    const again = await give('i290203')
    const repeat = await submit({ kind: 'outfit', id: again.id })
    expect(repeat.statusCode).toBe(409)
    expect(repeat.json().error.code).toBe('already_collected')
    expect(await exists(again.id)).toBe(true)
  })

  it('refuses +1 outfits, locked, worn and foreign rows, and items of another kind', async () => {
    expect((await submit({ kind: 'outfit', id: (await give('i290003')).id })).statusCode).toBe(400)
    const locked = await give('i290103', { locked: true })
    expect((await submit({ kind: 'outfit', id: locked.id })).statusCode).toBe(400)
    const worn = await give('i290203', { equippedSlot: 'Outfit', equippedSet: 2 })
    expect((await submit({ kind: 'outfit', id: worn.id })).statusCode).toBe(404)
    const gear = await give('i281602', { props: fourLines })
    expect((await submit({ kind: 'outfit', id: gear.id })).statusCode).toBe(400)
    expect((await submit({ kind: 'gear', id: crypto.randomUUID() })).statusCode).toBe(404)
    expect((await submit({ kind: 'outfit', id: gear.id, source: 'kennel' })).statusCode).toBe(400)
    expect(await db.select().from(characterCollection)).toHaveLength(0)
  })

  it('collects a gear piece with the refine lines and no gems, any slot copy', async () => {
    const short = await give('i281602', { props: fourLines.slice(0, 3) })
    expect((await submit({ kind: 'gear', id: short.id })).statusCode).toBe(400)
    const gemmed = await give('i281602', { props: fourLines, gems: ['i000001', null] })
    expect((await submit({ kind: 'gear', id: gemmed.id })).statusCode).toBe(400)
    const piece = await give('i281602', { props: fourLines, enhanceLevel: 2 })
    const response = await submit({ kind: 'gear', id: piece.id })
    expect(response.statusCode).toBe(200)
    const set = response.json().gear.tiers[0].sets.find((s: { id: number }) => s.id === 8160)
    expect(set.pieces.find((p: { slot: string }) => p.slot === 'Hat').collected).toBe(true)
    expect(response.json().gear.stats).toEqual([1, 1, 1])
    expect(await exists(piece.id)).toBe(false)
  })

  it('collects a pet family from a bag pet item or a resting kennel pet, never the active one', async () => {
    const egg = await give('i320071')
    const response = await submit({ kind: 'pet', id: egg.id })
    expect(response.statusCode).toBe(200)
    const beast = response.json().pets.natures.find((n: { nature: number }) => n.nature === 2)
    expect(beast.entries.find((e: { family: string }) => e.family === 'i320002').collected).toBe(
      true,
    )

    const active = await giveKennelPet('i320015', { active: true })
    const refused = await submit({ kind: 'pet', id: active.id, source: 'kennel' })
    expect(refused.statusCode).toBe(400)
    await db.update(characterPets).set({ active: false }).where(eq(characterPets.id, active.id))
    const listed = (await view()).pets.natures[0].entries[0]
    expect(listed.candidates).toEqual([
      expect.objectContaining({ id: active.id, source: 'kennel', level: 1 }),
    ])
    expect((await submit({ kind: 'pet', id: active.id, source: 'kennel' })).statusCode).toBe(200)
    const left = await db
      .select()
      .from(characterPets)
      .where(and(eq(characterPets.characterId, characterId), eq(characterPets.id, active.id)))
    expect(left).toHaveLength(0)
  })

  it('pays the top reached milestone of a rarity into Max HP', async () => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId))
    const before = (await playerFighter(db, row!)).maxHp
    await db.insert(characterCollection).values(
      ['3', '9', '12', '14', '16'].map((entry) => ({
        characterId,
        kind: 'outfit' as const,
        entry,
      })),
    )
    const after = await playerFighter(db, row!)
    expect(after.maxHp).toBeGreaterThan(before)
    const data = await view()
    expect(data.outfits).toMatchObject({ level: 1, bonus: [21, 21, 21] })
    expect(data.outfits.rarities[0].milestones[0]).toEqual({
      count: 5,
      bonus: [21, 21, 21],
      reached: true,
    })
  })
})
