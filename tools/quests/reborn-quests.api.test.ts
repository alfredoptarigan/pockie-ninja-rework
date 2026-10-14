import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

// These API checks run only with an explicitly supplied private test database.
// Runtime imports keep the tools' erasable-only TS check separate from the server runtime.
const url = process.env.TEST_DATABASE_URL
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('A private *_test database is required')
interface Response {
  statusCode: number
  json<T>(): T
}
interface App {
  close(): Promise<void>
}
interface Client {
  get(path: string): Promise<Response>
  post(path: string, body?: object): Promise<Response>
}
interface Helpers {
  createTestDb(): { db: unknown; close(): Promise<void> }
  truncateAll(db: unknown): Promise<void>
  buildTestApp(db: unknown): App
  Client: new (app: App) => Client
}
interface Sql {
  unsafe<T extends object[]>(query: string, args?: unknown[]): Promise<T>
  end(): Promise<void>
}
interface Quest {
  taskId: number
  navigation: { sceneId?: number; npcId?: string }
  steps: { descriptionArgs?: string[] }[]
}

let helpers: Helpers
let db: unknown
let close: () => Promise<void>
let sql: Sql
let app: App
let client: Client

const villages = [111, 121, 151, 141, 131]
const fields = [2100, 2200, 2500, 2400, 2300]
async function createCharacter(nation: number) {
  expect(
    (
      await client.post('/api/auth/register', {
        username: 'Quest_ninja',
        email: 'quest@example.com',
        password: 'believe-it',
      })
    ).statusCode,
  ).toBe(201)
  const response = await client.post('/api/game/characters', {
    name: 'Quest_01',
    gender: 0,
    clothing: 3,
    nation,
  })
  expect(response.statusCode).toBe(201)
  return response.json<{ character: { id: string } }>().character.id
}

const suite = url ? describe : describe.skip
suite('Reborn quests API (private database)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = url!
    const { runMigrations } = (await import(
      new URL('../../server/src/db/migrate.ts', import.meta.url).href
    )) as {
      runMigrations(url: string, options: { reset: boolean }): Promise<void>
    }
    await runMigrations(url!, { reset: true })
    helpers = (await import(
      new URL('../../server/test/helpers.ts', import.meta.url).href
    )) as Helpers
    const connection = helpers.createTestDb()
    db = connection.db
    close = connection.close
    const { default: postgres } = (await import(
      new URL('../../server/node_modules/postgres/src/index.js', import.meta.url).href
    )) as { default: (url: string) => Sql }
    sql = postgres(url!)
  }, 30000)
  beforeEach(async () => {
    await helpers.truncateAll(db)
    app = helpers.buildTestApp(db)
    client = new helpers.Client(app)
  })
  afterEach(async () => app?.close())
  afterAll(async () => {
    await sql?.end()
    await close?.()
  })

  it.each([0, 1, 2, 3, 4])(
    'offers, accepts and hands in local quests in village %i',
    async (nation) => {
      await createCharacter(nation)
      const offers = (await client.get('/api/game/quests/available')).json<{
        available: { taskId: number; sceneId: number; npcId: string }[]
      }>().available
      const village = villages[nation]!
      const field = fields[nation]! + 1
      const elder = `n${Math.floor(village / 10)}001`
      const genin = `n${fields[nation]! / 100}001`
      expect(offers.find((q) => q.taskId === 820001)).toMatchObject({
        sceneId: village,
        npcId: elder,
      })
      expect(offers.find((q) => q.taskId === 830001)).toMatchObject({
        sceneId: field,
        npcId: genin,
      })
      expect((await client.post('/api/game/quests/820001/accept')).statusCode).toBe(200)
      expect(
        (await client.post(`/api/game/npcs/${elder}/talk`)).json<{ completed: number[] }>()
          .completed,
      ).toContain(820001)
      expect(
        (await client.post('/api/game/quests/830001/accept')).json<{ error: { code: string } }>()
          .error.code,
      ).toBe('wrong_place')
      expect((await client.post('/api/game/travel', { sceneId: field })).statusCode).toBe(200)
      expect((await client.post('/api/game/quests/830001/accept')).statusCode).toBe(200)
      const quest = (await client.get('/api/game/quests'))
        .json<{ quests: Quest[] }>()
        .quests.find((q) => q.taskId === 830001)!
      expect(quest.navigation).toEqual({ sceneId: field, npcId: genin })
      expect(quest.steps[0]!.descriptionArgs).toEqual([`lg_name_${genin}`])
      expect(
        (await client.post(`/api/game/npcs/${genin}/talk`)).json<{ completed: number[] }>()
          .completed,
      ).toContain(830001)
      expect((await client.post('/api/game/quests/830002/accept')).statusCode).toBe(200)
    },
  )

  it('pays the calibration once under concurrent local hand-ins and sends the submit target', async () => {
    const id = await createCharacter(1)
    await sql.unsafe('update characters set level=21, scene_id=2203, stone=0 where id=$1', [id])
    await sql.unsafe(
      "insert into character_quests(character_id,task_id,state,progress) values($1,830021,2,'[]')",
      [id],
    )
    expect((await client.post('/api/game/quests/830022/accept')).statusCode).toBe(200)
    const held = (await client.get('/api/game/quests'))
      .json<{ quests: Quest[] }>()
      .quests.find((q) => q.taskId === 830022)!
    expect(held.navigation).toEqual({ sceneId: 2203, npcId: 'n33010' })
    expect(held.steps[1]!.descriptionArgs).toEqual(['lg_name_n33021'])
    await sql.unsafe(
      "update character_quests set state=1,progress='[8,6]' where character_id=$1 and task_id=830022",
      [id],
    )
    const ready = (await client.get('/api/game/quests'))
      .json<{ quests: Quest[] }>()
      .quests.find((q) => q.taskId === 830022)!
    expect(ready.navigation).toEqual({ sceneId: 2203, npcId: 'n22004' })
    const responses = await Promise.all([
      client.post('/api/game/npcs/n22004/talk'),
      client.post('/api/game/npcs/n22004/talk'),
    ])
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200])
    expect(
      responses
        .flatMap((r) => r.json<{ completed: number[] }>().completed)
        .filter((q) => q === 830022),
    ).toHaveLength(1)
    expect(
      await sql.unsafe<{ stone: number }[]>(
        'select stone::integer as stone from characters where id=$1',
        [id],
      ),
    ).toEqual([{ stone: 36000 }])
    expect(
      await sql.unsafe<{ state: number }[]>(
        'select state from character_quests where character_id=$1 and task_id=830022',
        [id],
      ),
    ).toEqual([{ state: 2 }])
  })
})
