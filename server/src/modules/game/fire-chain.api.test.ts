// Plays the Fire main chain through the neutral zone, 10025 to 10045 (levels 16-25), with only
// the public API: travel, talk, fight. docs/original-data/fields-26xx-28xx.md.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'
import { subTasks, task } from '../../game/data.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string
const MAX_TRIES = 60
/** Requests per app before a fresh one (the per-route rate limits are per process). */
const REQUESTS_PER_APP = 40
let requests = 0

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

/** Same session on a fresh app, so the test is not rate limited. */
async function call(method: 'get' | 'post', url: string, body?: object) {
  if (++requests % REQUESTS_PER_APP === 0) {
    const previous = client
    await app.close()
    app = buildTestApp(db)
    client = new Client(app)
    for (const pair of previous.cookieHeader.split('; ')) {
      const [name = '', value = ''] = pair.split('=')
      client.setCookie(name, value)
    }
    client.csrfToken = previous.csrfToken
  }
  const response = method === 'get' ? await client.get(url) : await client.post(url, body)
  expect(response.statusCode, `${url} ${response.body}`).toBe(200)
  return response.json()
}

async function quest(taskId: number) {
  const [row] = await db
    .select()
    .from(characterQuests)
    .where(and(eq(characterQuests.characterId, characterId), eq(characterQuests.taskId, taskId)))
  return row
}

async function goTo(sceneId: number) {
  const [row] = await db.select().from(characters).where(eq(characters.id, characterId))
  if (row!.sceneId !== sceneId) await call('post', '/api/game/travel', { sceneId })
}

async function fight(monsterId: string) {
  // Fresh HP for each try: the chain is about quest flow, not about surviving.
  await db.update(characters).set({ hp: 2000, mp: 2000 }).where(eq(characters.id, characterId))
  await call('post', '/api/game/fight', { monsterId })
}

const TALK = 3
const KILL = 2
const COLLECT = 1

async function playStep(taskId: number, step: ReturnType<typeof subTasks>[number]) {
  const index = Number(step.SetpSeq)
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const row = await quest(taskId)
    if (!row || row.state !== 0 || (row.progress[index] ?? 0) >= Number(step.TargetRequireNum)) {
      return
    }
    await goTo(Number(step.SubmitSceneID))
    const type = Number(step.SubTaskType)
    if (type === TALK) await call('post', `/api/game/npcs/${step.TargetConfiger}/talk`)
    else if (type === KILL || type === COLLECT) await fight(String(step.TargetConfiger))
    else throw new Error(`Step type ${type} of ${taskId} is not played here`)
  }
  throw new Error(`Step ${index} of ${taskId} never finished`)
}

describe('Fire main chain through the neutral zone', () => {
  it('plays 10025 to 10045 and leads on to 10046', { timeout: 300_000 }, async () => {
    // As if 10024 was just handed in; level 40 so the chain's bosses (up to Lv. 25) can be beaten.
    await db
      .update(characters)
      .set({ level: 40, sceneId: 2101 })
      .where(eq(characters.id, characterId))
    // A strong weapon (L56 gloves) so the bosses fall in a few tries: this tests the quest flow.
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i270112', equippedSlot: 'Weapon' })
    await db.insert(characterQuests).values({ characterId, taskId: 10025, progress: [0] })

    for (let taskId = 10025; taskId <= 10045; taskId++) {
      expect(await quest(taskId), `quest ${taskId} accepted`).toBeDefined()
      for (const step of subTasks(taskId)) await playStep(taskId, step)
      if ((await quest(taskId))!.state !== 2) {
        const row = task(taskId)!
        await goTo(Number(row.SubmitNpcSceneID))
        await call('post', `/api/game/npcs/${row.SubmitNpcConfig}/talk`)
      }
      expect((await quest(taskId))!.state, `quest ${taskId} handed in`).toBe(2)
    }
    expect(await quest(10046)).toMatchObject({ state: 0 })
    // Collected quest items were handed in with their quests.
    const left = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, characterId))
    expect(left.map((row) => row.itemId)).not.toContain('i140015')
  })
})
