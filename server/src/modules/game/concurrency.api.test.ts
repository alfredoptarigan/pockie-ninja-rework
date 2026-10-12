// Concurrent game actions on one character (security review M2, finding 1). Each race is made
// deterministic: another connection holds the character row lock while the requests start one by
// one, each runs until it waits on a lock, then the row is released.
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { LightMyRequestResponse } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'
import { subTasks } from '../../game/data.js'
import { completeQuest, consumeOne } from '../../game/progress.js'

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
  // Clothing 3: Ggio Vega (fists), Fire Village (111), level 1 max HP 220.
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
const NEWBIE_PACK = 'i159104'
const PACK_CONTENTS = ['i159105', 'i250100', 'i260100', 'i270100']
const HP_POUCH_ITEM = 'i160050'
const POUCH_REFILL = 1000
// Quest 10014: handed in to n21002 in Forge Highlands (2101) for i140030, 446 Stone and 598 EXP.
const HANDED_IN_QUEST = 10014
const QUEST_REWARD = { itemId: 'i140030', stone: 446, exp: 598 }
const READY = 1
const COMPLETED = 2
const LOCK_WAIT_TIMEOUT_MS = 2_000
const POLL_MS = 5

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
/** Unequipped items as itemId -> total count. */
async function bag() {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNull(inventoryItems.equippedSlot)))
  const counts: Record<string, number> = {}
  for (const item of rows) counts[item.itemId] = (counts[item.itemId] ?? 0) + item.count
  return counts
}
const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0)

const fight = () => client.post('/api/game/fight', { monsterId: SUNFLOWER })
const useItem = (id: string) => () => client.post(`/api/game/items/${id}/use`)
const talk = (npcId: string) => () => client.post(`/api/game/npcs/${npcId}/talk`)
const errorCode = (response: LightMyRequestResponse) => response.json().error.code

async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  for (;;) {
    const [{ waiting }] = (await db.execute(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    )) as unknown as [{ waiting: number }]
    if (waiting >= count) return
    if (Date.now() > deadline) throw new Error(`Expected ${count} requests waiting on a lock`)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

/**
 * Holds the character row lock, starts the requests in order (each until it waits on a lock),
 * then releases the row and returns the responses in start order.
 */
async function race(requests: (() => Promise<LightMyRequestResponse>)[]) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let locked!: () => void
  const isLocked = new Promise<void>((resolve) => (locked = resolve))
  const holder = db.transaction(async (tx) => {
    await tx.select().from(characters).where(eq(characters.id, characterId)).for('update')
    locked()
    await released
  })
  await isLocked
  const pending: Promise<LightMyRequestResponse>[] = []
  try {
    for (const request of requests) {
      pending.push(request())
      await waitForLockWaiters(pending.length)
    }
  } finally {
    release()
    await holder
  }
  return Promise.all(pending)
}

async function inField(values: Partial<typeof characters.$inferInsert> = {}) {
  await update({ sceneId: 2101, ...values })
  await giveItem('i270100', { equippedSlot: 'Weapon' })
}

describe('concurrent actions on one character', () => {
  it('opens a count-1 box once: one payout, the second request finds no item', async () => {
    const pack = await giveItem(NEWBIE_PACK, { bound: true })

    const [first, second] = await race([useItem(pack.id), useItem(pack.id)])

    expect(first!.statusCode).toBe(200)
    expect(second!.statusCode).toBe(404)
    expect(errorCode(second!)).toBe('no_item')
    expect(await bag()).toEqual(Object.fromEntries(PACK_CONTENTS.map((id) => [id, 1])))
  })

  it('pays a ready quest handed in twice at once only once', async () => {
    await update({ level: 10, exp: 0, sceneId: 2101 })
    await db.insert(characterQuests).values({
      characterId,
      taskId: HANDED_IN_QUEST,
      state: READY,
      progress: subTasks(HANDED_IN_QUEST).map((step) => Number(step.TargetRequireNum)),
    })

    const [first, second] = await race([talk('n21002'), talk('n21002')])

    expect([first!.statusCode, second!.statusCode]).toEqual([200, 200])
    expect([first!.json().completed, second!.json().completed]).toEqual([[HANDED_IN_QUEST], []])
    expect(await bag()).toEqual({ [QUEST_REWARD.itemId]: 1 })
    expect(await row()).toMatchObject({ stone: QUEST_REWARD.stone, exp: QUEST_REWARD.exp })
    const [quest] = await db
      .select()
      .from(characterQuests)
      .where(eq(characterQuests.taskId, HANDED_IN_QUEST))
    expect(quest!.state).toBe(COMPLETED)
  })

  it('adds up the EXP, Stone and drops of two fights at once', async () => {
    // Level 5: two Sunflowers (8 EXP each) do not level up; the pouch refills HP between fights.
    await inField({ level: 5, exp: 0, stone: 0, hpPouch: 5000 })

    const [first, second] = await race([fight, fight])

    const bodies = [first!.json(), second!.json()]
    expect(bodies.map((body) => body.won)).toEqual([true, true])
    const after = await row()
    expect(after.exp).toBe(bodies[0].rewards.exp + bodies[1].rewards.exp)
    expect(after.stone).toBe(bodies[0].rewards.stone + bodies[1].rewards.stone)
    expect(total(await bag())).toBe(bodies[0].rewards.items.length + bodies[1].rewards.items.length)
    // The fight that ran second reports the final state.
    expect(second!.json().character).toMatchObject({ exp: after.exp, stone: after.stone })
  })

  it('keeps a pouch refill used while a fight is running', async () => {
    await inField({ hp: 150, hpPouch: 1000 })
    const pouch = await giveItem(HP_POUCH_ITEM)

    const [fought, used] = await race([fight, useItem(pouch.id)])

    expect([fought!.statusCode, used!.statusCode]).toEqual([200, 200])
    const { won, replay } = fought!.json()
    expect(won).toBe(true)
    const drawn = MAX_HP - replay.fighters[0].hp
    expect(await row()).toMatchObject({ hp: MAX_HP, hpPouch: 1000 - drawn + POUCH_REFILL })
    expect(await bag()).toEqual({})
  })

  it('refuses an NPC talk queued behind travel to another scene', async () => {
    const travel = () => client.post('/api/game/travel', { sceneId: 2101 })

    // Quest 90000 is "talk to the Village Elder (n11001) in 111".
    const [travelled, talked] = await race([travel, talk('n11001')])

    expect(travelled!.statusCode).toBe(200)
    expect(talked!.statusCode).toBe(400)
    expect(errorCode(talked!)).toBe('not_here')
    expect(await row()).toMatchObject({ sceneId: 2101, exp: 0, stone: 0 })
    expect(await bag()).toEqual({})
    const [quest] = await db.select().from(characterQuests).where(eq(characterQuests.taskId, 90000))
    expect(quest!.state).toBe(0)
  })

  it('revives once when two revives race', async () => {
    await update({ hp: 0, gold: 5, sceneId: 2101 })
    const revive = () => client.post('/api/game/revive', { mode: 'gold' })

    const [first, second] = await race([revive, revive])

    expect(first!.statusCode).toBe(200)
    expect(second!.statusCode).toBe(400)
    expect(errorCode(second!)).toBe('not_defeated')
    expect((await row()).gold).toBe(4)
  })
})

describe('atomic state changes', () => {
  it('consumeOne fails when the item row was already used up', async () => {
    const potion = await giveItem('i160006')
    await expect(
      db.transaction(async (tx) => {
        await consumeOne(tx, potion)
        await consumeOne(tx, potion)
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(await bag()).toEqual({ i160006: 1 })
  })

  it('completeQuest pays only the call that claims the ready quest', async () => {
    await update({ level: 10, exp: 0 })
    await db
      .insert(characterQuests)
      .values({ characterId, taskId: HANDED_IN_QUEST, state: READY, progress: [0] })

    const claims = await db.transaction(async (tx) => [
      await completeQuest(tx, characterId, HANDED_IN_QUEST),
      await completeQuest(tx, characterId, HANDED_IN_QUEST),
    ])

    expect(claims).toEqual([true, false])
    expect(await bag()).toEqual({ [QUEST_REWARD.itemId]: 1 })
    expect(await row()).toMatchObject({ stone: QUEST_REWARD.stone, exp: QUEST_REWARD.exp })
  })
})
