// M6 decision 12: the active pet gets 50% of the master's toll gate and Las Noches EXP (capped
// by the master's level). The fight result is fixed: real bosses can beat any test ninja.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { petExpShare, petLevelFromExp } from '../../../../game-core/src/pets/exp.js'
import petFoods from '../../../data/game/reborn/pet-foods.json'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterPets, inventoryItems, singleGate } from '../../db/schema.js'
import { join, setUpTeams, type TestNinja } from '../teams/test-setup.js'
import { setUpNinja } from './test-setup.js'

const outcome = vi.hoisted(() => ({ won: true }))
vi.mock('@pockie/game-core', async (original) => ({
  ...(await original<typeof import('@pockie/game-core')>()),
  simulateFight: ({ attackers }: { attackers: unknown[] }) => ({
    seed: 0,
    fighters: attackers.map((_, index) => ({ index, side: 'attackers', hp: 500, mp: 0 })),
    events: [],
    winner: outcome.won ? 'attackers' : 'defenders',
  }),
}))

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
const WEAPON = 'i260100'
const GATE = 100001
const MASTER_LEVEL = 20

beforeEach(async () => {
  await truncateAll(db)
  outcome.won = true
})
afterAll(() => close())

/** An active i320002 at `level`. */
async function givePet(characterId: string, level = 1, exp = 0) {
  const [pet] = await db
    .insert(characterPets)
    .values({
      characterId,
      species: 'i320002',
      kennelSlot: 0,
      active: true,
      level,
      exp,
      growth: 1,
      baseAttack: 1,
      baseDefence: 1,
      baseDisturb: 1,
      baseActive: 1,
      baseSavvy: 1,
    })
    .returning()
  return pet!
}
const petOf = async (characterId: string) =>
  (await db.select().from(characterPets).where(eq(characterPets.characterId, characterId)))[0]!

type FightBody = { won: boolean; rewards: { exp: number } }

/** Fights the run's points until one pays EXP (group NPCs pay none; sub gate clears do). */
async function untilExp(fight: () => Promise<{ json: () => FightBody }>) {
  let body = (await fight()).json()
  for (let point = 1; body.won && body.rewards.exp === 0 && point < 10; point++)
    body = (await fight()).json()
  return body
}

/** The pet after the master gained `masterExp` (the cap is the master's level after the win). */
const expectShare = async (
  pet: typeof characterPets.$inferSelect,
  masterExp: number,
  masterLevel: number,
) => {
  expect(masterExp).toBeGreaterThan(0)
  const expected = petLevelFromExp(pet.level, pet.exp, petExpShare(masterExp), masterLevel)
  expect(await petOf(pet.characterId)).toMatchObject({ level: expected.level, exp: expected.exp })
}

describe('solo pet EXP', () => {
  let ninja: Awaited<ReturnType<typeof setUpNinja>>
  beforeEach(async () => {
    ninja = await setUpNinja(db)
    await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    await ninja.ready(MASTER_LEVEL)
  })
  afterEach(() => ninja.app.close())

  const tollGateFight = async () => {
    await ninja.client.post('/api/game/gates/enter', { gateId: GATE })
    return untilExp(() => ninja.client.post('/api/game/gates/run/fight'))
  }
  const lasNoches = (path: string) => ninja.client.post(`/api/game/gates/las-noches${path}`)
  const setRun = (values: Partial<typeof singleGate.$inferInsert>) =>
    db.insert(singleGate).values({ characterId: ninja.characterId, ...values })

  it('a toll gate win gives the active pet 50% of the EXP', async () => {
    const pet = await givePet(ninja.characterId)
    const body = await tollGateFight()
    expect(body.won).toBe(true)
    await expectShare(pet, body.rewards.exp, (await ninja.row()).level)
  })

  it('the pet never passes the master level', async () => {
    // One EXP short of level 21: any share would level it without the master cap.
    const toNext = petFoods.exp[MASTER_LEVEL - 1]!
    const pet = await givePet(ninja.characterId, MASTER_LEVEL, toNext - 1)
    const body = await tollGateFight()
    expect(body.won).toBe(true)
    await expectShare(pet, body.rewards.exp, (await ninja.row()).level)
    expect((await petOf(ninja.characterId)).level).toBe(MASTER_LEVEL)
  })

  it('a toll gate loss gives the pet nothing', async () => {
    const pet = await givePet(ninja.characterId)
    outcome.won = false
    expect((await tollGateFight()).won).toBe(false)
    expect(await petOf(ninja.characterId)).toMatchObject({ level: pet.level, exp: 0 })
  })

  it('without an active pet a toll gate win changes no pet', async () => {
    await givePet(ninja.characterId)
    await db.update(characterPets).set({ active: false })
    expect((await tollGateFight()).rewards.exp).toBeGreaterThan(0)
    expect(await petOf(ninja.characterId)).toMatchObject({ level: 1, exp: 0 })
  })

  it('a won last Las Noches floor pays the pot and the pet its share', async () => {
    const pet = await givePet(ninja.characterId)
    await setRun({ currentFloor: 170, potExp: 5000, lives: 1 })
    const body = (await lasNoches('/fight')).json()
    expect(body.won).toBe(true)
    await expectShare(pet, body.potPaid, (await ninja.row()).level)
  })

  it('a won Las Noches floor that goes on, and a loss with a life, pay nothing yet', async () => {
    await givePet(ninja.characterId)
    await setRun({ currentFloor: 4, potExp: 120, lives: 1 })
    expect((await lasNoches('/fight')).json()).toMatchObject({ won: true, potPaid: null })
    outcome.won = false
    expect((await lasNoches('/fight')).json()).toMatchObject({ won: false, potPaid: null })
    expect(await petOf(ninja.characterId)).toMatchObject({ level: 1, exp: 0 })
  })

  it('a Las Noches withdraw gives the pet its share of the pot', async () => {
    const pet = await givePet(ninja.characterId)
    await setRun({ currentFloor: 4, potExp: 5000, lives: 1 })
    const body = (await lasNoches('/withdraw')).json()
    await expectShare(pet, body.potPaid, (await ninja.row()).level)
  })

  it('a finished auto run gives the pet its share of the pot', async () => {
    const pet = await givePet(ninja.characterId)
    await setRun({
      mode: 1,
      currentFloor: 1,
      potExp: 5000,
      autoRunsLeft: 1,
      autoRunsBought: 1,
      autoEndFloor: 160,
      autoReachFloor: 1,
      autoTickAt: new Date(Date.now() - 31000),
    })
    await ninja.client.get('/api/game/gates/las-noches')
    expect((await db.select().from(singleGate))[0]).toMatchObject({ mode: 0, potExp: 0 })
    // Floor 1 adds 355 to the pot before it is paid.
    await expectShare(pet, 5000 + 355, (await ninja.row()).level)
  })
})

describe('team toll gate pet EXP', () => {
  let setup: ReturnType<typeof setUpTeams>
  beforeEach(() => {
    setup = setUpTeams(db)
  })
  afterEach(() => setup.app.close())

  async function ready(n: number) {
    const ninja = await setup.ninja(n, { sceneId: 171, level: MASTER_LEVEL })
    await db
      .insert(inventoryItems)
      .values({ characterId: ninja.id, itemId: WEAPON, equippedSlot: 'Weapon' })
    const { character } = (await ninja.client.get('/api/game/character')).json()
    await ninja.set({ hp: character.maxHp, mp: character.maxMp })
    return ninja
  }

  it("each member's active pet gets 50% of that member's EXP", async () => {
    const ninjas: TestNinja[] = [await ready(1), await ready(2)]
    expect((await join(ninjas[0]!, ninjas[1]!)).statusCode).toBe(200)
    const pets = await Promise.all(ninjas.map((ninja) => givePet(ninja.id)))
    const before = await Promise.all(ninjas.map((ninja) => ninja.row()))
    expect(
      (await ninjas[0]!.client.post('/api/game/gates/enter', { gateId: GATE })).statusCode,
    ).toBe(200)
    const body = await untilExp(() => ninjas[0]!.client.post('/api/game/gates/run/fight'))
    expect(body.won).toBe(true)
    for (const [i, ninja] of ninjas.entries()) {
      const after = await ninja.row()
      // No level-up at this EXP: the gain is the EXP difference.
      expect(after.level).toBe(before[i]!.level)
      await expectShare(pets[i]!, after.exp - before[i]!.exp, after.level)
    }
  })
})
