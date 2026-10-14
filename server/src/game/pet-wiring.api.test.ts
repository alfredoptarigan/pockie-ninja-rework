// The active pet outside the Kennel (M6 decisions 9, 12, 15): adoption by item use, its fight
// input on live fighters and arena defences, and its share of field fight EXP. Fights are won.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { petExpShare, petLevelFromExp } from '../../../game-core/src/pets/exp.js'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { arenaPlayers, characterPets } from '../db/schema.js'
import { setUpNinja } from '../modules/gates/test-setup.js'
import { fightMonster, playerFighter } from './combat.js'

vi.mock('@pockie/game-core', async (original) => {
  const core = await original<typeof import('@pockie/game-core')>()
  return {
    ...core,
    simulateFight: (input: { attackers: { hp: number; mp: number }[]; seed: number }) => ({
      seed: input.seed,
      fighters: [
        { index: 0, side: 'attackers', hp: input.attackers[0]!.hp, mp: input.attackers[0]!.mp },
      ],
      events: [],
      winner: 'attackers',
    }),
  }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(30, 2101)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const pets = () =>
  db.select().from(characterPets).where(eq(characterPets.characterId, ninja.characterId))

/** Adopts i320002 through POST /items/:id/use and makes it the active pet. */
async function activePet(level = 1) {
  const item = await ninja.give('i320002', { bound: true })
  expect((await ninja.client.post(`/api/game/items/${item.id}/use`)).statusCode).toBe(200)
  await db
    .update(characterPets)
    .set({ level })
    .where(eq(characterPets.characterId, ninja.characterId))
  const [pet] = await pets()
  expect(
    (await ninja.client.post(`/api/game/pets/${pet!.id}/active`, { active: true })).statusCode,
  ).toBe(200)
  return pet!
}

describe('pet wiring', () => {
  it('adopts a pet item through item use and uses the item up', async () => {
    const item = await ninja.give('i320002', { bound: true })
    expect((await ninja.client.post(`/api/game/items/${item.id}/use`)).statusCode).toBe(200)
    expect(await pets()).toMatchObject([{ species: 'i320002' }])
    expect(await ninja.bag('i320002')).toEqual([])
  })

  it('the active pet rides on the live fighter and the arena defence', async () => {
    await ninja.client.get('/api/game/arena')
    const before = await playerFighter(db, await ninja.row())
    expect(before.pet).toBeUndefined()
    // Level 1 props are below one bonus point; a level 30 pet adds some.
    await activePet(30)
    const after = await playerFighter(db, await ninja.row())
    expect(after.pet).toMatchObject({ species: 'i320002' })
    // Pass skills and props feed bonuses only; the master's skills stay the same.
    expect(after.skills).toEqual(before.skills)
    const changed = (Object.keys(before) as (keyof typeof before)[]).some(
      (key) => typeof before[key] === 'number' && before[key] !== after[key],
    )
    expect(changed).toBe(true)
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, ninja.characterId))
    const snapshot = arena!.snapshot as unknown as {
      fighter: typeof after
      look: { pet?: { species: string } }
    }
    expect(snapshot.fighter.pet).toMatchObject({ species: 'i320002' })
    expect(snapshot.fighter.maxHp).toBe(after.maxHp)
    expect(snapshot.look.pet).toMatchObject({ species: 'i320002' })
  })

  it('a field win gives the active pet 50% of its EXP', async () => {
    const pet = await activePet()
    const { won, rewards } = await db.transaction(async (tx) =>
      fightMonster(tx, await ninja.row(), 'n33017'),
    )
    expect(won).toBe(true)
    expect(rewards.exp).toBeGreaterThan(0)
    const expected = petLevelFromExp(pet.level, pet.exp, petExpShare(rewards.exp), 30)
    const [after] = await db
      .select()
      .from(characterPets)
      .where(and(eq(characterPets.id, pet.id)))
    expect(after).toMatchObject({ level: expected.level, exp: expected.exp })
  })
})
