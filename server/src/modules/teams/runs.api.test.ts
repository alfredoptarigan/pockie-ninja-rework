// Team runs (teams.md 4): toll gates led by the captain and pub fights with the captain's line-up.
// The fight result is fixed: real toll gate bosses can beat any test ninja.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  inventoryItems,
  pubFightLineups,
  teamMembers,
  teams,
  tollGateRuns,
  tollGateWeekly,
} from '../../db/schema.js'
import { errorCode, join, setUpTeams, type TestNinja } from './test-setup.js'

const outcome = vi.hoisted(() => ({ won: true, hp: 500 }))
vi.mock('@pockie/game-core', async (original) => ({
  ...(await original<typeof import('@pockie/game-core')>()),
  simulateFight: ({ attackers }: { attackers: unknown[] }) => ({
    seed: 0,
    fighters: attackers.map((_, index) => ({ index, side: 'attackers', hp: outcome.hp, mp: 0 })),
    events: [],
    winner: outcome.won ? 'attackers' : 'defenders',
  }),
}))

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof setUpTeams>

beforeEach(async () => {
  await truncateAll(db)
  outcome.won = true
  outcome.hp = 500
  setup = setUpTeams(db)
})
afterEach(() => setup.app.close())
afterAll(() => close())

const DEMON_CITY = 171
const GATE = 100001
const WEAPON = 'i270100'

/** A ninja at the Demon City Guard with a weapon and full HP. */
async function ready(n: number, { sceneId = DEMON_CITY, level = 20 } = {}) {
  const ninja = await setup.ninja(n, { sceneId, level })
  await db
    .insert(inventoryItems)
    .values({ characterId: ninja.id, itemId: WEAPON, equippedSlot: 'Weapon' })
  await fillUp(ninja)
  return ninja
}
async function fillUp(ninja: TestNinja) {
  const { character } = (await ninja.client.get('/api/game/character')).json()
  await ninja.set({ hp: character.maxHp, mp: character.maxMp })
}
/** A team of `count` ready ninjas, the first one captain. */
async function team(count: number, options?: { sceneId?: number; level?: number }) {
  const ninjas: TestNinja[] = []
  for (let n = 1; n <= count; n++) ninjas.push(await ready(n, options))
  for (const guest of ninjas.slice(1)) expect((await join(ninjas[0]!, guest)).statusCode).toBe(200)
  return ninjas as [TestNinja, TestNinja, TestNinja]
}

const enter = (ninja: TestNinja, gateId = GATE) =>
  ninja.client.post('/api/game/gates/enter', { gateId })
const fight = (ninja: TestNinja) => ninja.client.post('/api/game/gates/run/fight')
const runOf = async (ninja: TestNinja) =>
  (await db.select().from(tollGateRuns).where(eq(tollGateRuns.characterId, ninja.id)))[0]
const teamCount = async () => (await db.select().from(teams)).length
const offline = (ninja: TestNinja, secondsAgo: number) =>
  db
    .update(teamMembers)
    .set({ offlineSince: new Date(Date.now() - secondsAgo * 1000) })
    .where(eq(teamMembers.characterId, ninja.id))

describe('team toll gate entry', () => {
  it('the captain enters for everyone: a try each and one run row per member', async () => {
    const [a, b, c] = await team(3)
    const response = await enter(a)
    expect(response.statusCode).toBe(200)
    expect(response.json().run).toMatchObject({ gateId: GATE, subGate: 0, point: 0 })
    const teamId = (await db.select().from(teams))[0]!.id
    for (const ninja of [a, b, c]) {
      expect(await runOf(ninja)).toMatchObject({ gateId: GATE, teamId })
      expect((await ninja.row()).tollGateEntries).toBe(1)
    }
  })

  it('only the captain may enter or fight', async () => {
    const [a, b] = await team(2)
    expect(errorCode(await enter(b))).toBe('not_captain')
    expect((await enter(a)).statusCode).toBe(200)
    expect(errorCode(await fight(b))).toBe('not_captain')
  })

  it('refuses a member outside the level range, and the max level counts too', async () => {
    const [a, b] = await team(2)
    await b.set({ level: 26 })
    const response = await enter(a)
    expect(errorCode(response)).toBe('too_high')
    expect(response.json().error.message).toBe(`${b.name}'s level is too high for this toll gate.`)
    await b.set({ level: 15 })
    expect(errorCode(await enter(a))).toBe('too_low')
    expect(await runOf(a)).toBeUndefined()
    expect((await a.row()).tollGateEntries).toBe(0)
  })

  it('refuses a member who is not in Demon City', async () => {
    const [a, b] = await team(2)
    await b.set({ sceneId: 2601 })
    expect(errorCode(await enter(a))).toBe('not_same_scene')
  })

  it('refuses the solo-only gate, an offline member and a member with low HP', async () => {
    const [a, b] = await team(2)
    expect(errorCode(await enter(a, 100000))).toBe('solo_only')
    await offline(b, 5)
    expect(errorCode(await enter(a))).toBe('member_offline')
    await db.update(teamMembers).set({ offlineSince: null })
    await b.set({ hp: 1 })
    expect(errorCode(await enter(a))).toBe('low_hp')
  })

  it('two concurrent starts give one run per member and spend one try each', async () => {
    const [a, b, c] = await team(3)
    const responses = await Promise.all([enter(a), enter(a), enter(a)])
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
    for (const response of responses.filter((r) => r.statusCode !== 200))
      expect(errorCode(response)).toBe('run_active')
    for (const ninja of [a, b, c]) expect((await ninja.row()).tollGateEntries).toBe(1)
  })

  it('a member entering alone at the same time as the captain never gets two runs', async () => {
    const [a, b] = await team(2)
    const [captain, member] = await Promise.all([enter(a), enter(b)])
    expect(captain.statusCode).toBe(200)
    expect(errorCode(member)).toBe('not_captain')
    expect((await b.row()).tollGateEntries).toBe(1)
  })
})

describe('a team toll gate clear (100001)', () => {
  it('pays every member in full, the captain of 3 gets +100% EXP and +50% Stone', async () => {
    const [a, b, c] = await team(3)
    const before = await Promise.all([a, b, c].map((n) => n.row()))
    await enter(a)
    let body
    for (let point = 0; point < 10; point++) body = (await fight(a)).json()
    expect(body.run).toMatchObject({ cleared: true, passedPoint: 9 })
    // SubTollGate 200011 + 200012 and TollGate 100001: 5600 Stone and 1000 EXP.
    const after = await Promise.all([a, b, c].map((n) => n.row()))
    expect(after[0]!.stone - before[0]!.stone).toBe(5600 + 2800)
    expect(after[1]!.stone - before[1]!.stone).toBe(5600)
    expect(after[2]!.stone - before[2]!.stone).toBe(5600)
    const last = body.team as { characterId: string; bonus?: { exp: number; stone: number } }[]
    expect(last.map((m) => m.characterId)).toEqual([a.id, b.id, c.id])
    // The last fight pays SubTollGate 200012 and TollGate 100001: 800 EXP, 4500 Stone.
    expect(last[0]!.bonus).toEqual({ exp: 800, stone: 2250 })
    expect(last[1]!.bonus).toBeUndefined()
    // Every member gets their own card flip; the team ends with the run.
    for (const ninja of [a, b, c]) expect((await runOf(ninja))?.cardState).toBe(1)
    expect(await teamCount()).toBe(0)
    // Weekly toll gate rank entries for every member.
    const weekly = await db.select().from(tollGateWeekly).where(eq(tollGateWeekly.gateId, GATE))
    expect(weekly.map((w) => w.characterId).sort()).toEqual([a.id, b.id, c.id].sort())
    expect(weekly.every((w) => w.schedule === 100)).toBe(true)
    // The cards are each member's own.
    const view = (await b.client.get('/api/game/gates')).json()
    expect(view.run).toMatchObject({ cleared: true, cards: { state: 1 } })
  })

  it('a captain of 2 gets no bonus', async () => {
    const [a, b] = await team(2)
    const before = (await a.row()).stone
    await enter(a)
    for (let point = 0; point < 10; point++) await fight(a)
    expect((await a.row()).stone - before).toBe(5600)
    expect((await b.row()).stone - before).toBe(5600)
  })

  it('a loss leaves every member at 1 HP, ends the runs and the team', async () => {
    const [a, b, c] = await team(3)
    await enter(a)
    outcome.won = false
    const body = (await fight(a)).json()
    expect(body).toMatchObject({ won: false, run: null })
    for (const ninja of [a, b, c]) {
      expect((await ninja.row()).hp).toBe(1)
      expect(await runOf(ninja)).toBeUndefined()
    }
    expect(await teamCount()).toBe(0)
  })

  it('a member who exits mid-run leaves the team; the others go on', async () => {
    const [a, b, c] = await team(3)
    await enter(a)
    await fight(a)
    expect((await c.client.post('/api/game/gates/run/exit')).statusCode).toBe(200)
    expect(await runOf(c)).toBeUndefined()
    expect(await db.select().from(teamMembers)).toHaveLength(2)
    const body = (await fight(a)).json()
    expect(body.team.map((m: { characterId: string }) => m.characterId)).toEqual([a.id, b.id])
  })
})

describe('a disconnect during a team run', () => {
  it('inside the grace the member still fights, is paid and counts for the bonus', async () => {
    const [a, , c] = await team(3)
    await enter(a)
    for (let point = 0; point < 4; point++) await fight(a)
    await offline(c, 30)
    const before = await c.row()
    const body = (await fight(a)).json()
    // Point 5 ends sub gate 200011: 1100 Stone, 200 EXP; the captain's bonus is 50% / 100%.
    expect(body.team).toHaveLength(3)
    expect(body.team[0].bonus).toEqual({ exp: 200, stone: 550 })
    expect((await c.row()).stone - before.stone).toBe(1100)
    expect((await runOf(c))?.subGate).toBe(1)
  })

  it('after the grace the member is gone: their run ends and the bonus drops', async () => {
    const [a, b, c] = await team(3)
    await enter(a)
    for (let point = 0; point < 4; point++) await fight(a)
    await offline(c, 61)
    const body = (await fight(a)).json()
    expect(body.team.map((m: { characterId: string }) => m.characterId)).toEqual([a.id, b.id])
    expect(body.team[0].bonus).toBeUndefined()
    expect(await runOf(c)).toBeUndefined()
  })

  it('after the grace a team of 2 disbands and the run ends for everyone', async () => {
    const [a, b] = await team(2)
    await enter(a)
    await offline(b, 61)
    expect(errorCode(await fight(a))).toBe('no_run')
    expect(await runOf(a)).toBeUndefined()
    expect(await teamCount()).toBe(0)
  })
})

describe('team pub fights', () => {
  const pubFight = (ninja: TestNinja) => ninja.client.post('/api/game/gates/pub/fight')
  const lineupOf = async (ninja: TestNinja) =>
    (
      await db
        .select()
        .from(pubFightLineups)
        .where(and(eq(pubFightLineups.characterId, ninja.id), eq(pubFightLineups.sceneId, 2601)))
    )[0]?.npcIds

  it("the team fights the captain's line-up; only the captain pulls a new one", async () => {
    const [a, b, c] = await team(3, { sceneId: 2601, level: 16 })
    const captainLineup = (await a.client.get('/api/game/gates/pub')).json().lineup
    const memberLineup = (await b.client.get('/api/game/gates/pub')).json().lineup
    const response = await pubFight(a)
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.npcIds).toEqual(captainLineup)
    expect(body.team.map((m: { characterId: string }) => m.characterId)).toEqual([a.id, b.id, c.id])
    for (const ninja of [a, b, c]) expect((await ninja.row()).pubFightsToday).toBe(1)
    expect(await lineupOf(b)).toEqual(memberLineup)
    expect(body.pub.lineup).toEqual(await lineupOf(a))
  })

  it('only the captain starts it, and every member needs full HP', async () => {
    const [a, b] = await team(2, { sceneId: 2601, level: 16 })
    expect(errorCode(await pubFight(b))).toBe('not_captain')
    await b.set({ hp: 1 })
    const response = await pubFight(a)
    expect(errorCode(response)).toBe('not_full_hp')
    expect(response.json().error.message).toBe(`${b.name} needs full HP for a pub fight.`)
    await fillUp(b)
    await offline(b, 5)
    expect(errorCode(await pubFight(a))).toBe('member_offline')
  })

  it('a loss leaves every member at 1 HP and keeps the team', async () => {
    const [a, b] = await team(2, { sceneId: 2601, level: 16 })
    outcome.won = false
    expect((await pubFight(a)).json().won).toBe(false)
    for (const ninja of [a, b]) expect((await ninja.row()).hp).toBe(1)
    expect(await teamCount()).toBe(1)
  })
})

describe('what a team member cannot do', () => {
  it('refuses travel, going home, field fights, exploring and Las Noches', async () => {
    const [a, b] = await team(2, { sceneId: 2601, level: 16 })
    const travel = await a.client.post('/api/game/travel', { sceneId: 2602, via: 'link' })
    expect(errorCode(travel)).toBe('in_team')
    expect(travel.json().error.message).toBe('Leave your team before you travel.')
    expect(errorCode(await b.client.post('/api/game/travel', { via: 'home' }))).toBe('in_team')
    expect(errorCode(await a.client.post('/api/game/fight', { monsterId: 'n1' }))).toBe('in_team')
    expect(errorCode(await a.client.post('/api/game/explore/26011'))).toBe('in_team')
    await db.update(teams).set({ sceneId: DEMON_CITY })
    await a.set({ sceneId: DEMON_CITY, level: 20 })
    const lasNoches = await a.client.post('/api/game/gates/las-noches/start', { mode: 'first' })
    expect(errorCode(lasNoches)).toBe('in_team')
  })
})
