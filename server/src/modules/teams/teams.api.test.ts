import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { blocks, teamMembers, teamPrompts, teams } from '../../db/schema.js'
import { requireNoTeam } from './context.js'
import { errorCode, FIELD, join, setUpTeams, type TestNinja } from './test-setup.js'

// Many ninjas per test on a shared database server.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof setUpTeams>

beforeEach(async () => {
  await truncateAll(db)
  setup = setUpTeams(db)
})
afterEach(() => setup.app.close())
afterAll(() => close())

type Five = [TestNinja, TestNinja, TestNinja, TestNinja, TestNinja]
const ninjas = async (count: number) =>
  (await Promise.all(Array.from({ length: count }, (_, i) => setup.ninja(i + 1)))) as Five
const members = async (teamId: string) =>
  (await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId))).sort(
    (a, b) => a.fightOrder - b.fightOrder,
  )

describe('invite and accept', () => {
  it('creates the team on accept with the inviter as captain', async () => {
    const [a, b] = await ninjas(2)
    const invited = await a.post('invite', { characterId: b.id })
    expect(invited.statusCode).toBe(200)
    const prompts = (await b.team()).json().prompts
    expect(prompts).toEqual([
      expect.objectContaining({
        kind: 'invite',
        from: { characterId: a.id, name: a.name, level: 20 },
      }),
    ])
    const accepted = await b.post(`prompts/${prompts[0].id}/accept`)
    expect(accepted.statusCode).toBe(200)
    const team = accepted.json().team
    expect(team).toMatchObject({ sceneId: FIELD, captainId: a.id })
    expect(
      team.members.map((m: { characterId: string; fightOrder: number; captain: boolean }) => [
        m.characterId,
        m.fightOrder,
        m.captain,
      ]),
    ).toEqual([
      [a.id, 0, true],
      [b.id, 1, false],
    ])
    expect(team.members[0]).toMatchObject({ online: true, level: 20 })
    expect((await a.team()).json().team.id).toBe(team.id)
    expect(await db.select().from(teamPrompts)).toEqual([])
  })

  it('refuses invites that break the rules', async () => {
    const [a, b, c, d] = await ninjas(4)
    expect(errorCode(await a.post('invite', { characterId: a.id }))).toBe('cant_target_self')
    await c.set({ sceneId: 2602 })
    expect(errorCode(await a.post('invite', { characterId: c.id }))).toBe('not_same_scene')
    await c.set({ sceneId: FIELD })
    await join(a, b)
    // Only the captain invites; the target must be solo.
    expect(errorCode(await b.post('invite', { characterId: c.id }))).toBe('not_captain')
    expect(errorCode(await c.post('invite', { characterId: b.id }))).toBe('target_in_team')
    // One pending prompt per pair.
    await a.post('invite', { characterId: c.id })
    expect(errorCode(await a.post('invite', { characterId: c.id }))).toBe('prompt_pending')
    // Blocked either way.
    await db.insert(blocks).values({ ownerId: d.id, blockedId: b.id })
    expect(errorCode(await a.post('invite', { characterId: d.id }))).toBe('blocked')
  })

  it('refuses teams outside the neutral fields and the toll gate lobby', async () => {
    const a = await setup.ninja(1, { sceneId: 111 })
    const b = await setup.ninja(2, { sceneId: 111 })
    expect(errorCode(await a.post('invite', { characterId: b.id }))).toBe('no_team_here')
    await a.set({ sceneId: 171 })
    await b.set({ sceneId: 171 })
    expect((await a.post('invite', { characterId: b.id })).statusCode).toBe(200)
  })

  it('refuses a full team', async () => {
    const [a, b, c, d] = await ninjas(4)
    await join(a, b)
    await join(a, c)
    expect(errorCode(await a.post('invite', { characterId: d.id }))).toBe('team_full')
    expect(errorCode(await d.post('apply', { characterId: b.id }))).toBe('team_full')
  })

  it('re-checks the scene on accept and refuses an expired prompt', async () => {
    const [a, b, c] = await ninjas(3)
    const first = (await a.post('invite', { characterId: b.id })).json().prompt
    await b.set({ sceneId: 2602 })
    expect(errorCode(await b.post(`prompts/${first.promptId}/accept`))).toBe('not_same_scene')
    const second = (await a.post('invite', { characterId: c.id })).json().prompt
    await db
      .update(teamPrompts)
      .set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(teamPrompts.id, second.promptId))
    expect(errorCode(await c.post(`prompts/${second.promptId}/accept`))).toBe('prompt_expired')
    // An expired prompt can be sent again.
    expect((await a.post('invite', { characterId: c.id })).statusCode).toBe(200)
  })

  it('does not add the target to another captain’s team (bug 3)', async () => {
    const [a, b, c] = await ninjas(3)
    const invite = (await a.post('invite', { characterId: c.id })).json().prompt
    await join(b, a) // a joins b's team as a member
    expect(errorCode(await c.post(`prompts/${invite.promptId}/accept`))).toBe('prompt_stale')
    const [team] = await db.select().from(teams)
    expect(await members(team!.id)).toHaveLength(2)
  })

  it('a solo inviter whose first invite was accepted takes the second one into the same team', async () => {
    const [a, b, c] = await ninjas(3)
    const toB = (await a.post('invite', { characterId: b.id })).json().prompt
    const toC = (await a.post('invite', { characterId: c.id })).json().prompt
    await b.post(`prompts/${toB.promptId}/accept`)
    const accepted = await c.post(`prompts/${toC.promptId}/accept`)
    expect(accepted.json().team.members).toHaveLength(3)
  })

  it('refuse deletes the prompt and tells the inviter', async () => {
    const [a, b] = await ninjas(2)
    const invite = (await a.post('invite', { characterId: b.id })).json().prompt
    expect((await b.post(`prompts/${invite.promptId}/refuse`)).statusCode).toBe(200)
    expect((await b.post(`prompts/${invite.promptId}/accept`)).statusCode).toBe(404)
    // Only the target answers.
    const again = (await a.post('invite', { characterId: b.id })).json().prompt
    expect((await a.post(`prompts/${again.promptId}/accept`)).statusCode).toBe(404)
  })

  it('never lets concurrent accepts grow a team past 3', async () => {
    const [a, b, c, d, e] = await ninjas(5)
    const prompts: string[] = []
    for (const guest of [b, c, d, e])
      prompts.push((await a.post('invite', { characterId: guest.id })).json().prompt.promptId)
    const results = await Promise.all(
      [b, c, d, e].map((guest, i) => guest.post(`prompts/${prompts[i]}/accept`)),
    )
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect(results.filter((r) => errorCode(r) === 'team_full')).toHaveLength(2)
    const [team] = await db.select().from(teams)
    expect((await members(team!.id)).map((m) => m.fightOrder)).toEqual([0, 1, 2])
  })
})

describe('apply', () => {
  it('lets a solo ninja in the same field apply; the captain accepts', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    const applied = await c.post('apply', { characterId: b.id })
    expect(applied.statusCode).toBe(200)
    const prompts = (await a.team()).json().prompts
    expect(prompts).toEqual([
      expect.objectContaining({
        kind: 'apply',
        from: expect.objectContaining({ characterId: c.id }),
      }),
    ])
    // Only the captain gets the application.
    expect((await b.team()).json().prompts).toEqual([])
    const accepted = await a.post(`prompts/${prompts[0].id}/accept`)
    expect(accepted.json().team.members.map((m: { characterId: string }) => m.characterId)).toEqual(
      [a.id, b.id, c.id],
    )
  })

  it('refuses an application from another field (bug 1) or to a solo ninja', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await c.set({ sceneId: 2602 })
    expect(errorCode(await c.post('apply', { characterId: a.id }))).toBe('not_same_scene')
    await c.set({ sceneId: FIELD })
    const d = await setup.ninja(4)
    expect(errorCode(await c.post('apply', { characterId: d.id }))).toBe('target_not_in_team')
    expect(errorCode(await a.post('apply', { characterId: b.id }))).toBe('already_in_team')
  })
})

describe('invite and apply by name', () => {
  it('finds the ninja by name, case-insensitively', async () => {
    const [a, b, c] = await ninjas(3)
    const invited = await a.post('invite', { name: b.name.toUpperCase() })
    expect(invited.statusCode).toBe(200)
    expect((await b.team()).json().prompts[0].from.characterId).toBe(a.id)
    await b.post(`prompts/${invited.json().prompt.promptId}/accept`)
    const applied = await c.post('apply', { name: ` ${b.name.toLowerCase()} ` })
    expect(applied.statusCode).toBe(200)
    expect((await a.team()).json().prompts[0]).toMatchObject({ kind: 'apply' })
  })

  it('answers an unknown name and refuses a body with both or neither', async () => {
    const [a] = await ninjas(1)
    const unknown = await a.post('invite', { name: 'Nobody_here' })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error.message).toBe('There is no ninja with that name.')
    expect(errorCode(await a.post('apply', { name: 'Nobody_here' }))).toBe('unknown_name')
    expect((await a.post('invite', {})).statusCode).toBe(400)
    expect((await a.post('invite', { name: a.name, characterId: a.id })).statusCode).toBe(400)
  })
})

describe('kick, leave, captain and fight order', () => {
  it('kicks a member from a team of three and compacts the fight order', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await join(a, c)
    expect(errorCode(await b.post('kick', { characterId: c.id }))).toBe('not_captain')
    expect(errorCode(await a.post('kick', { characterId: a.id }))).toBe('cant_target_self')
    const kicked = await a.post('kick', { characterId: b.id })
    expect(
      kicked
        .json()
        .team.members.map((m: { characterId: string; fightOrder: number }) => [
          m.characterId,
          m.fightOrder,
        ]),
    ).toEqual([
      [a.id, 0],
      [c.id, 1],
    ])
    expect((await b.team()).json().team).toBeNull()
  })

  it('disbands a team of two on a kick or a leave', async () => {
    const [a, b] = await ninjas(2)
    await join(a, b)
    expect((await a.post('kick', { characterId: b.id })).json().team).toBeNull()
    expect(await db.select().from(teams)).toEqual([])
    await join(a, b)
    expect((await b.post('leave')).json().team).toBeNull()
    expect((await a.team()).json().team).toBeNull()
    expect(errorCode(await a.post('leave'))).toBe('no_team')
  })

  it('hands the lead to the lowest fight order when the captain of three leaves', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await join(a, c)
    await a.post('order', { characterId: c.id, direction: 'up' })
    await a.post('leave')
    const team = (await b.team()).json().team
    expect(team.captainId).toBe(c.id)
    expect(
      team.members.map((m: { characterId: string; fightOrder: number }) => [
        m.characterId,
        m.fightOrder,
      ]),
    ).toEqual([
      [c.id, 0],
      [b.id, 1],
    ])
  })

  it('transfers the lead to an online member', async () => {
    const [a, b] = await ninjas(2)
    await join(a, b)
    expect(errorCode(await b.post('captain', { characterId: a.id }))).toBe('not_captain')
    await db
      .update(teamMembers)
      .set({ offlineSince: new Date() })
      .where(eq(teamMembers.characterId, b.id))
    expect(errorCode(await a.post('captain', { characterId: b.id }))).toBe('target_offline')
    await db
      .update(teamMembers)
      .set({ offlineSince: null })
      .where(eq(teamMembers.characterId, b.id))
    expect((await a.post('captain', { characterId: b.id })).json().team.captainId).toBe(b.id)
  })

  it('swaps fight order with the neighbour', async () => {
    const [a, b, c] = await ninjas(3)
    await join(a, b)
    await join(a, c)
    const moved = await a.post('order', { characterId: c.id, direction: 'up' })
    expect(moved.json().team.members.map((m: { characterId: string }) => m.characterId)).toEqual([
      a.id,
      c.id,
      b.id,
    ])
    expect(errorCode(await a.post('order', { characterId: b.id, direction: 'down' }))).toBe(
      'bad_order',
    )
    expect(errorCode(await b.post('order', { characterId: a.id, direction: 'down' }))).toBe(
      'not_captain',
    )
  })
})

describe('where a team member cannot go', () => {
  it('requireNoTeam refuses travel, home, explore and field fights in a team', async () => {
    const [a, b] = await ninjas(2)
    await expect(requireNoTeam(db, a.id, 'travel')).resolves.toBeUndefined()
    await join(a, b)
    await expect(requireNoTeam(db, b.id, 'travel')).rejects.toMatchObject({
      statusCode: 400,
      code: 'in_team',
      message: 'Leave your team before you travel.',
    })
  })
})
