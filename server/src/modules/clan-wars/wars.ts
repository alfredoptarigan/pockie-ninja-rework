// Clan Wars (shared/src/schemas/clan-wars.ts). Saved fighters are arena-style snapshots of one
// equipment set; a war is fought at once, in the leader's transaction, as paired 1v1 duels of the
// two rosters' strongest saved fighters. The weekly Top 3 is paid once per week by the first
// request or job after Monday 00:00 UTC (clan_war_weeks marks it), in its own transaction.
//
// Locks: the attacking leader's character, then both clan rows in id order, then the clans'
// progress rows (clan EXP) and the winning fighters' Bankai rows. No other transaction takes a
// clan row and then waits on a character lock, so this cannot deadlock with them.
import { simulateFight } from '@pockie/game-core'
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { fighterPower } from '../../../../game-core/src/events/team-stone.js'
import {
  CLAN_WAR_RULES,
  CLAN_WAR_SIZES,
  clanWarRate,
  differencePercent,
  type ClanWarFighterView,
  type ClanWarHistoryView,
  type ClanWarMatchup,
  type ClanWarSize,
  type ClanWarStanding,
  type ClanWarStatus,
  type ClanWarTarget,
} from '../../../../shared/src/schemas/clan-wars.js'
import type { Db } from '../../db/client.js'
import {
  characters,
  clanMembers,
  clanMissions,
  clans,
  clanWarFighters,
  clanWars,
  clanWarWeeks,
  inventoryItems,
  type ClanWarDuelRow,
  type ClanWarSideRow,
} from '../../db/schema.js'
import { OUTFIT_SLOT, syncOutfit } from '../../game/outfit.js'
import type { Tx } from '../../game/progress.js'
import { arenaFighter, fromSnapshot, toSnapshot } from '../arena/snapshot.js'
import { addBankai, addClanExp } from '../clan-events/level.js'
import { logClan, SYSTEM_ACTOR } from '../clan-events/logs.js'
import { bad, newSeed, utcDay, type CharacterRow } from '../gates/common.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { HttpError } from '../../http.js'

type FighterRow = typeof clanWarFighters.$inferSelect
type WarRow = typeof clanWars.$inferSelect
type ClanRow = typeof clans.$inferSelect

const DAY_MS = 86_400_000
/** Rival clans listed (strongest rosters first). */
const TARGETS_SHOWN = 50
const STANDINGS_SHOWN = 50
const HISTORY_SHOWN = 10
/** The job looks every minute. */
export const CLAN_WAR_SETTLE_INTERVAL_MS = 60_000

const noClan = () => new HttpError(404, 'no_clan', 'You are not in a clan.')

// --- Fighters ------------------------------------------------------------------------------------

export async function hasOutfitInSet(db: Db | Tx, characterId: string, set: number) {
  const [row] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.characterId, characterId),
        eq(inventoryItems.equippedSlot, OUTFIT_SLOT),
        eq(inventoryItems.equippedSet, set),
      ),
    )
  return Boolean(row)
}

/**
 * The ninja as an arena fighter wearing equipment set `set`: the set is switched in for the read
 * and switched back, all inside the caller's transaction with the character row locked, so nobody
 * else ever sees the switch.
 */
async function setFighter(tx: Tx, character: CharacterRow, set: number) {
  if (set === character.activeSet) return arenaFighter(tx, character)
  await tx.update(characters).set({ activeSet: set }).where(eq(characters.id, character.id))
  await syncOutfit(tx, character.id, set)
  const [switched] = await tx.select().from(characters).where(eq(characters.id, character.id))
  const fighter = await arenaFighter(tx, switched!)
  const { activeSet, clothing, avatarId } = character
  await tx
    .update(characters)
    .set({ activeSet, clothing, avatarId })
    .where(eq(characters.id, character.id))
  return fighter
}

/** Equip Clan Fighter / Update Saved Fighter: snapshots `set`. The character row is locked. */
export async function saveFighter(tx: Tx, character: CharacterRow, set: number) {
  if (!(await hasOutfitInSet(tx, character.id, set)))
    throw bad('no_outfit', 'This equipment set has no outfit.')
  const fighter = await setFighter(tx, character, set)
  const values = {
    set,
    power: fighterPower(fighter.fighter),
    name: character.name,
    level: character.level,
    clothing: fighter.look.clothing,
    snapshot: toSnapshot(fighter),
    savedAt: new Date(),
  }
  await tx
    .insert(clanWarFighters)
    .values({ characterId: character.id, ...values })
    .onConflictDoUpdate({ target: clanWarFighters.characterId, set: values })
  const [member] = await tx
    .select({ clanId: clanMembers.clanId })
    .from(clanMembers)
    .where(eq(clanMembers.characterId, character.id))
  if (member) await logClan(tx, member.clanId, character.name, 'Clan War fighter', `Set ${set}`)
}

export async function removeFighter(tx: Tx, characterId: string) {
  await tx.delete(clanWarFighters).where(eq(clanWarFighters.characterId, characterId))
}

const fighterView = (row: FighterRow): ClanWarFighterView => ({
  characterId: row.characterId,
  name: row.name,
  level: row.level,
  clothing: row.clothing,
  power: row.power,
  set: row.set,
})

/**
 * Saved fighters of every member of `clanIds` (every clan when omitted), strongest first, by clan.
 * ponytail: the status reads every clan's fighters; page the rival list if clans grow to thousands.
 */
async function rosters(db: Db | Tx, clanIds?: string[]) {
  const rows = await db
    .select({ clanId: clanMembers.clanId, fighter: clanWarFighters })
    .from(clanWarFighters)
    .innerJoin(clanMembers, eq(clanMembers.characterId, clanWarFighters.characterId))
    .where(clanIds ? inArray(clanMembers.clanId, clanIds) : undefined)
    .orderBy(desc(clanWarFighters.power), clanWarFighters.characterId)
  const byClan = new Map<string, FighterRow[]>()
  for (const { clanId, fighter } of rows)
    byClan.set(clanId, [...(byClan.get(clanId) ?? []), fighter])
  return byClan
}

const topPower = (roster: readonly { power: number }[], size: number) =>
  roster.slice(0, size).reduce((sum, f) => sum + f.power, 0)

export function matchup(
  own: readonly { power: number }[],
  rival: readonly { power: number }[],
  size: number,
): ClanWarMatchup {
  const ownPower = topPower(own, size)
  const targetPower = topPower(rival, size)
  const rate = clanWarRate(ownPower, targetPower)
  return {
    available: own.length >= size && rival.length >= size,
    ownPower,
    targetPower,
    differencePercent: differencePercent(ownPower, targetPower),
    rewardPercent: rate,
    defenderRewardPercent: clanWarRate(targetPower, ownPower),
    gcPerKnockout: Math.round((CLAN_WAR_RULES.gcPerKnockout * rate) / 100),
    expPerKnockout: Math.round((CLAN_WAR_RULES.expPerKnockout * rate) / 100),
    stoneBonusChancePercent: (CLAN_WAR_RULES.stoneBonusChance * rate) / 100,
    giftCertificateBonusChancePercent: (CLAN_WAR_RULES.giftCertificateBonusChance * rate) / 100,
  }
}

// --- Standings -----------------------------------------------------------------------------------

export function standingsOf(wars: readonly WarRow[]): ClanWarStanding[] {
  const table = new Map<string, Omit<ClanWarStanding, 'rank'>>()
  for (const war of wars)
    for (const side of [war.attacker, war.defender]) {
      const row = table.get(side.clanId) ?? {
        clanId: side.clanId,
        clanName: side.clanName,
        wins: 0,
        losses: 0,
        knockouts: 0,
        defeatedPower: 0,
      }
      table.set(side.clanId, {
        ...row,
        wins: row.wins + (war.winnerClanId === side.clanId ? 1 : 0),
        losses: row.losses + (war.winnerClanId && war.winnerClanId !== side.clanId ? 1 : 0),
        knockouts: row.knockouts + side.knockouts,
        defeatedPower: row.defeatedPower + side.defeatedPower,
      })
    }
  return [...table.values()]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.knockouts - a.knockouts ||
        b.defeatedPower - a.defeatedPower ||
        a.losses - b.losses ||
        a.clanId.localeCompare(b.clanId),
    )
    .map((row, index) => ({ rank: index + 1, ...row }))
}

const warsBetween = (db: Db | Tx, from: Date, to: Date) =>
  db
    .select()
    .from(clanWars)
    .where(and(gte(clanWars.createdAt, from), lt(clanWars.createdAt, to)))

const weekStartDate = (now: Date) => new Date(`${weekStart(now)}T00:00:00Z`)
const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const nextMonthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

/**
 * Pays last week's Top 3 once (3 / 1 / 1 Clan Boss Free Entries into Clan Missions). Its own
 * transaction: the week marker row, then the winners' clan_missions rows.
 */
export async function settleClanWarWeek(db: Db, now = new Date()) {
  const thisWeek = weekStartDate(now)
  const lastWeek = new Date(thisWeek.getTime() - 7 * DAY_MS)
  await db.transaction(async (tx) => {
    const [marked] = await tx
      .insert(clanWarWeeks)
      .values({ week: weekStart(lastWeek) })
      .onConflictDoNothing()
      .returning()
    if (!marked) return
    const top = standingsOf(await warsBetween(tx, lastWeek, thisWeek)).slice(
      0,
      CLAN_WAR_RULES.weeklyFreeEntries.length,
    )
    for (const [index, standing] of top.entries()) {
      const entries = CLAN_WAR_RULES.weeklyFreeEntries[index]!
      await tx
        .insert(clanMissions)
        .values({ clanId: standing.clanId, freeEntries: entries })
        .onConflictDoUpdate({
          target: clanMissions.clanId,
          set: { freeEntries: sql`${clanMissions.freeEntries} + ${entries}` },
        })
      await logClan(
        tx,
        standing.clanId,
        SYSTEM_ACTOR,
        'Clan Wars weekly reward',
        `Rank ${standing.rank}: ${entries}x Clan Boss Free Entry`,
      )
    }
  })
}

// --- Status --------------------------------------------------------------------------------------

async function myMembership(db: Db | Tx, characterId: string) {
  const [row] = await db
    .select({ clan: clans, role: clanMembers.role })
    .from(clanMembers)
    .innerJoin(clans, eq(clans.id, clanMembers.clanId))
    .where(and(eq(clanMembers.characterId, characterId), isNull(clans.disbandedAt)))
  if (!row) throw noClan()
  return row
}

async function records(db: Db | Tx) {
  const rows = await db
    .select({
      id: clans.id,
      wins: sql<number>`(count(*) filter (where ${clanWars.winnerClanId} = ${clans.id}))::int`,
      losses: sql<number>`(count(*) filter (where ${clanWars.winnerClanId} <> ${clans.id}))::int`,
    })
    .from(clans)
    .innerJoin(
      clanWars,
      or(eq(clanWars.attackerClanId, clans.id), eq(clanWars.defenderClanId, clans.id)),
    )
    .groupBy(clans.id)
  return new Map(rows.map((row) => [row.id, row]))
}

function historyView(war: WarRow, clanId: string): ClanWarHistoryView {
  const mineAttacked = war.attacker.clanId === clanId
  const strip = ({ defeatedPower: _, ...side }: ClanWarSideRow) => side
  const myClan = strip(mineAttacked ? war.attacker : war.defender)
  const enemyClan = strip(mineAttacked ? war.defender : war.attacker)
  return {
    warId: war.id,
    size: war.size,
    endedAt: war.createdAt.toISOString(),
    winner: war.winnerClanId,
    myClan,
    enemyClan,
    duels: war.duels,
  }
}

export async function warStatus(
  db: Db | Tx,
  characterId: string,
  now = new Date(),
): Promise<ClanWarStatus> {
  const { clan, role } = await myMembership(db, characterId)
  const byClan = await rosters(db)
  const mine = byClan.get(clan.id) ?? []
  const otherIds = [...byClan.keys()].filter((id) => id !== clan.id)
  const others = otherIds.length
    ? await db
        .select()
        .from(clans)
        .where(and(inArray(clans.id, otherIds), isNull(clans.disbandedAt)))
    : []
  const attacked = new Set(
    (
      await db
        .select({ id: clanWars.defenderClanId })
        .from(clanWars)
        .where(and(eq(clanWars.attackerClanId, clan.id), eq(clanWars.day, utcDay(now))))
    ).map((row) => row.id),
  )
  const record = await records(db)
  const targets: ClanWarTarget[] = others
    .map((other) => {
      const roster = byClan.get(other.id) ?? []
      return {
        clanId: other.id,
        clanName: other.name,
        level: other.level,
        wins: record.get(other.id)?.wins ?? 0,
        losses: record.get(other.id)?.losses ?? 0,
        registeredFighters: roster.length,
        totalRegisteredPower: roster.reduce((sum, f) => sum + f.power, 0),
        attackedToday: attacked.has(other.id),
        roster: roster.slice(0, CLAN_WAR_SIZES.at(-1)).map(fighterView),
        matchups: Object.fromEntries(
          CLAN_WAR_SIZES.map((size) => [size, matchup(mine, roster, size)]),
        ) as Record<ClanWarSize, ClanWarMatchup>,
      }
    })
    .sort((a, b) => b.totalRegisteredPower - a.totalRegisteredPower)
    .slice(0, TARGETS_SHOWN)
  const [own] = await db
    .select()
    .from(clanWarFighters)
    .where(eq(clanWarFighters.characterId, characterId))
  const week = weekStartDate(now)
  const history = await db
    .select()
    .from(clanWars)
    .where(or(eq(clanWars.attackerClanId, clan.id), eq(clanWars.defenderClanId, clan.id)))
    .orderBy(desc(clanWars.createdAt))
    .limit(HISTORY_SHOWN)
  return {
    myClan: {
      clanId: clan.id,
      clanName: clan.name,
      registeredFighters: mine.length,
      roster: mine.slice(0, CLAN_WAR_SIZES.at(-1)).map(fighterView),
    },
    fighter: own ? fighterView(own) : null,
    canStartWar: role === 'leader',
    attacksRemaining: targets.filter((t) => !t.attackedToday).length,
    nextDailyReset: new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS).toISOString(),
    sizes: CLAN_WAR_SIZES,
    targets,
    weekly: {
      endsAt: new Date(week.getTime() + 7 * DAY_MS).toISOString(),
      standings: standingsOf(
        await warsBetween(db, week, new Date(week.getTime() + 7 * DAY_MS)),
      ).slice(0, STANDINGS_SHOWN),
    },
    monthly: {
      endsAt: nextMonthStart(now).toISOString(),
      standings: standingsOf(await warsBetween(db, monthStart(now), nextMonthStart(now))).slice(
        0,
        STANDINGS_SHOWN,
      ),
    },
    history: history.map((war) => historyView(war, clan.id)),
  }
}

// --- War -----------------------------------------------------------------------------------------

/** A chance in percent (may be fractional), rolled to 1/100 of a percent. */
const rolls = (percent: number) => randomInt(10_000) < Math.round(percent * 100)

/** Both rosters' fighters fight #1 vs #1, ... ; a double knockout counts for neither side. */
function fightDuels(attackers: FighterRow[], defenders: FighterRow[]) {
  return attackers.map((attacker, i): ClanWarDuelRow & { winnerId: string | null } => {
    const defender = defenders[i]!
    const replay = simulateFight({
      attackers: [fromSnapshot(attacker.snapshot).fighter],
      defenders: [fromSnapshot(defender.snapshot).fighter],
      seed: newSeed(),
    })
    const [a, d] = replay.fighters
    const winner =
      a!.hp <= 0 && d!.hp <= 0 ? 'none' : replay.winner === 'attackers' ? 'attacker' : 'defender'
    return {
      attacker: { name: attacker.name, power: attacker.power },
      defender: { name: defender.name, power: defender.power },
      winner,
      winnerId:
        winner === 'attacker'
          ? attacker.characterId
          : winner === 'defender'
            ? defender.characterId
            : null,
    }
  })
}

/** Pays one side: GC into clan storage, Clan EXP, the winner bonus rolls; returns its record. */
async function paySide(
  tx: Tx,
  clan: ClanRow,
  knockouts: number,
  power: number,
  rivalPower: number,
  defeatedPower: number,
  wonWar: boolean,
): Promise<ClanWarSideRow> {
  const rate = clanWarRate(power, rivalPower)
  const gcReward = knockouts * Math.round((CLAN_WAR_RULES.gcPerKnockout * rate) / 100)
  const expReward = knockouts * Math.round((CLAN_WAR_RULES.expPerKnockout * rate) / 100)
  const stoneBonus =
    wonWar && rolls((CLAN_WAR_RULES.stoneBonusChance * rate) / 100) ? CLAN_WAR_RULES.stoneBonus : 0
  const giftCertificateBonus =
    wonWar && rolls((CLAN_WAR_RULES.giftCertificateBonusChance * rate) / 100)
      ? CLAN_WAR_RULES.giftCertificateBonus
      : 0
  if (gcReward + giftCertificateBonus + stoneBonus > 0)
    await tx
      .update(clans)
      .set({
        giftCoupon: sql`${clans.giftCoupon} + ${gcReward + giftCertificateBonus}`,
        stone: sql`${clans.stone} + ${stoneBonus}`,
      })
      .where(eq(clans.id, clan.id))
  if (expReward > 0) await addClanExp(tx, clan, expReward)
  return {
    clanId: clan.id,
    clanName: clan.name,
    knockouts,
    power,
    rewardPercent: rate,
    gcReward,
    expReward,
    stoneBonus,
    giftCertificateBonus,
    defeatedPower,
  }
}

/** Attack Clan -> Confirm Attack. `leader` is the caller's locked character row. */
export async function attack(
  tx: Tx,
  leader: CharacterRow,
  targetClanId: string,
  size: ClanWarSize,
  now = new Date(),
) {
  const { clan: before, role } = await myMembership(tx, leader.id)
  if (role !== 'leader') throw new HttpError(403, 'forbidden', 'Leader Only')
  if (targetClanId === before.id) throw bad('own_clan', 'Choose a rival clan.')
  const locked = await tx
    .select()
    .from(clans)
    .where(and(inArray(clans.id, [before.id, targetClanId]), isNull(clans.disbandedAt)))
    .orderBy(clans.id)
    .for('update')
  const mine = locked.find((c) => c.id === before.id)
  const rival = locked.find((c) => c.id === targetClanId)
  if (!mine) throw noClan()
  if (!rival) throw new HttpError(404, 'unknown_clan', 'That clan no longer exists.')
  const [done] = await tx
    .select({ id: clanWars.id })
    .from(clanWars)
    .where(
      and(
        eq(clanWars.attackerClanId, mine.id),
        eq(clanWars.defenderClanId, rival.id),
        eq(clanWars.day, utcDay(now)),
      ),
    )
  if (done) throw bad('attacked_today', 'Attacked Today')
  const byClan = await rosters(tx, [mine.id, rival.id])
  const ours = (byClan.get(mine.id) ?? []).slice(0, size)
  const theirs = (byClan.get(rival.id) ?? []).slice(0, size)
  if (ours.length < size || theirs.length < size)
    throw bad('roster_too_small', 'Both clans need enough equipped fighters for this size.')

  const duels = fightDuels(ours, theirs)
  const count = (side: 'attacker' | 'defender') => duels.filter((d) => d.winner === side).length
  const defeated = (side: 'attacker' | 'defender') =>
    duels
      .filter((d) => d.winner === side)
      .reduce((sum, d) => sum + d[side === 'attacker' ? 'defender' : 'attacker'].power, 0)
  const [ourKos, theirKos] = [count('attacker'), count('defender')]
  const winnerClanId = ourKos > theirKos ? mine.id : theirKos > ourKos ? rival.id : null
  const ourPower = topPower(ours, size)
  const theirPower = topPower(theirs, size)
  const attackerSide = await paySide(
    tx,
    mine,
    ourKos,
    ourPower,
    theirPower,
    defeated('attacker'),
    winnerClanId === mine.id,
  )
  // addClanExp may have raised the level: the rival's row is still as locked.
  const defenderSide = await paySide(
    tx,
    rival,
    theirKos,
    theirPower,
    ourPower,
    defeated('defender'),
    winnerClanId === rival.id,
  )
  for (const duel of duels)
    if (duel.winnerId) await addBankai(tx, duel.winnerId, CLAN_WAR_RULES.bankaiCoinsPerWin, 0)
  const [war] = await tx
    .insert(clanWars)
    .values({
      day: utcDay(now),
      attackerClanId: mine.id,
      defenderClanId: rival.id,
      size,
      winnerClanId,
      attacker: attackerSide,
      defender: defenderSide,
      duels: duels.map(({ winnerId: _, ...duel }) => duel),
    })
    .returning()
  const result = (side: ClanRow) =>
    winnerClanId === null ? 'Draw' : winnerClanId === side.id ? 'Victory' : 'Defeat'
  await logClan(
    tx,
    mine.id,
    leader.name,
    'Clan War',
    `${result(mine)} against ${rival.name} (${size}v${size}, ${ourKos}-${theirKos} KOs)`,
  )
  await logClan(
    tx,
    rival.id,
    SYSTEM_ACTOR,
    'Clan War',
    `${result(rival)}: attacked by ${mine.name} (${size}v${size}, ${theirKos}-${ourKos} KOs)`,
  )
  return historyView(war!, mine.id)
}
