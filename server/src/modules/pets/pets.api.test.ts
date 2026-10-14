// Pet Kennel (M6 task 9): adoption, kennel slots, feeding and lazy digestion, skills, evolution,
// release, the fight EXP share and the active pet's fight input.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Random } from '@pockie/game-core'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterPets, characterPetSkills, characters, inventoryItems } from '../../db/schema.js'
import { activePetFighterInput, explorePetItem, grantPetExp } from '../../game/pets.js'
import { adoptPetItem, emptySlotId } from './kennel.js'
import { petRoutes } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

/** Rolls the lowest value: bases at 80%, food slots of type 1 (any) with tier 0, first skill. */
const fixed: () => Random = () => ({ next: () => 0, int: () => 0, between: (a) => a })

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  // The app registers the routes at /api/game/pets; this copy injects the rolls.
  app.register(petRoutes, { db, prefix: '/api/test/pets', random: fixed })
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
  await db.update(characters).set({ level: 60 }).where(eq(characters.id, characterId))
})
afterEach(() => app.close())
afterAll(() => close())

const give = async (itemId: string, count = 1) =>
  (
    await db.insert(inventoryItems).values({ characterId, itemId, count, bound: true }).returning()
  )[0]!
const held = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
  ).reduce((total, row) => total + row.count, 0)
const character = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const setCharacter = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const petRow = async (id: string) =>
  (await db.select().from(characterPets).where(eq(characterPets.id, id)))[0]
const setPet = (id: string, values: Partial<typeof characterPets.$inferInsert>) =>
  db.update(characterPets).set(values).where(eq(characterPets.id, id))

/** Adopts a pet from a fresh pet item, as /items/:id/use does. */
async function adopt(itemId = 'i320002') {
  const row = await give(itemId)
  return db.transaction(async (tx) => adoptPetItem(tx, await character(), row, fixed()))
}
async function newPet(itemId = 'i320002') {
  await adopt(itemId)
  const pets = await db
    .select()
    .from(characterPets)
    .where(eq(characterPets.characterId, characterId))
  return pets.at(-1)!
}
const post = (path: string, body?: object) => client.post(`/api/test/pets${path}`, body)
const view = async () => (await client.get('/api/test/pets')).json()
const FOODS = ['i170117', null, null, null, null, null]

describe('adopting from a pet item', () => {
  it('adopts into the free kennel slot and uses the item once', async () => {
    expect(await adopt()).toBe(true)
    expect(await held('i320002')).toBe(0)
    const { pets, petSlots } = await view()
    expect(petSlots).toBe(1)
    expect(pets).toHaveLength(1)
    // Beast profile 14/8/10/10/8 rolled at 80%.
    expect(pets[0]).toMatchObject({ species: 'i320002', level: 1, growth: 120, kennelSlot: 0 })
    expect((await petRow(pets[0].id))!.baseAttack).toBe(11)
  })

  it('rolls the base props of the required level band (11b)', async () => {
    await setCharacter({ petSlots: 2 })
    // Tailed Beast 9/8/7/7/7 x1.2 at level 50 = 10/9/8/8/8, rolled at 80%.
    const legend = await newPet('i340710')
    expect(legend).toMatchObject({ baseAttack: 8, baseDefence: 7, baseSavvy: 6 })
    // Beast 14/8/10/10/8 x1.1 at level 40 = 15/8/11/11/8, rolled at 80%.
    expect(await newPet('i320029')).toMatchObject({ baseAttack: 12, baseDisturb: 8 })
  })

  it('adopts a pet below its required level (Reborn tutorial quest 820012)', async () => {
    await setCharacter({ level: 10 })
    expect(await adopt('i340710')).toBe(true)
  })

  it('ignores items that are not pets', async () => {
    const row = await give('i170117')
    const used = await db.transaction(async (tx) => adoptPetItem(tx, await character(), row))
    expect(used).toBe(false)
  })

  it('refuses a full kennel (pet_slots) and keeps the item', async () => {
    await adopt()
    await expect(adopt('i320003')).rejects.toMatchObject({ code: 'kennel_full' })
    expect(await held('i320003')).toBe(1)
    await setCharacter({ petSlots: 2 })
    expect(await adopt('i320006')).toBe(true)
  })

  it('consumes one pet item once under concurrency', async () => {
    await setCharacter({ petSlots: 3 })
    const row = await give('i320002')
    const tryAdopt = () =>
      db
        .transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(characters)
            .where(eq(characters.id, characterId))
            .for('update')
          const [fresh] = await tx
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, row.id))
          if (!fresh) throw new Error('gone')
          return adoptPetItem(tx, locked!, fresh, fixed())
        })
        .then(
          () => 'ok',
          () => 'refused',
        )
    const results = await Promise.all([tryAdopt(), tryAdopt()])
    expect(results.sort()).toEqual(['ok', 'refused'])
    expect((await view()).pets).toHaveLength(1)
  })

  it('maps explore pet bonuses to the Reborn pet item', () => {
    expect(explorePetItem('i283002')).toBe('i320002')
    expect(explorePetItem('i170117')).toBe('i170117')
  })
})

describe('kennel slots', () => {
  it('costs 100 Gold each up to 5', async () => {
    await setCharacter({ gold: 1000 })
    for (let i = 0; i < 4; i++) expect((await post('/slots/unlock')).statusCode).toBe(200)
    const capped = await post('/slots/unlock')
    expect(capped.json().error.code).toBe('slot_cap')
    expect(await character()).toMatchObject({ petSlots: 5, gold: 600 })
  })

  it('refuses without the Gold', async () => {
    await setCharacter({ gold: 99 })
    expect((await post('/slots/unlock')).json().error.code).toBe('not_enough_currency')
    expect((await character()).petSlots).toBe(1)
  })
})

describe('active pet', () => {
  it('keeps one active pet', async () => {
    await setCharacter({ petSlots: 2 })
    const first = await newPet()
    const second = await newPet('i320003')
    await post(`/${first.id}/active`, { active: true })
    const result = await post(`/${second.id}/active`, { active: true })
    expect(result.statusCode).toBe(200)
    expect(result.json().pets.map((p: { active: boolean }) => p.active)).toEqual([false, true])
  })

  it('refuses another ninja’s pet', async () => {
    const response = await post('/00000000-0000-4000-8000-000000000000/active', { active: true })
    expect(response.statusCode).toBe(404)
  })
})

describe('feeding and digestion', () => {
  it('starts digesting, uses the food and refuses a second feed', async () => {
    const pet = await newPet()
    await give('i170117', 2)
    const fed = await post(`/${pet.id}/feed`, { foods: FOODS })
    expect(fed.statusCode).toBe(200)
    expect(fed.json().pets[0].digestEndsAt).not.toBeNull()
    expect(fed.json().pets[0].foodSlots[0].item).toBe('i170117')
    expect(await held('i170117')).toBe(1)
    expect((await post(`/${pet.id}/feed`, { foods: FOODS })).json().error.code).toBe('digesting')
  })

  it('finishes lazily with appetite and the same pet EXP', async () => {
    const pet = await newPet()
    await give('i170117')
    await post(`/${pet.id}/feed`, { foods: FOODS })
    await setPet(pet.id, { digestEndsAt: new Date(Date.now() - 1000) })
    const [settled] = (await view()).pets
    // Roast Chicken: 80 hunger, tier 0, no like bonus (Beast likes type 2).
    expect(settled).toMatchObject({ appetite: 80, digestEndsAt: null })
    expect(settled.level * 1000 + settled.exp).toBeGreaterThan(1000)
    expect(settled.foodSlots[0].item).toBeNull()
  })

  it('two concurrent feeds use the food once', async () => {
    const pet = await newPet()
    await give('i170117')
    const results = await Promise.all([
      post(`/${pet.id}/feed`, { foods: FOODS }),
      post(`/${pet.id}/feed`, { foods: FOODS }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(await held('i170117')).toBe(0)
  })

  it('finish-now costs 8 Gold or Gift Coupons once', async () => {
    const pet = await newPet()
    await give('i170117', 2)
    await setCharacter({ gold: 10, giftCoupon: 8 })
    await post(`/${pet.id}/feed`, { foods: FOODS })
    const now = await post(`/${pet.id}/digest-now`, { currency: 'gold' })
    expect(now.json().pets[0]).toMatchObject({ appetite: 80, digestEndsAt: null })
    expect(now.json().character.gold).toBe(2)
    expect((await post(`/${pet.id}/digest-now`, { currency: 'gold' })).json().error.code).toBe(
      'not_digesting',
    )
    await post(`/${pet.id}/feed`, { foods: FOODS })
    expect((await post(`/${pet.id}/digest-now`, { currency: 'gold' })).json().error.code).toBe(
      'not_enough_currency',
    )
    await post(`/${pet.id}/digest-now`, { currency: 'giftCoupon' })
    expect(await character()).toMatchObject({ gold: 2, giftCoupon: 0 })
  })

  it('refuses food that is not pet food', async () => {
    const pet = await newPet()
    await give('i150319')
    const response = await post(`/${pet.id}/feed`, {
      foods: ['i150319', null, null, null, null, null],
    })
    expect(response.json().error.code).toBe('not_food')
  })
})

describe('skills', () => {
  async function slottedPet(kinds: (1 | 2 | 3)[] = [3]) {
    const pet = await newPet()
    await setCharacter({ stone: 100 })
    for (const kind of kinds) await post(`/${pet.id}/skills/slot`, { kind })
    return pet
  }
  const skillsOf = async (petId: string) =>
    db.select().from(characterPetSkills).where(eq(characterPetSkills.petId, petId))

  it('unlocks slots for Stone (slot 7: 26000), refusing past the level total', async () => {
    const pet = await slottedPet([])
    await setCharacter({ stone: 30_000 })
    for (let i = 0; i < 7; i++)
      expect((await post(`/${pet.id}/skills/slot`, { kind: (i % 3) + 1 })).statusCode).toBe(200)
    expect((await post(`/${pet.id}/skills/slot`, { kind: 1 })).json().error.code).toBe('slot_cap')
    const [shown] = (await view()).pets
    expect(shown.slots).toEqual([3, 2, 2])
    expect(shown.nextSlotCost).toBeNull()
    // Slots 1-6 cost 1 Stone each, slot 7 costs 26000 (PetActCapital).
    expect((await character()).stone).toBe(30_000 - 6 - 26_000)
  })

  it('learning needs a full appetite and an unlocked slot', async () => {
    const pet = await slottedPet([])
    expect((await post(`/${pet.id}/skills/learn`, { kind: 3 })).json().error.code).toBe('not_full')
    await setPet(pet.id, { appetite: 7200 })
    expect((await post(`/${pet.id}/skills/learn`, { kind: 3 })).json().error.code).toBe('no_slot')
    await post(`/${pet.id}/skills/slot`, { kind: 3 })
    const learned = await post(`/${pet.id}/skills/learn`, { kind: 3 })
    expect(learned.json().pets[0].skills).toMatchObject([{ skillId: 40043, kind: 3, slot: 0 }])
    expect(learned.json().pets[0].appetite).toBe(0)
  })

  it('a skill book teaches its skill and is used up', async () => {
    const pet = await slottedPet()
    await give('i180035')
    const response = await post(`/${pet.id}/skills/book`, { item: 'i180035' })
    expect(response.json().pets[0].skills[0]).toMatchObject({ skillId: 50020, kind: 3 })
    expect(await held('i180035')).toBe(0)
    await give('i180035')
    expect((await post(`/${pet.id}/skills/book`, { item: 'i180035' })).json().error.code).toBe(
      'known',
    )
    expect(await held('i180035')).toBe(1)
  })

  it('a lock keeps a skill through replacement and uses the lock items', async () => {
    const pet = await slottedPet([3, 3])
    await give('i150406', 3)
    await give('i180035')
    await post(`/${pet.id}/skills/book`, { item: 'i180035' })
    await setPet(pet.id, { appetite: 7200 })
    await post(`/${pet.id}/skills/learn`, { kind: 3 })
    expect((await post(`/${pet.id}/skills/50020/lock`)).statusCode).toBe(200)
    expect(await held('i150406')).toBe(2)
    // Both slots are full: the new skill replaces the unlocked 40043, not the locked 50020.
    await setPet(pet.id, { appetite: 7200 })
    await post(`/${pet.id}/skills/learn`, { kind: 3 })
    const ids = (await skillsOf(pet.id)).map((s) => s.skillId).sort()
    expect(ids).toEqual([40044, 50020])
    // The second lock costs 2.
    await post(`/${pet.id}/skills/40044/lock`)
    expect(await held('i150406')).toBe(0)
    await setPet(pet.id, { appetite: 7200 })
    expect((await post(`/${pet.id}/skills/learn`, { kind: 3 })).json().error.code).toBe(
      'all_locked',
    )
  })

  it('removing a skill uses the remover and keeps the slot', async () => {
    const pet = await slottedPet()
    await give('i180035')
    await post(`/${pet.id}/skills/book`, { item: 'i180035' })
    expect((await post(`/${pet.id}/skills/50020/remove`)).json().error.code).toBe(
      'not_enough_items',
    )
    await give('i152027')
    const removed = await post(`/${pet.id}/skills/50020/remove`)
    expect(removed.json().pets[0]).toMatchObject({ skills: [], slots: [0, 0, 1] })
    expect(await held('i152027')).toBe(0)
    expect((await skillsOf(pet.id)).map((s) => s.skillId)).toEqual([emptySlotId(3, 0)])
  })
})

describe('evolution and release', () => {
  it('evolves at level 30 for 50 Feathers with +20 growth', async () => {
    const pet = await newPet()
    await give('i150319', 60)
    expect((await post(`/${pet.id}/evolve`, { into: 'i320071' })).json().error.code).toBe('too_low')
    await setPet(pet.id, { level: 30 })
    expect((await post(`/${pet.id}/evolve`, {})).json().error.code).toBe('choose_form')
    const evolved = await post(`/${pet.id}/evolve`, { into: 'i320071' })
    expect(evolved.json().pets[0]).toMatchObject({ species: 'i320071', level: 30, growth: 140 })
    expect(await held('i150319')).toBe(10)
    expect((await post(`/${pet.id}/evolve`, {})).json().error.code).toBe('no_evolution')
  })

  it('refuses releasing the active pet and deletes any other', async () => {
    const pet = await newPet()
    await post(`/${pet.id}/active`, { active: true })
    expect((await post(`/${pet.id}/release`)).json().error.code).toBe('active')
    await post(`/${pet.id}/active`, { active: false })
    expect((await post(`/${pet.id}/release`)).json().pets).toEqual([])
  })
})

describe('the active pet outside the kennel', () => {
  it('shares 50% of fight EXP and never passes the master level', async () => {
    const pet = await newPet()
    await setPet(pet.id, { active: true })
    await setCharacter({ level: 3 })
    await db.transaction((tx) => grantPetExp(tx, characterId, 10_000_000))
    expect((await petRow(pet.id))!.level).toBe(3)
  })

  it('gives no EXP without an active pet', async () => {
    await newPet()
    expect(await db.transaction((tx) => grantPetExp(tx, characterId, 1000))).toBe(0)
  })

  it('builds the fighter input; Pass skills only add bonuses', async () => {
    expect(await activePetFighterInput(db, characterId)).toBeNull()
    const pet = await newPet()
    await setPet(pet.id, { active: true, level: 50 })
    await db.insert(characterPetSkills).values([
      { petId: pet.id, skillId: 40001, kind: 2, slot: 0, learnedOrder: 0 },
      { petId: pet.id, skillId: 50020, kind: 3, slot: 0, learnedOrder: 1 },
    ])
    const input = (await activePetFighterInput(db, characterId))!
    expect(input.pet).toMatchObject({ species: 'i320002', level: 50 })
    expect(input.pet.skills.map((s) => s.id)).toEqual([40001])
    expect(input.bonuses.pierce).toBeGreaterThan(0)
  })
})
