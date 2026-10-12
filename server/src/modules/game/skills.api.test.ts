// Skills in server fights: fighters built from avatar-skills / npc-records, MP saved after a fight.
import { simulateFight } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, inventoryItems } from '../../db/schema.js'
import {
  EXPLORE_MIN_HP,
  fightMonster,
  monsterFighter,
  playerFighter,
  skillRows,
} from '../../game/combat.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

const SEEDS = Array.from({ length: 40 }, (_, seed) => seed)
const SKILL_EVENT = 14

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  // Clothing 3: Ggio Vega (AvatarID 3), skills 1903 (ultimate), 7777, 8888, 2040 (passive).
  const response = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = response.json().character.id
  await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
  await db.insert(inventoryItems).values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })
})
afterEach(() => app.close())
afterAll(() => close())

const character = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!

describe('fighter builder', () => {
  it('gives a starting ninja its outfit skills and avatar level', async () => {
    const player = await playerFighter(db, await character())
    expect(player.skills?.map((s) => s.id)).toEqual([1903, 7777, 8888, 2040])
    expect(player.skills?.[0]).toMatchObject({
      id: 1903,
      type: 1,
      javascript: 'skill/skill_aoyi_1903.js',
    })
    expect(player.avatarLevel).toBe(0)
  })

  it('gives a monster its attack and trigger skills from npc-records', () => {
    const boss = monsterFighter('n32002')
    expect(boss.skills?.map((s) => s.id)).toEqual([40036, 40031, 40033, 7777, 8888, 1])
    // CounterBombMul is -1: the engine derives the avatar level from the NPC level.
    expect(boss.avatarLevel).toBeUndefined()
  })

  it('skips unknown skill ids instead of failing', () => {
    expect(skillRows([999999, 7777, 0]).map((s) => s.id)).toEqual([7777])
  })

  it('lets the starting ninja land its ultimate and monsters use their skills', async () => {
    const player = await playerFighter(db, await character())
    const used = (monsterId: string, actor: number) =>
      new Set(
        SEEDS.flatMap((seed) =>
          simulateFight({ attackers: [player], defenders: [monsterFighter(monsterId)], seed })
            .events.filter((e) => e.actor === actor && e.event === SKILL_EVENT)
            .map((e) => e.skillId),
        ),
      )
    // The ultimate needs the target below about 17% HP, so it shows against field monsters.
    expect(used('n33006', 0)).toContain(1903)
    expect(used('n33006', 1)).toContain(40023)
    expect([...used('n32002', 1)].some((id) => [40031, 40033, 40036].includes(id!))).toBe(true)
  })
})

describe('POST /api/game/fight with skills', () => {
  it('saves the MP left after the fight', async () => {
    // Starting outfit skills cost no MP, so an MP above the maximum shows the save: the fight
    // starts clamped to max MP and that value is what must be stored.
    await db.update(characters).set({ mp: 99999 }).where(eq(characters.id, characterId))
    const body = (await client.post('/api/game/fight', { monsterId: 'n33017' })).json()
    expect(body.replay.fighters[0].startMp).toBeLessThan(99999)
    expect(body.character.mp).toBe(body.replay.fighters[0].mp)
    expect((await character()).mp).toBe(body.replay.fighters[0].mp)
  })

  it('saves 0 HP (defeated) and the remaining MP after a lost fight', async () => {
    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    const body = (await client.post('/api/game/fight', { monsterId: 'n32002' })).json()
    expect(body.won).toBe(false)
    expect(body.character).toMatchObject({ hp: 0, mp: body.replay.fighters[0].mp })
  })

  it('leaves 1 HP after a lost explore fight (OutSearchSystem)', async () => {
    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    const result = await db.transaction(async (tx) =>
      fightMonster(tx, await character(), 'n32002', EXPLORE_MIN_HP),
    )
    expect(result.won).toBe(false)
    expect((await character()).hp).toBe(1)
  })
})
