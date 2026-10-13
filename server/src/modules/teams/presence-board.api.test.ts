import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { arenaPlayers, teamMembers, teams } from '../../db/schema.js'
import { presence } from '../realtime/events.js'
import { sweepTeams } from './routes.js'
import { errorCode, join, setUpTeams, type TestNinja } from './test-setup.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof setUpTeams>

beforeEach(async () => {
  await truncateAll(db)
  setup = setUpTeams(db)
})
afterEach(() => setup.app.close())
afterAll(() => close())

type Three = [TestNinja, TestNinja, TestNinja]
const ninjas = async (count: number) =>
  (await Promise.all(Array.from({ length: count }, (_, i) => setup.ninja(i + 1)))) as Three
const offlineSince = async (id: string) =>
  (await db.select().from(teamMembers).where(eq(teamMembers.characterId, id)))[0]?.offlineSince
const setOffline = (id: string, msAgo: number) =>
  db
    .update(teamMembers)
    .set({ offlineSince: new Date(Date.now() - msAgo) })
    .where(eq(teamMembers.characterId, id))

describe('disconnect grace (decision 15)', () => {
  it('marks a member offline on the last socket and clears it on reconnect', async () => {
    const [a, b] = await ninjas(2)
    await join(a, b)
    // The hooks subscribe when the app is ready.
    await setup.app.ready()
    presence.offline(b.id)
    await vi.waitFor(async () => expect(await offlineSince(b.id)).toBeInstanceOf(Date))
    const team = (await a.team()).json().team
    expect(team.members[1]).toMatchObject({ characterId: b.id, online: false })
    presence.online(b.id)
    await vi.waitFor(async () => expect(await offlineSince(b.id)).toBeNull())
  })

  it('keeps a member inside the grace and removes them after it (a team of two disbands)', async () => {
    const [a, b] = await ninjas(2)
    await join(a, b)
    await setOffline(b.id, 30_000)
    expect((await a.team()).json().team.members).toHaveLength(2)
    await setOffline(b.id, 61_000)
    expect((await a.team()).json().team).toBeNull()
    expect(await db.select().from(teams)).toEqual([])
  })

  it('a reconnect after the grace does not bring the member back', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await join(a, c)
    await setup.app.ready()
    await setOffline(c.id, 61_000)
    presence.online(c.id)
    await vi.waitFor(async () => expect(await offlineSince(c.id)).toBeUndefined())
    expect((await a.team()).json().team.members).toHaveLength(2)
  })

  it('the sweep removes an expired captain and hands the lead over', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await join(a, c)
    await setOffline(a.id, 61_000)
    await sweepTeams(db)
    const [team] = await db.select().from(teams)
    expect(team!.captainId).toBe(b.id)
    expect(await offlineSince(a.id)).toBeUndefined()
  })
})

describe('team stone board', () => {
  it('lists solo ninjas with level and arena tier', async () => {
    const [a, b] = await ninjas(2)
    await db.insert(arenaPlayers).values({ characterId: b.id, tier: 5 })
    const listed = await b.post('board/join')
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toMatchObject({ listed: true, teams: [] })
    const board = (await a.client.get('/api/game/team/board')).json()
    expect(board.solos).toEqual([{ characterId: b.id, name: b.name, level: 20, arenaTier: 5 }])
    expect(board.listed).toBe(false)
    await a.post('board/join')
    expect((await a.client.get('/api/game/team/board')).json().solos).toHaveLength(2)
    expect((await b.post('board/leave')).json().solos).toEqual([
      expect.objectContaining({ characterId: a.id, arenaTier: null }),
    ])
  })

  it('lists a team of two until it fills up', async () => {
    const [a, b, c] = await ninjas(3)
    await c.post('board/join')
    await join(a, b)
    expect(errorCode(await b.post('board/join'))).toBe('not_captain')
    await a.post('board/join')
    const board = (await c.client.get('/api/game/team/board')).json()
    expect(board.teams).toEqual([
      expect.objectContaining({
        captain: expect.objectContaining({ characterId: a.id }),
        member: expect.objectContaining({ characterId: b.id }),
      }),
    ])
    // Joining from the board is an application.
    await c.post('apply', { characterId: a.id })
    const prompt = (await a.team()).json().prompts[0]
    await a.post(`prompts/${prompt.id}/accept`)
    const after = (await a.client.get('/api/game/team/board')).json()
    expect(after).toMatchObject({ teams: [], solos: [] })
    expect(errorCode(await a.post('board/join'))).toBe('cannot_list')
  })

  it('only works at a team stone', async () => {
    const a = await setup.ninja(1, { sceneId: 171 })
    expect(errorCode(await a.client.get('/api/game/team/board'))).toBe('not_here')
  })
})
