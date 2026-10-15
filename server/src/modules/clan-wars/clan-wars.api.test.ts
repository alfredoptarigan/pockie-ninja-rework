// Clan Wars: saved fighters (set I automatically, any outfitted set on request), the leader's
// attack once per rival a day, paired duels, rewards, history, standings and the weekly Top 3.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClanMissionsView } from '../../../../shared/src/schemas/clan-activities.js'
import {
  CLAN_WAR_RULES,
  clanWarRate,
  type ClanWarAttackResult,
  type ClanWarFighterResult,
  type ClanWarStatus,
} from '../../../../shared/src/schemas/clan-wars.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterBankai,
  characters,
  clanMembers,
  clans,
  clanWarFighters,
  clanWars,
  inventoryItems,
  users,
} from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { settleClanWarWeek, standingsOf } from './wars.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => {
  vi.useRealTimers()
  return app.close()
})
afterAll(() => close())

type Response = Awaited<ReturnType<Client['get']>>
const code = (response: Response) => response.json().error?.code as string | undefined

let made = 0
/** A level-30 ninja; `clan` creates one (leader) or joins one (member). */
async function ninja(clan: { create: string } | { join: string }) {
  made += 1
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: `Player_${made}`, email: `p${made}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const name = `Ninja_${String(made).padStart(2, '0')}`
  const created = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ level: 30 }).where(eq(characters.id, id))
  let clanId: string
  if ('create' in clan)
    clanId = (await client.post('/api/game/clans/create', { name: clan.create })).json().clan.id
  else {
    clanId = clan.join
    await db.insert(clanMembers).values({ characterId: id, clanId })
  }
  const wars = <T>(path = '') =>
    client.get(`/api/game/clan-events/wars${path}`).then((r) => r.json<T>())
  const post = (path: string, body: object = {}) =>
    client.post(`/api/game/clan-events/wars/${path}`, body)
  return { client, id, name, clanId, wars, post }
}
type Ninja = Awaited<ReturnType<typeof ninja>>

/** A leader and `size - 1` members, everyone with set I saved. */
async function clanOf(name: string, size: number) {
  const leader = await ninja({ create: name })
  const members = [leader]
  for (let i = 1; i < size; i++) members.push(await ninja({ join: leader.clanId }))
  for (const member of members) await member.wars<ClanWarStatus>()
  return { leader, members }
}

describe('fighters', () => {
  it('registers set I when Clan Wars opens and saves another outfitted set', async () => {
    const leader = await ninja({ create: 'Konoha' })
    const status = await leader.wars<ClanWarStatus>()
    expect(status.fighter).toMatchObject({ name: leader.name, set: 1, level: 30 })
    expect(status.fighter!.power).toBeGreaterThan(0)
    expect(status.myClan.registeredFighters).toBe(1)
    expect(status.canStartWar).toBe(true)

    expect(code(await leader.post('fighter', { set: 2 }))).toBe('no_outfit')
    const [outfit] = await db
      .select()
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.characterId, leader.id), eq(inventoryItems.equippedSlot, 'Outfit')),
      )
    await db.insert(inventoryItems).values({
      characterId: leader.id,
      itemId: outfit!.itemId,
      equippedSlot: 'Outfit',
      equippedSet: 2,
    })
    const saved = await leader.post('fighter', { set: 2 })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json<ClanWarFighterResult>().status.fighter?.set).toBe(2)
    // The ninja still wears set I.
    const [row] = await db.select().from(characters).where(eq(characters.id, leader.id))
    expect(row!.activeSet).toBe(1)

    const removed = await leader.post('fighter/remove')
    expect(removed.json<ClanWarFighterResult>().status.fighter).toBeNull()
  })
})

describe('war', () => {
  let konoha: Awaited<ReturnType<typeof clanOf>>
  let suna: Awaited<ReturnType<typeof clanOf>>
  beforeEach(async () => {
    konoha = await clanOf('Konoha', 5)
    suna = await clanOf('Suna', 5)
  })

  it('shows the rival and its 5v5 matchup, larger sizes stay closed', async () => {
    const status = await konoha.leader.wars<ClanWarStatus>()
    const [target] = status.targets
    expect(target).toMatchObject({ clanName: 'Suna', registeredFighters: 5, attackedToday: false })
    expect(target!.matchups[5].available).toBe(true)
    expect(target!.matchups[10].available).toBe(false)
    expect(status.attacksRemaining).toBe(1)
    expect(
      code(await konoha.leader.post('attack', { targetClanId: suna.leader.clanId, size: 10 })),
    ).toBe('roster_too_small')
  })

  it('fights paired duels once a day and pays both clans per knockout', async () => {
    const member: Ninja = konoha.members[1]!
    expect(
      (await member.post('attack', { targetClanId: suna.leader.clanId, size: 5 })).statusCode,
    ).toBe(403)

    const response = await konoha.leader.post('attack', {
      targetClanId: suna.leader.clanId,
      size: 5,
    })
    expect(response.statusCode, response.body).toBe(200)
    const { war, status } = response.json<ClanWarAttackResult>()
    expect(war.duels).toHaveLength(5)
    const kos = (side: 'attacker' | 'defender') => war.duels.filter((d) => d.winner === side).length
    expect(war.myClan.knockouts).toBe(kos('attacker'))
    expect(war.enemyClan.knockouts).toBe(kos('defender'))
    const rate = war.myClan.rewardPercent
    expect(war.myClan.gcReward).toBe(
      kos('attacker') * Math.round((CLAN_WAR_RULES.gcPerKnockout * rate) / 100),
    )
    const [ours] = await db.select().from(clans).where(eq(clans.id, konoha.leader.clanId))
    expect(ours!.giftCoupon).toBe(war.myClan.gcReward + war.myClan.giftCertificateBonus)
    const coins = await db.select().from(characterBankai)
    expect(coins.reduce((sum, row) => sum + row.coins, 0)).toBe(
      (kos('attacker') + kos('defender')) * CLAN_WAR_RULES.bankaiCoinsPerWin,
    )
    expect(status.targets[0]!.attackedToday).toBe(true)
    expect(status.history[0]!.warId).toBe(war.warId)
    expect(
      code(await konoha.leader.post('attack', { targetClanId: suna.leader.clanId, size: 5 })),
    ).toBe('attacked_today')

    // Being attacked does not use the defender's own attack.
    const back = await suna.leader.post('attack', { targetClanId: konoha.leader.clanId, size: 5 })
    expect(back.statusCode, back.body).toBe(200)
    const weekly = (await konoha.leader.wars<ClanWarStatus>()).weekly.standings
    expect(weekly.map((row) => row.clanName).sort()).toEqual(['Konoha', 'Suna'])
  })

  it('pays the weekly Top 3 once as Clan Boss Free Entries', async () => {
    await konoha.leader.post('attack', { targetClanId: suna.leader.clanId, size: 5 })
    const rows = await db.select().from(clanWars)
    const [first] = standingsOf(rows)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 7 * 86_400_000))
    await settleClanWarWeek(db)
    await settleClanWarWeek(db)
    const leaderOf = first!.clanId === konoha.leader.clanId ? konoha.leader : suna.leader
    const missions = await leaderOf.client
      .get('/api/game/clan-events/missions')
      .then((r) => r.json<ClanMissionsView>())
    expect(missions.freeBattleEntries).toBe(CLAN_WAR_RULES.weeklyFreeEntries[0])
  })
})

describe('rules', () => {
  it('scales rewards by roster BP between 35% and 150%', () => {
    expect(clanWarRate(1_000, 1_090)).toBe(100)
    expect(clanWarRate(1_000, 910)).toBe(100)
    expect(clanWarRate(1_000, 700)).toBe(80)
    expect(clanWarRate(1_000, 100)).toBe(35)
    expect(clanWarRate(1_000, 1_300)).toBe(120)
    expect(clanWarRate(1_000, 5_000)).toBe(150)
  })

  it('ranks wins, then knockouts, defeated BP and fewer losses', () => {
    const side = (clanId: string, knockouts: number, defeatedPower = 0) => ({
      clanId,
      clanName: clanId,
      knockouts,
      power: 0,
      rewardPercent: 100,
      gcReward: 0,
      expReward: 0,
      stoneBonus: 0,
      giftCertificateBonus: 0,
      defeatedPower,
    })
    const war = (a: string, d: string, winner: string | null, ak: number, dk: number) =>
      ({
        attacker: side(a, ak),
        defender: side(d, dk),
        winnerClanId: winner,
      }) as typeof clanWars.$inferSelect
    const table = standingsOf([war('a', 'b', 'a', 3, 2), war('c', 'b', 'c', 4, 1)])
    expect(table.map((row) => [row.clanId, row.wins, row.losses])).toEqual([
      ['c', 1, 0],
      ['a', 1, 0],
      ['b', 0, 2],
    ])
  })
})

it('drops a ninja’s fighter with the ninja', async () => {
  const leader = await ninja({ create: 'Kiri' })
  await leader.wars<ClanWarStatus>()
  await db.delete(characters).where(eq(characters.id, leader.id))
  expect(await db.select().from(clanWarFighters)).toHaveLength(0)
})
