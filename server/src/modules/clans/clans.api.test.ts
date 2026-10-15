import { CLAN_CREATE_COST } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, clanApplications, clanMembers, clans, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { presence } from '../realtime/events.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => app.close())
afterAll(() => close())

type Response = Awaited<ReturnType<Client['get']>>
const code = (response: Response) => response.json().error?.code as string | undefined

async function ninja(n: number, { level = 30, giftCoupon = 0, stone = 0, gold = 0 } = {}) {
  const client = new Client(app)
  // A session straight in the database: registering hashes a password, which is slow.
  const [user] = await db
    .insert(users)
    .values({ username: `Player_${n}`, email: `player${n}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const name = `Ninja_${String(n).padStart(2, '0')}`
  const created = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ level, giftCoupon, stone, gold }).where(eq(characters.id, id))
  const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
  const get = (path = '') => client.get(`/api/game/clans${path}`)
  const post = (path: string, body: object = {}) => client.post(`/api/game/clans/${path}`, body)
  return { client, id, name, row, get, post }
}
type Ninja = Awaited<ReturnType<typeof ninja>>

async function found(leader: Ninja, name = 'Konoha') {
  const created = await leader.post('create', { name })
  if (created.statusCode !== 200) throw new Error(created.body)
  return created.json().clan.id as string
}

/** `who` applies to the clan and `officer` accepts. */
async function admit(officer: Ninja, who: Ninja, clanId: string) {
  expect((await who.post('apply', { clanId })).statusCode).toBe(200)
  const accepted = await officer.post('applications/accept', { characterId: who.id })
  if (accepted.statusCode !== 200) throw new Error(accepted.body)
  return accepted
}

const roleOf = async (characterId: string) =>
  (await db.select().from(clanMembers).where(eq(clanMembers.characterId, characterId)))[0]?.role

describe('creating a clan', () => {
  it('needs level 30 and a valid name', async () => {
    const low = await ninja(1, { level: 29 })
    expect((await low.get('/create-info')).json()).toEqual({
      free: true,
      cost: CLAN_CREATE_COST,
      minLevel: 30,
      levelOk: false,
    })
    expect(code(await low.post('create', { name: 'Konoha' }))).toBe('level_too_low')

    const leader = await ninja(2)
    const bad = await leader.post('create', { name: 'ab!' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.fields.name).toBe('Minimum 4 characters.')
    expect((await leader.post('create', { name: 'Ko-noha' })).json().error.fields.name).toBe(
      'Invalid characters (A-Z 0-9).',
    )
  })

  it('makes the founder its leader, for free the first time', async () => {
    const leader = await ninja(1, { giftCoupon: 10 })
    const created = await leader.post('create', { name: ' Kono ha ' })
    expect(created.statusCode).toBe(200)
    expect(created.json().clan).toMatchObject({
      name: 'Konoha',
      level: 1,
      notice: '',
      myRole: 'leader',
      members: [{ characterId: leader.id, role: 'leader', online: false }],
    })
    expect(created.json().character.giftCoupon).toBe(10)
    expect((await leader.get('/me')).json().clan.name).toBe('Konoha')
    expect(code(await leader.post('create', { name: 'Other' }))).toBe('in_clan')
  })

  it('refuses a name taken in any case', async () => {
    const one = await ninja(1)
    const two = await ninja(2)
    await found(one, 'Konoha')
    const taken = await two.post('create', { name: 'KONOHA' })
    expect(taken.statusCode).toBe(409)
    expect(code(taken)).toBe('name_taken')
  })

  it('charges Gift Certificates for a later clan, and frees a disbanded name', async () => {
    const leader = await ninja(1, { giftCoupon: CLAN_CREATE_COST - 1 })
    await found(leader, 'Konoha')
    expect((await leader.post('leave')).json().clan).toBeNull()
    expect((await leader.get('/create-info')).json()).toMatchObject({ free: false })
    expect(code(await leader.post('create', { name: 'Konoha' }))).toBe('not_enough')

    await db
      .update(characters)
      .set({ giftCoupon: CLAN_CREATE_COST + 5 })
      .where(eq(characters.id, leader.id))
    const again = await leader.post('create', { name: 'Konoha' })
    expect(again.statusCode).toBe(200)
    expect(again.json().character.giftCoupon).toBe(5)
  })
})

describe('Clan Browser and applications', () => {
  it('lists clans with their leader, member count and my applications, with search', async () => {
    const [one, two, three] = [await ninja(1), await ninja(2), await ninja(3)]
    const konoha = await found(one, 'Konoha')
    await found(two, 'Suna')
    await three.post('apply', { clanId: konoha })

    const list = (await three.get('')).json()
    expect(list).toMatchObject({ total: 2, page: 1, pages: 1 })
    expect(list.clans).toEqual(
      expect.arrayContaining([
        { id: konoha, name: 'Konoha', level: 1, members: 1, leader: one.name, applied: true },
        expect.objectContaining({ name: 'Suna', applied: false }),
      ]),
    )
    const found2 = (await three.get('?q=sun')).json()
    expect(found2.clans.map((c: { name: string }) => c.name)).toEqual(['Suna'])
    expect((await three.get('?page=0')).statusCode).toBe(400)
  })

  it('refuses applications from clan members, low levels and to full clans', async () => {
    const [one, two] = [await ninja(1), await ninja(2)]
    const low = await ninja(3, { level: 20 })
    const konoha = await found(one, 'Konoha')
    const suna = await found(two, 'Suna')
    expect(code(await one.post('apply', { clanId: suna }))).toBe('in_clan')
    expect(code(await low.post('apply', { clanId: konoha }))).toBe('level_too_low')
    expect(code(await low.post('apply', { clanId: crypto.randomUUID() }))).toBe('level_too_low')
    const four = await ninja(4)
    expect(code(await four.post('apply', { clanId: crypto.randomUUID() }))).toBe('unknown_clan')
    // Applying twice keeps one application.
    await four.post('apply', { clanId: konoha })
    expect((await four.post('apply', { clanId: konoha })).statusCode).toBe(200)
    expect(await db.select().from(clanApplications)).toHaveLength(1)
  })

  it('lets officers accept an applicant, which drops their other applications', async () => {
    const [one, two, three] = [await ninja(1), await ninja(2), await ninja(3)]
    const konoha = await found(one, 'Konoha')
    const suna = await found(two, 'Suna')
    await three.post('apply', { clanId: konoha })
    await three.post('apply', { clanId: suna })

    const notices: [string, unknown][] = []
    const off = presence.onNotice((id, notice) => notices.push([id, notice]))
    const pending = (await one.get('/applications')).json()
    expect(pending.applications).toEqual([{ characterId: three.id, name: three.name, level: 30 }])
    const accepted = await one.post('applications/accept', { characterId: three.id })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().clan.members.map((m: { role: string }) => m.role)).toEqual([
      'leader',
      'member',
    ])
    expect(await db.select().from(clanApplications)).toEqual([])
    expect((await three.get('/me')).json().clan.id).toBe(konoha)
    off()
    expect(notices).toContainEqual([
      three.id,
      { kind: 'clanChanged', clanId: konoha, message: 'You joined the clan Konoha.' },
    ])
    // Suna's leader finds nothing left to accept.
    expect(code(await two.post('applications/accept', { characterId: three.id }))).toBe(
      'no_application',
    )
  })

  it('keeps applications to officers and declines them', async () => {
    const [one, two, three] = [await ninja(1), await ninja(2), await ninja(3)]
    const konoha = await found(one, 'Konoha')
    await admit(one, two, konoha)
    await three.post('apply', { clanId: konoha })
    // A plain member sees no applications and cannot answer them.
    expect(code(await two.get('/applications'))).toBe('forbidden')
    expect(code(await two.post('applications/accept', { characterId: three.id }))).toBe('forbidden')
    expect(code(await three.get('/applications'))).toBe('no_clan')
    expect((await one.post('applications/reject', { characterId: three.id })).statusCode).toBe(200)
    expect(await db.select().from(clanApplications)).toEqual([])
  })

  it('refuses to accept into a full clan', async () => {
    const [one, two, last] = [await ninja(1), await ninja(2), await ninja(3)]
    const konoha = await found(one, 'Konoha')
    await two.post('apply', { clanId: konoha })
    // 13 more members straight in the database (creating ninjas through the API is rate limited).
    for (let n = 4; n <= 16; n++) {
      const [user] = await db
        .insert(users)
        .values({ username: `Filler_${n}`, email: `filler${n}@example.com`, passwordHash: 'x' })
        .returning()
      const [row] = await db
        .insert(characters)
        .values({
          userId: user!.id,
          name: `Filler_${n}`,
          gender: 0,
          nation: 0,
          clothing: 3,
          avatarId: 3,
          sceneId: 111,
          hp: 1,
          mp: 1,
        })
        .returning()
      await db.insert(clanMembers).values({ characterId: row!.id, clanId: konoha })
    }
    expect((await last.get('')).json().clans[0]).toMatchObject({ members: 14 })
    expect((await one.post('applications/accept', { characterId: two.id })).statusCode).toBe(200)
    expect(code(await last.post('apply', { clanId: konoha }))).toBe('clan_full')
    await db.delete(clanMembers).where(eq(clanMembers.characterId, two.id))
    await two.post('apply', { clanId: konoha })
    await db.insert(clanMembers).values({ characterId: last.id, clanId: konoha })
    expect(code(await one.post('applications/accept', { characterId: two.id }))).toBe('clan_full')
  })

  it('admits an applicant to one clan only when two accept at once', async () => {
    const [one, two, three] = [await ninja(1), await ninja(2), await ninja(3)]
    const konoha = await found(one, 'Konoha')
    const suna = await found(two, 'Suna')
    await three.post('apply', { clanId: konoha })
    await three.post('apply', { clanId: suna })
    const results = await Promise.all([
      one.post('applications/accept', { characterId: three.id }),
      two.post('applications/accept', { characterId: three.id }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404])
    expect(
      await db.select().from(clanMembers).where(eq(clanMembers.characterId, three.id)),
    ).toHaveLength(1)
  })
})

describe('roles, kicks and leaving', () => {
  async function clanOf(size: number) {
    const all = await Promise.all(Array.from({ length: size }, (_, i) => ninja(i + 1)))
    const clanId = await found(all[0]!, 'Konoha')
    for (const n of all.slice(1)) await admit(all[0]!, n, clanId)
    return { all, clanId }
  }

  it('follows the Manage rules for vice, officer, remove and kick', async () => {
    const { all } = await clanOf(6)
    const [leader, a, b, c, d, e] = all as [Ninja, Ninja, Ninja, Ninja, Ninja, Ninja]
    const role = (actor: Ninja, target: Ninja, r: string) =>
      actor.post('role', { characterId: target.id, role: r })

    expect((await role(leader, a, 'vice')).statusCode).toBe(200)
    // A second vice replaces the first, who becomes a member.
    expect((await role(leader, b, 'vice')).statusCode).toBe(200)
    expect(await roleOf(a.id)).toBe('member')
    expect(await roleOf(b.id)).toBe('vice')
    // Vice: leader only. Officer: leader or vice, members only, at most 3.
    expect(code(await role(b, a, 'vice'))).toBe('forbidden')
    for (const n of [a, c, d]) expect((await role(b, n, 'officer')).statusCode).toBe(200)
    expect(code(await role(leader, e, 'officer'))).toBe('forbidden')
    // Remove: vice on an officer; members cannot manage; nobody touches the leader or themselves.
    expect((await role(b, a, 'member')).statusCode).toBe(200)
    expect(code(await role(e, a, 'officer'))).toBe('forbidden')
    expect(code(await role(b, leader, 'member'))).toBe('forbidden')
    expect(code(await role(leader, leader, 'vice'))).toBe('forbidden')
    // Kick: vice on members and officers, never on the vice or leader.
    expect(code(await b.post('kick', { characterId: leader.id }))).toBe('forbidden')
    expect(code(await c.post('kick', { characterId: e.id }))).toBe('forbidden')
    const kicked = await b.post('kick', { characterId: e.id })
    expect(kicked.statusCode).toBe(200)
    expect((await e.get('/me')).json().clan).toBeNull()
    expect((await leader.post('kick', { characterId: b.id })).statusCode).toBe(200)
    expect(code(await leader.post('kick', { characterId: crypto.randomUUID() }))).toBe(
      'unknown_member',
    )
  })

  it('passes the lead to the vice when the leader leaves, and disbands when alone', async () => {
    const { all, clanId } = await clanOf(3)
    const [leader, a, b] = all as [Ninja, Ninja, Ninja]
    await leader.post('role', { characterId: b.id, role: 'vice' })
    expect((await leader.post('leave')).json().clan).toBeNull()
    expect(await roleOf(b.id)).toBe('leader')
    // With no vice the longest-standing member leads.
    await b.post('leave')
    expect(await roleOf(a.id)).toBe('leader')
    await a.post('leave')
    const [row] = await db.select().from(clans).where(eq(clans.id, clanId))
    expect(row!.disbandedAt).not.toBeNull()
    expect((await a.get('')).json().total).toBe(0)
    expect(code(await a.post('leave'))).toBe('no_clan')
  })

  it('lets only the leader write the notice, up to 120 characters', async () => {
    const { all } = await clanOf(2)
    const [leader, member] = all as [Ninja, Ninja]
    expect(code(await member.post('notice', { notice: 'hi' }))).toBe('forbidden')
    expect((await leader.post('notice', { notice: 'x'.repeat(121) })).statusCode).toBe(400)
    const saved = await leader.post('notice', { notice: '  Clan war at 8  ' })
    expect(saved.json().clan.notice).toBe('Clan war at 8')
  })
})

describe('treasury', () => {
  it('moves donations from the member to the clan and counts contribution points', async () => {
    const leader = await ninja(1, { stone: 200_000, giftCoupon: 50, gold: 2 })
    const clanId = await found(leader)
    const donated = await leader.post('donate', { currency: 'stone', amount: 150_000 })
    expect(donated.statusCode).toBe(200)
    expect(donated.json().character.stone).toBe(50_000)
    expect(donated.json().clan).toMatchObject({ stone: 150_000, gold: 0, giftCoupon: 0 })
    await leader.post('donate', { currency: 'giftCoupon', amount: 20 })
    const last = await leader.post('donate', { currency: 'gold', amount: 1 })
    expect(last.json().clan.members[0]).toMatchObject({ weeklyPoints: 10 + 30 + 75 })
    expect(last.json().clan.members[0]).toMatchObject({ totalPoints: 115 })

    expect(code(await leader.post('donate', { currency: 'gold', amount: 2 }))).toBe('not_enough')
    expect((await leader.post('donate', { currency: 'gold', amount: -1 })).statusCode).toBe(400)
    expect((await leader.post('donate', { currency: 'gold', amount: 1.5 })).statusCode).toBe(400)
    const [clan] = await db.select().from(clans).where(eq(clans.id, clanId))
    expect(clan).toMatchObject({ stone: 150_000, giftCoupon: 20, gold: 1 })
  })

  it('never overdraws a member who donates in parallel', async () => {
    const leader = await ninja(1, { giftCoupon: 100 })
    await found(leader)
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        leader.post('donate', { currency: 'giftCoupon', amount: 30 }),
      ),
    )
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(3)
    expect((await leader.row()).giftCoupon).toBe(10)
    expect((await leader.get('/me')).json().clan.giftCoupon).toBe(90)
  })

  it('refuses donations without a clan', async () => {
    const loner = await ninja(1, { stone: 100 })
    expect(code(await loner.post('donate', { currency: 'stone', amount: 10 }))).toBe('no_clan')
  })

  it('lets only the leader withdraw, to self, to a member or split among all', async () => {
    const leader = await ninja(1, { stone: 1000 })
    const [a, b] = [await ninja(2), await ninja(3)]
    const outsider = await ninja(4)
    const clanId = await found(leader)
    await admit(leader, a, clanId)
    await admit(leader, b, clanId)
    await leader.post('donate', { currency: 'stone', amount: 1000 })

    expect(code(await a.post('withdraw', { mode: 'self', currency: 'stone', amount: 1 }))).toBe(
      'forbidden',
    )
    const self = await leader.post('withdraw', { mode: 'self', currency: 'stone', amount: 100 })
    expect(self.json()).toMatchObject({ clan: { stone: 900 }, character: { stone: 100 } })
    const toMember = await leader.post('withdraw', {
      mode: 'member',
      currency: 'stone',
      amount: 200,
      characterId: a.id,
    })
    expect(toMember.json().clan.stone).toBe(700)
    expect((await a.row()).stone).toBe(200)
    expect(
      code(
        await leader.post('withdraw', {
          mode: 'member',
          currency: 'stone',
          amount: 1,
          characterId: outsider.id,
        }),
      ),
    ).toBe('unknown_member')
    // 700 split among 3: 233 each, 1 stays in the treasury.
    const split = await leader.post('withdraw', { mode: 'all', currency: 'stone', amount: 700 })
    expect(split.json().clan.stone).toBe(1)
    expect([(await leader.row()).stone, (await a.row()).stone, (await b.row()).stone]).toEqual([
      333, 433, 233,
    ])
    expect(
      code(await leader.post('withdraw', { mode: 'self', currency: 'stone', amount: 2 })),
    ).toBe('not_enough')
  })
})

describe('auth', () => {
  it('needs a session for every route', async () => {
    const anonymous = new Client(app)
    expect((await anonymous.get('/api/game/clans/me')).statusCode).toBe(401)
    expect((await anonymous.post('/api/game/clans/leave', {})).statusCode).toBe(401)
  })
})
