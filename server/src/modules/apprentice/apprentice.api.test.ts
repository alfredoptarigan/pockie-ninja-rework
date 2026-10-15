import type { Notice } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APPRENTICE_CONFIG } from '../../../../game-core/src/social/apprentice.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { apprenticeships, blocks, characters, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { presence } from '../realtime/events.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { masterMinLevel, apprenticeMaxLevel, graduateLevel, maxApprentices, rewards } =
  APPRENTICE_CONFIG

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let notices: [string, Notice][] = []
let offNotice: () => void
const online: string[] = []

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  notices = []
  offNotice = presence.onNotice((id, notice) => notices.push([id, notice]))
})
afterEach(async () => {
  offNotice()
  for (const id of online.splice(0)) presence.offline(id)
  await app.close()
})
afterAll(() => close())

let serial = 0
async function ninja(level: number, { isOnline = true } = {}) {
  const n = ++serial
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: `Teacher_${n}`, email: `teacher${n}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const name = `Teacher_${String(n).padStart(3, '0')}`
  const created = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ level, stone: 0 }).where(eq(characters.id, id))
  if (isOnline) {
    presence.online(id)
    online.push(id)
  }
  const post = (path: string, body: object = {}) =>
    client.post(`/api/game/apprentice/${path}`, body)
  const state = async () => (await client.get('/api/game/apprentice')).json()
  const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
  const setLevel = (next: number) =>
    db.update(characters).set({ level: next }).where(eq(characters.id, id))
  return { id, name, post, state, row, setLevel }
}
type Ninja = Awaited<ReturnType<typeof ninja>>

const code = (response: { json: () => { error?: { code: string } } }) => response.json().error?.code

/** `from` asks `to` by name, `to` accepts. */
async function bind(from: Ninja, to: Ninja) {
  expect((await from.post('request', { name: to.name })).statusCode).toBe(200)
  const [request] = (await to.state()).incoming
  const accepted = await to.post('accept', { requestId: request.id })
  expect(accepted.statusCode).toBe(200)
  return accepted.json()
}

describe('apprentice requests', () => {
  it('lets a master take an apprentice', async () => {
    const master = await ninja(masterMinLevel)
    const pupil = await ninja(20)
    const asked = await master.post('request', { name: pupil.name })
    expect(asked.json().outgoing.senderRole).toBe('master')
    const [request] = (await pupil.state()).incoming
    expect(request.from.name).toBe(master.name)
    expect(notices).toContainEqual([
      pupil.id,
      { kind: 'apprentice', message: `${master.name} wants to be your master.` },
    ])

    const accepted = (await pupil.post('accept', { requestId: request.id })).json()
    expect(accepted.master).toMatchObject({ name: master.name, canGraduate: false })
    expect(accepted.incoming).toEqual([])
    const view = await master.state()
    expect(view.apprentices).toMatchObject([{ name: pupil.name, level: 20, online: true }])
    expect(view.outgoing).toBeNull()
  })

  it('lets an apprentice ask a master', async () => {
    const pupil = await ninja(apprenticeMaxLevel)
    const master = await ninja(masterMinLevel + 10)
    const asked = await pupil.post('request', { name: master.name })
    expect(asked.json().outgoing.senderRole).toBe('apprentice')
    await master.post('accept', { requestId: (await master.state()).incoming[0].id })
    expect((await pupil.state()).master.name).toBe(master.name)
  })

  it('refuses levels that do not fit, self, offline and blocked ninjas', async () => {
    const master = await ninja(masterMinLevel)
    const tooHigh = await ninja(apprenticeMaxLevel + 1)
    const away = await ninja(20, { isOnline: false })
    const blocker = await ninja(20)
    await db.insert(blocks).values({ ownerId: blocker.id, blockedId: master.id })
    expect(code(await master.post('request', { name: tooHigh.name }))).toBe('apprentice_level')
    expect(code(await master.post('request', { name: master.name }))).toBe('self')
    expect(code(await master.post('request', { name: away.name }))).toBe('target_offline')
    expect(code(await master.post('request', { name: blocker.name }))).toBe('blocked')
    expect(code(await master.post('request', { name: 'Nobody_Here' }))).toBe('unknown_name')
  })

  it('keeps one waiting request per sender and declines it', async () => {
    const master = await ninja(masterMinLevel)
    const a = await ninja(20)
    const b = await ninja(20)
    await master.post('request', { name: a.name })
    expect(code(await master.post('request', { name: b.name }))).toBe('request_pending')
    expect(code(await a.post('request', { name: master.name }))).toBe('request_pending')
    const [request] = (await a.state()).incoming
    expect((await a.post('decline', { requestId: request.id })).statusCode).toBe(200)
    expect(notices).toContainEqual([
      master.id,
      { kind: 'apprentice', message: `${a.name} declined your request.` },
    ])
    expect((await master.state()).outgoing).toBeNull()
    expect(code(await a.post('accept', { requestId: request.id }))).toBe('request_gone')
  })

  it('cancels a waiting request', async () => {
    const master = await ninja(masterMinLevel)
    const pupil = await ninja(20)
    await master.post('request', { name: pupil.name })
    expect((await master.post('cancel')).json().outgoing).toBeNull()
    expect((await pupil.state()).incoming).toEqual([])
    expect(code(await master.post('cancel'))).toBe('no_request')
  })

  it('refuses a second master and a full master', async () => {
    const master = await ninja(masterMinLevel)
    const other = await ninja(masterMinLevel)
    const pupils = await Promise.all(Array.from({ length: maxApprentices + 1 }, () => ninja(20)))
    for (const pupil of pupils.slice(0, maxApprentices)) await bind(master, pupil)
    expect(code(await other.post('request', { name: pupils[0]!.name }))).toBe('has_master')
    expect(code(await master.post('request', { name: pupils.at(-1)!.name }))).toBe('master_full')
  })

  it('re-checks the levels on accept', async () => {
    const master = await ninja(masterMinLevel)
    const pupil = await ninja(20)
    await master.post('request', { name: pupil.name })
    await pupil.setLevel(apprenticeMaxLevel + 1)
    const [request] = (await pupil.state()).incoming
    expect(code(await pupil.post('accept', { requestId: request.id }))).toBe('apprentice_level')
    expect(await db.select().from(apprenticeships)).toEqual([])
  })

  it('drops requests after their time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const master = await ninja(masterMinLevel)
      const pupil = await ninja(20)
      await master.post('request', { name: pupil.name })
      vi.setSystemTime(Date.now() + APPRENTICE_CONFIG.requestTtlMs + 1)
      expect((await pupil.state()).incoming).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ending an apprenticeship', () => {
  it('lets either side end it without a reward', async () => {
    const master = await ninja(masterMinLevel)
    const pupil = await ninja(20)
    await bind(master, pupil)
    const left = await pupil.post('dismiss', { characterId: master.id })
    expect(left.json().master).toBeNull()
    expect((await master.state()).apprentices).toEqual([])
    expect(notices).toContainEqual([
      master.id,
      { kind: 'apprentice', message: `${pupil.name} ended your apprenticeship.` },
    ])
    expect(code(await master.post('dismiss', { characterId: pupil.id }))).toBe('no_bond')
  })

  it('graduates at the graduation level and rewards both sides once', async () => {
    const master = await ninja(masterMinLevel)
    const pupil = await ninja(20)
    await bind(master, pupil)
    expect(code(await master.post('graduate', { characterId: pupil.id }))).toBe('too_low')

    await pupil.setLevel(graduateLevel)
    expect((await master.state()).apprentices[0].canGraduate).toBe(true)
    expect((await pupil.state()).master.canGraduate).toBe(true)
    const done = (await pupil.post('graduate', { characterId: master.id })).json()
    expect(done.master).toBeNull()
    expect(done.character.stone).toBe(rewards.apprentice.stone)
    expect((await master.row()).stone).toBe(rewards.master.stone)
    expect((await pupil.row()).stone).toBe(rewards.apprentice.stone)
    expect(notices).toContainEqual([
      master.id,
      {
        kind: 'apprentice',
        rewarded: true,
        message: `${pupil.name} graduated! You receive ${rewards.master.stone.toLocaleString('en-US')} Stone.`,
      },
    ])
    expect(code(await master.post('graduate', { characterId: pupil.id }))).toBe('no_bond')
    // A graduate is past the apprentice levels: no second reward.
    expect(code(await master.post('request', { name: pupil.name }))).toBe('apprentice_level')
  })

  it('refuses strangers', async () => {
    const master = await ninja(masterMinLevel)
    const stranger = await ninja(graduateLevel)
    expect(code(await master.post('graduate', { characterId: stranger.id }))).toBe('no_bond')
  })
})
