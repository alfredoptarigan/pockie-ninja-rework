// Plays each village tutorial chain (RookieTaskSystem) end to end through the API.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

const MAX_FIGHT_ATTEMPTS = 50

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
})
afterEach(() => app.close())
afterAll(() => close())

interface QuestRow {
  taskId: number
  state: number
}
interface ItemRow {
  id: string
  itemId: string
}

const quests = async (): Promise<QuestRow[]> => (await client.get('/api/game/quests')).json().quests
const itemRow = async (itemId: string): Promise<ItemRow | undefined> =>
  (await client.get('/api/game/inventory'))
    .json()
    .items.find((row: ItemRow) => row.itemId === itemId)

async function ok(url: string, payload?: object) {
  const response = await client.post(url, payload)
  expect(response.statusCode, `${url}: ${response.body}`).toBe(200)
  return response.json()
}

const travel = (sceneId: number) => ok('/api/game/travel', { sceneId })
const accept = (taskId: number) => ok(`/api/game/quests/${taskId}/accept`)
const talk = (npcId: string) => ok(`/api/game/npcs/${npcId}/talk`)

async function useItem(itemId: string) {
  const row = await itemRow(itemId)
  expect(row, `${itemId} in the bag`).toBeDefined()
  return ok(`/api/game/items/${row!.id}/use`)
}

/** Fights until a win; HP is refilled between attempts like a player drinking potions. */
async function winFight(monsterId: string) {
  for (let attempt = 0; attempt < MAX_FIGHT_ATTEMPTS; attempt++) {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId))
    const maxHp = (await client.get('/api/game/character')).json().character.maxHp
    if (row!.hp < maxHp) {
      await db.update(characters).set({ hp: maxHp }).where(eq(characters.id, characterId))
    }
    const body = await ok('/api/game/fight', { monsterId })
    if (body.won) return body
  }
  throw new Error(`Could not beat ${monsterId}`)
}

const villages = [
  {
    nation: 0,
    name: 'Fire',
    village: 111,
    field: 2101,
    hub: 'n11001',
    scout: 'n21001',
    base: 90000,
    main: 10001,
  },
  {
    nation: 1,
    name: 'Water',
    village: 121,
    field: 2201,
    hub: 'n12001',
    scout: 'n22001',
    base: 91000,
    main: 12001,
  },
  {
    nation: 4,
    name: 'Lightning',
    village: 131,
    field: 2301,
    hub: 'n13001',
    scout: 'n23001',
    base: 92000,
    main: 14001,
  },
  {
    nation: 3,
    name: 'Wind',
    village: 141,
    field: 2401,
    hub: 'n14001',
    scout: 'n24001',
    base: 93000,
    main: 16001,
  },
  {
    nation: 2,
    name: 'Earth',
    village: 151,
    field: 2501,
    hub: 'n15001',
    scout: 'n25001',
    base: 94000,
    main: 18001,
  },
]

describe.each(villages)('$name Village tutorial', (v) => {
  it(`plays ${v.base} → ${v.base + 15} and unlocks main quest ${v.main}`, async () => {
    // Clothing 3 (Ggio Vega) fights with fists.
    const created = await client.post('/api/game/characters', {
      name: 'Ninja_01',
      gender: 0,
      clothing: 3,
      nation: v.nation,
    })
    characterId = created.json().character.id
    const q = (step: number) => v.base + step
    const done = (body: { completed: number[] }, step: number) =>
      expect(body.completed).toContain(q(step))

    // 0-3 in the village: talk, open the newbie pack, equip the weapon, talk again.
    done(await talk(v.hub), 0)
    done(await useItem('i159104'), 1)
    await accept(q(2))
    done(await ok(`/api/game/items/${(await itemRow('i270100'))!.id}/equip`), 2)
    await accept(q(3))
    done(await talk(v.hub), 3)

    // 4-7: kill steps in the first field, accepted alternately at the scout and the hub.
    await travel(v.field)
    await accept(q(4))
    done(await winFight('n33017'), 4)
    await travel(v.village)
    await accept(q(5))
    await travel(v.field)
    done(await winFight('n33006'), 5)
    await accept(q(6))
    done(await winFight('n33006'), 6)
    await travel(v.village)
    await accept(q(7))
    await travel(v.field)
    done(await winFight('n33017'), 7)

    // 8: the reward potion is used in the field (auto-accepted).
    expect(await quests()).toContainEqual(expect.objectContaining({ taskId: q(8), state: 0 }))
    done(await useItem('i160050'), 8)

    // 9-11: talk steps between the hub and the scout.
    await travel(v.village)
    await accept(q(9))
    await travel(v.field)
    done(await talk(v.scout), 9)
    await accept(q(10))
    await travel(v.village)
    done(await talk(v.hub), 10)
    await accept(q(11))
    await travel(v.field)
    done(await talk(v.scout), 11)

    // 12: collect the quest item from a Sushi Monster; it is taken on completion.
    await accept(q(12))
    done(await winFight('n33026'), 12)
    expect(await itemRow('i140028')).toBeUndefined()

    // 13-15: report back, then open the reward pack.
    await travel(v.village)
    await accept(q(13))
    await travel(v.field)
    done(await talk(v.scout), 13)
    await accept(q(14))
    await travel(v.village)
    done(await talk(v.hub), 14)
    done(await useItem('i159110'), 15)

    const open = await quests()
    expect(open.filter((quest) => quest.taskId >= v.base && quest.taskId <= q(15))).toEqual([])
    expect(open).toContainEqual(expect.objectContaining({ taskId: v.main, state: 0 }))
  })
})
