import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterDailyQuests,
  characterQuests,
  characters,
  characterWeeklyRewards,
  inventoryItems,
} from '../../db/schema.js'
import { subTasks, task } from '../../game/data.js'
import { expUpdate, loadQuests, saveQuests } from '../../game/progress.js'
import { questRewards, recordCollect, recordKill } from '../../game/quests.js'

// Stable weighted rolls and fight seed; all other crypto stays real.
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomInt: () => 0,
}))

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let id: string
beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Daily_player',
    email: 'daily@example.com',
    password: 'believe-it',
  })
  id = (
    await client.post('/api/game/characters', {
      name: 'Daily_ninja',
      gender: 0,
      clothing: 3,
      nation: 0,
    })
  ).json().character.id
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T23:59:00Z'))
  await db.update(characters).set({ sceneId: 2601, level: 20 }).where(eq(characters.id, id))
})
afterEach(async () => {
  vi.useRealTimers()
  await app.close()
})
afterAll(close)
const board = () => client.get('/api/game/daily')
const accept = (taskId: number) => client.post(`/api/game/daily/${taskId}/accept`)
const handIn = (taskId: number) => client.post(`/api/game/daily/${taskId}/hand-in`)
async function offer(taskId: number) {
  await board()
  await db.insert(characterDailyQuests).values({ characterId: id, taskId }).onConflictDoNothing()
}
async function advance(taskId: number) {
  await db.transaction(async (tx) => {
    for (const step of subTasks(taskId)) {
      for (let i = 0; i < Number(step.TargetRequireNum); i++) {
        const quests = await loadQuests(tx, id)
        await saveQuests(
          tx,
          id,
          Number(step.SubTaskType) === 2
            ? recordKill(quests, String(step.TargetConfiger), Number(step.SubmitSceneID))
            : recordCollect(quests, String(step.TargetItem)),
        )
      }
    }
  })
}
describe('DayTaskSystem daily board', () => {
  it('picks unique eligible neutral tasks by level band and keeps the pick between reads', async () => {
    const first = (await board()).json()
    expect(first.quests.length).toBeLessThanOrEqual(5)
    expect(new Set(first.quests.map((q: { taskId: number }) => q.taskId)).size).toBe(
      first.quests.length,
    )
    for (const q of first.quests) {
      expect(Number(task(q.taskId)!.IsRecycle)).toBe(0)
      expect(Number(task(q.taskId)!.RequireLevel)).toBeLessThanOrEqual(20)
      expect(
        subTasks(q.taskId).some(
          (s) => Number(s.SubmitSceneID) >= 2601 && Number(s.SubmitSceneID) <= 2804,
        ),
      ).toBe(true)
    }
    expect((await board()).json()).toEqual(first)
    expect(first.resetAt).toBe('2026-10-13T00:00:00.000Z')
    expect(
      (await client.get('/api/game/quests'))
        .json()
        .quests.some((q: { taskId: number }) =>
          first.quests.some((d: { taskId: number }) => d.taskId === q.taskId),
        ),
    ).toBe(false)
  })
  it('accepts into the original shared quest records, progresses kills and pays rewards once', async () => {
    const taskId = 2160102
    await offer(taskId)
    expect((await accept(taskId)).statusCode).toBe(200)
    expect((await accept(taskId)).statusCode).toBe(400)
    // TaskAccepted_Rec includes accepted dailies in the original normal quest list.
    expect((await client.get('/api/game/quests')).json().quests).toContainEqual(
      expect.objectContaining({ taskId, state: 0 }),
    )
    expect((await handIn(taskId)).statusCode).toBe(400)
    await advance(taskId)
    expect((await board()).json().quests).toContainEqual(
      expect.objectContaining({ taskId, state: 2, progress: [12] }),
    )
    const before = (await db.select().from(characters).where(eq(characters.id, id)))[0]!
    const result = await handIn(taskId)
    expect(result.statusCode).toBe(200)
    expect(result.json().reward).toMatchObject(questRewards(taskId))
    const after = (await db.select().from(characters).where(eq(characters.id, id)))[0]!
    expect(after.stone).toBe(before.stone + questRewards(taskId).stone)
    const { level, exp } = expUpdate(before, questRewards(taskId).exp)
    expect(after).toMatchObject({ level, exp })
    expect((await client.get('/api/game/quests/available')).json().completed).not.toContain(taskId)
    expect(after.dailyQuestsCompleted).toBe(1)
    expect(after.dailyScore).toBe(Number(task(taskId)!.RewardScore))
    expect((await handIn(taskId)).statusCode).toBe(400)
  })
  it('uses the same collect rules for daily progress', async () => {
    const taskId = 2260102
    await offer(taskId)
    expect((await accept(taskId)).statusCode).toBe(200)
    await advance(taskId)
    const [q] = await db
      .select()
      .from(characterQuests)
      .where(and(eq(characterQuests.characterId, id), eq(characterQuests.taskId, taskId)))
    expect(q!.state).toBe(1)
    await db
      .insert(inventoryItems)
      .values({ characterId: id, itemId: 'i140016', count: 12, bound: true })
    const reward = (await handIn(taskId)).json().reward
    expect(reward.items).toHaveLength(1)
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, id))
    expect(items.some((item) => item.itemId === 'i140016')).toBe(false)
    expect(items).toContainEqual(
      expect.objectContaining({ itemId: reward.items[0].itemId, bound: true }),
    )
  })
  it('resets UTC counters but carries unfinished quests across midnight', async () => {
    await offer(2160102)
    await accept(2160102)
    await db
      .update(characters)
      .set({ dailyQuestsCompleted: 19, dailyQuestsAccepted: 20 })
      .where(eq(characters.id, id))
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
    const next = (await board()).json()
    expect(next).toMatchObject({ day: '2026-10-13', accepted: 1, completed: 0 })
    expect(next.quests).toContainEqual(expect.objectContaining({ taskId: 2160102, state: 1 }))
  })
  it('refuses outside neutral fields, unknown/unoffered tasks, and unauthenticated reads', async () => {
    expect((await accept(90000)).statusCode).toBe(400)
    expect((await accept(99999999)).statusCode).toBe(400)
    expect((await client.post('/api/game/quests/2160102/accept')).json().error.code).toBe(
      'daily_quest',
    )
    await db.update(characters).set({ sceneId: 111 }).where(eq(characters.id, id))
    expect((await board()).statusCode).toBe(400)
    expect((await accept(2160102)).statusCode).toBe(400)
    expect((await handIn(2160102)).statusCode).toBe(400)
    expect((await app.inject('/api/game/daily')).statusCode).toBe(401)
  })
  it('counts an actual field fight through the shared quest helpers', async () => {
    await offer(2160102)
    await accept(2160102)
    await db
      .update(characters)
      .set({ level: 90, hp: 100000, mp: 100000 })
      .where(eq(characters.id, id))
    await db
      .insert(inventoryItems)
      .values({ characterId: id, itemId: 'i299902', equippedSlot: 'Weapon', durability: 1 })
    const fight = await client.post('/api/game/fight', { monsterId: 'n33016' })
    expect(fight.statusCode).toBe(200)
    const [q] = await db
      .select()
      .from(characterQuests)
      .where(and(eq(characterQuests.characterId, id), eq(characterQuests.taskId, 2160102)))
    expect(q!.progress).toEqual([1])
  })
  it('refreshes expired offers while retaining accepted tasks', async () => {
    await offer(2160102)
    await accept(2160102)
    vi.setSystemTime(new Date('2026-10-13T00:29:00Z'))
    const refreshed = (await board()).json()
    expect(refreshed.refreshAt).toBe('2026-10-13T00:59:00.000Z')
    expect(refreshed.quests).toContainEqual(expect.objectContaining({ taskId: 2160102, state: 1 }))
  })
  it('enforces the accepted limit and serializes concurrent hand-ins', async () => {
    await offer(2160102)
    await db.update(characters).set({ dailyQuestsAccepted: 20 }).where(eq(characters.id, id))
    expect((await accept(2160102)).json().error.code).toBe('daily_limit')
    await db.update(characters).set({ dailyQuestsAccepted: 0 }).where(eq(characters.id, id))
    await accept(2160102)
    await advance(2160102)
    const results = await Promise.all([handIn(2160102), handIn(2160102)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    const [character] = await db.select().from(characters).where(eq(characters.id, id))
    expect(character!.dailyQuestsCompleted).toBe(1)
    // The Weekly Rewards mission activity counts the one hand-in.
    const [weekly] = await db
      .select()
      .from(characterWeeklyRewards)
      .where(eq(characterWeeklyRewards.characterId, id))
    expect(weekly!.counters).toEqual({ mission: 1 })
  })
  it('rolls back rewards and ready state if the reward would overflow the bag', async () => {
    await offer(2260102)
    await accept(2260102)
    await advance(2260102)
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 150 }, () => ({ characterId: id, itemId: 'i270100' })))
    const response = await handIn(2260102)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('bag_full')
    const [character] = await db.select().from(characters).where(eq(characters.id, id))
    expect(character!.dailyQuestsCompleted).toBe(0)
    const [q] = await db
      .select()
      .from(characterQuests)
      .where(and(eq(characterQuests.characterId, id), eq(characterQuests.taskId, 2260102)))
    expect(q!.state).toBe(1)
  })

  it('progresses interactive dailies through the existing NPC talk action', async () => {
    await offer(2365102)
    await accept(2365102)
    expect((await client.post('/api/game/npcs/n26001/talk')).statusCode).toBe(200)
    expect((await board()).json().quests).toContainEqual(
      expect.objectContaining({ taskId: 2365102, state: 2, progress: [1] }),
    )
  })
  it('converts the previous UTC week score to honor once', async () => {
    await db
      .update(characters)
      .set({ dailyScoreWeek: '2026-10-05', dailyScore: 37, honor: 2 })
      .where(eq(characters.id, id))
    await board()
    await board()
    const [character] = await db.select().from(characters).where(eq(characters.id, id))
    expect(character).toMatchObject({ dailyScoreWeek: '2026-10-12', dailyScore: 0, honor: 39 })
  })
  it('ports the optional graded EXP reward choice and checks its currency before claiming', async () => {
    await offer(2160102)
    await accept(2160102)
    await advance(2160102)
    expect(
      (await client.post('/api/game/daily/2160102/hand-in', { selectType: 1 })).json().error.code,
    ).toBe('no_money')
    await db.update(characters).set({ gold: 1 }).where(eq(characters.id, id))
    const result = await client.post('/api/game/daily/2160102/hand-in', { selectType: 1 })
    expect(result.statusCode).toBe(200)
    expect(result.json().reward.exp).toBe(
      questRewards(2160102).exp + Math.floor(questRewards(2160102).exp * 0.25),
    )
    expect(result.json().character.gold).toBe(0)
  })
})
