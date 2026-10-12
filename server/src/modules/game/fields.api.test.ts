import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'

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
  // Clothing 3 (Ggio Vega) fights with fists.
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
})
afterEach(async () => {
  vi.useRealTimers()
  await app.close()
})
afterAll(() => close())

const set = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const give = (itemId: string, count = 1, equippedSlot: string | null = null) =>
  db.insert(inventoryItems).values({ characterId, itemId, count, equippedSlot })
const held = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
  ).reduce((sum, row) => sum + row.count, 0)
const scene = async () => (await client.get('/api/game/scene')).json()
const fight = (monsterId: string) => client.post('/api/game/fight', { monsterId })
const accept = (taskId: number, state = 0) =>
  db.insert(characterQuests).values({ characterId, taskId, progress: [0], state })
/** Fights until a win, refilling HP between tries (the fights are random). */
async function win(monsterId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await set({ hp: 5000, mp: 5000 })
    const body = (await fight(monsterId)).json()
    if (body.won) return body
  }
  throw new Error(`Never beat ${monsterId}`)
}

describe('task bosses (TaskBossNpc TaskID)', () => {
  beforeEach(() => set({ sceneId: 2601, level: 25 }))

  it('shows the boss locked until its quest is taken, and refuses the fight', async () => {
    const boss = (await scene()).monsters.find((m: { id: string }) => m.id === 'n32005')
    expect(boss).toMatchObject({ id: 'n32005', level: 25, lock: 'quest' })
    const response = await fight('n32005')
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('need_quest')
  })

  it('opens the fight while its quest is held or once it is completed', async () => {
    await accept(10045)
    expect((await scene()).monsters.find((m: { id: string }) => m.id === 'n32005').lock).toBe(null)
    expect((await fight('n32005')).statusCode).toBe(200)

    await db.delete(characterQuests).where(eq(characterQuests.characterId, characterId))
    await accept(10045, 2)
    await set({ hp: 500 })
    expect((await fight('n32005')).statusCode).toBe(200)
  })

  it('shows the never-attackable bosses but keeps them locked (decision 8)', async () => {
    await set({ sceneId: 2704, level: 70 })
    const boss = (await scene()).monsters.find((m: { id: string }) => m.id === 'n32030')
    expect(boss).toMatchObject({ lock: 'never' })
    expect((await fight('n32030')).json().error.code).toBe('boss_locked')
  })
})

describe('boss quests with an item (SubTaskType 10)', () => {
  // 10056: defeat Demon Chuuji (n32011) in 2605 while holding the quest item i140040.
  beforeEach(async () => {
    await set({ sceneId: 2605, level: 80 })
    await give('i270112', 1, 'Weapon')
    await accept(10056)
  })

  it('does not count the kill without the item', async () => {
    await win('n32011')
    const [quest] = await db.select().from(characterQuests).where(eq(characterQuests.taskId, 10056))
    expect(quest).toMatchObject({ progress: [0], state: 0 })
  })

  it('counts the kill while holding the item and uses one up', async () => {
    await give('i140040', 2)
    await win('n32011')
    const [quest] = await db.select().from(characterQuests).where(eq(characterQuests.taskId, 10056))
    expect(quest).toMatchObject({ progress: [1], state: 1 })
    expect(await held('i140040')).toBe(1)
  })
})

describe('ticket bosses (RefresHeartNpc, AttackItemConfig i150078)', () => {
  // 2601: Soulender (n320140) appears at :10 for 30 minutes every hour; dates are ignored.
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }
  beforeEach(() => set({ sceneId: 2601, level: 25 }))

  it('tells when the boss is out and when it comes back', async () => {
    at('2026-10-12T12:15:00Z')
    expect((await scene()).ticketBoss).toMatchObject({
      id: 'n320140',
      fightId: 'n320144',
      level: 25,
      active: true,
      ticketItemId: 'i150078',
      tickets: 0,
      endsAt: '2026-10-12T12:40:00.000Z',
    })
    at('2026-10-12T12:45:00Z')
    expect((await scene()).ticketBoss).toMatchObject({
      active: false,
      startsAt: '2026-10-12T13:10:00.000Z',
    })
  })

  it('uses up one ticket per fight against the level variant (LevelAttackRec)', async () => {
    at('2026-10-12T12:15:00Z')
    await give('i150078', 2)
    const response = await fight('n320140')
    expect(response.statusCode).toBe(200)
    expect(response.json().replay.fighters[1]).toMatchObject({ level: 25 })
    expect(await held('i150078')).toBe(1)
  })

  it('refuses without a ticket or while the boss is away', async () => {
    at('2026-10-12T12:15:00Z')
    expect((await fight('n320140')).json().error.code).toBe('no_ticket')
    await give('i150078')
    at('2026-10-12T12:45:00Z')
    expect((await fight('n320140')).json().error.code).toBe('boss_away')
    expect(await held('i150078')).toBe(1)
  })
})

describe('Stone Organization rest (TeamStoneNpc.js, no energy)', () => {
  it('refills HP and MP for Stone by level', async () => {
    await set({ sceneId: 2601, level: 40, hp: 1, mp: 1, stone: 200 })
    const response = await client.post('/api/game/rest', { npcId: 'n26100' })
    expect(response.statusCode).toBe(200)
    const { character } = response.json()
    // -0.005 * 40² + 1.593 * 40 + 61.72 = 117.44 → 117 Stone.
    expect(character).toMatchObject({ stone: 83, hp: character.maxHp, mp: character.maxMp })
  })

  it('refuses when HP and MP are full, Stone is short or nobody rests here', async () => {
    await set({ sceneId: 2601, level: 40, stone: 200, hp: 99999, mp: 99999 })
    expect((await client.post('/api/game/rest', { npcId: 'n26100' })).json().error.code).toBe(
      'full',
    )
    await set({ hp: 1, stone: 10 })
    expect((await client.post('/api/game/rest', { npcId: 'n26100' })).json().error.code).toBe(
      'no_stone',
    )
    await set({ sceneId: 2602 })
    expect((await client.post('/api/game/rest', { npcId: 'n26100' })).json().error.code).toBe(
      'not_here',
    )
  })
})

describe('Angel City and Demon City menus', () => {
  const menus = async () =>
    Object.fromEntries(
      (await scene()).npcs.map((n: { id: string; menu: string | null }) => [n.id, n.menu]),
    )

  it('routes the Angel City buildings to the shop, forge and daily quest windows', async () => {
    await set({ sceneId: 161, level: 20 })
    expect(await menus()).toMatchObject({
      n16001: null,
      n16003: 'forge',
      n16004: 'shop',
      n16005: 'shop',
      n16007: 'shop',
      n16013: 'daily',
    })
  })

  it('names the building picture of each city NPC by its BuildType', async () => {
    await set({ sceneId: 161, level: 20 })
    const clips = Object.fromEntries(
      (await scene()).npcs.map((n: { id: string; clip: string | null }) => [n.id, n.clip]),
    )
    // The table's NameFlag says n16002 for the foundry; BuildType 3 is the Blacksmith.
    expect(clips).toMatchObject({ n16001: 'clip_hall', n16003: 'clip_foundry', n16004: null })
  })

  it('routes the Demon City guards to the gates window', async () => {
    await set({ sceneId: 171, level: 20 })
    expect(await menus()).toMatchObject({ n17001: 'gates', n17003: 'gates', n17006: 'forge' })
  })

  it('lists the world map places that need a visit first', async () => {
    const { visitRequired } = await scene()
    expect(visitRequired).toContain(2101)
    expect(visitRequired).toContain(2601)
    // Nothing walks to Angel City or the 2605 ring from a village: the map keeps them open.
    expect(visitRequired).not.toContain(161)
    expect(visitRequired).not.toContain(2701)
  })
})
