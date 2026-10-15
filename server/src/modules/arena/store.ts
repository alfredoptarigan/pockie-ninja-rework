// Arena rows: locks, joining, the arena list order, the 18 opponent slots, logs and views.
import { createRandom } from '@pockie/game-core'
import { and, asc, count, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm'
import {
  dailyCounters,
  freeRefreshReady,
  nextTryGold,
  npcSlots,
  playerSlots,
  refereeScore,
  winRate,
  ARENA_COSTS,
  type SlotPick,
} from '../../../../game-core/src/arena/index.js'
import type {
  ArenaLogKind,
  ArenaLogView,
  ArenaSlotView,
  ArenaView,
} from '../../../../shared/src/schemas/arena.js'
import { arenaLogs, arenaOpponents, arenaPlayers, characters } from '../../db/schema.js'
import { arenaConfig, arenaTier, npc } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { newSeed, utcDay, type CharacterRow } from '../gates/common.js'
import { arenaFighter, toSnapshot } from './snapshot.js'

export type ArenaRow = typeof arenaPlayers.$inferSelect

/** competerank=2: from Beginner III ninjas are in the arena list and fight each other. */
export const PLAYER_TIER = 2
export const TOP_TIER = 21
const NORMAL_NPCS = 18
const BOSS_INDEX = 19
const ARENA_LOG_KINDS: ArenaLogKind[] = ['attack', 'revenge', 'boss', 'defense']
const DUEL_LOG_KINDS: ArenaLogKind[] = ['duel', 'duel_defense']

export const tierOf = (tier: number) => arenaTier(tier)!
export const normalNpcs = (tier: number) => tierOf(tier).npcs.slice(0, NORMAL_NPCS)
export const bossNpc = (tier: number) => tierOf(tier).npcs[BOSS_INDEX]!
export const npcScore = (npcId: string) => Number(npc(npcId)?.CompeteScore ?? 0)

/** Locks characters by id ascending (the fixed lock order of every arena transaction). */
export async function lockCharacters(tx: Tx, ids: string[]) {
  const rows = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, ids))
    .orderBy(asc(characters.id))
    .for('update')
  return new Map(rows.map((row) => [row.id, row]))
}

/** Locks arena rows by character id ascending; call after the character locks. */
export async function lockArenaRows(tx: Tx, ids: string[]) {
  const rows = await tx
    .select()
    .from(arenaPlayers)
    .where(inArray(arenaPlayers.characterId, ids))
    .orderBy(asc(arenaPlayers.characterId))
    .for('update')
  return new Map(rows.map((row) => [row.characterId, row]))
}

/** The ninja's arena row (locked), joining on the first visit with initscore and a snapshot. */
export async function joinArena(tx: Tx, character: CharacterRow) {
  const [existing] = await lockArenaRows(tx, [character.id]).then((rows) => [...rows.values()])
  if (existing) return existing
  const [row] = await tx
    .insert(arenaPlayers)
    .values({
      characterId: character.id,
      score: arenaConfig().initscore,
      snapshot: toSnapshot(await arenaFighter(tx, character)),
      snapshotAt: new Date(),
    })
    .returning()
  await rollSlots(tx, row!)
  return row!
}

/** The arena list (tier 2+) ordered by the one tie rule: compareArenaOrder in game-core. */
const ranked = (tx: Tx) =>
  tx
    .select({
      characterId: arenaPlayers.characterId,
      place:
        sql<number>`(row_number() over (order by ${arenaPlayers.tier} desc, ${arenaPlayers.score} desc, ${arenaPlayers.scoreAt}, ${arenaPlayers.characterId}) - 1)::int`.as(
          'place',
        ),
    })
    .from(arenaPlayers)
    .where(gte(arenaPlayers.tier, PLAYER_TIER))
    .as('ranked')

/** The clothing a ninja is drawn in: the Visual Outfit, else the worn outfit. */
export const lookColumn = sql<number>`coalesce(${characters.visualClothing}, ${characters.clothing})`

// ponytail: the list is ranked with a window function per query (O(n) rows); keep a cached
// place column if the arena grows past tens of thousands of ninjas.
export async function placesOf(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, number>()
  const list = ranked(tx)
  const rows = await tx.select().from(list).where(inArray(list.characterId, ids))
  return new Map(rows.map((row) => [row.characterId, row.place]))
}

export async function playersAt(tx: Tx, places: number[]) {
  if (!places.length) return new Map<number, string>()
  const list = ranked(tx)
  const rows = await tx.select().from(list).where(inArray(list.place, places))
  return new Map(rows.map((row) => [row.place, row.characterId]))
}

export async function listSize(tx: Tx) {
  const [row] = await tx
    .select({ total: count() })
    .from(arenaPlayers)
    .where(gte(arenaPlayers.tier, PLAYER_TIER))
  return row!.total
}

/** Rolls the 18 slots (a list refresh): the NPC phase below tier 2, the windows from tier 2. */
export async function rollSlots(tx: Tx, me: ArenaRow) {
  const random = createRandom(newSeed())
  const npcs = normalNpcs(me.tier)
  let picks: SlotPick[] = npcSlots(npcs, random)
  if (me.tier >= PLAYER_TIER) {
    const place = (await placesOf(tx, [me.characterId])).get(me.characterId) ?? 0
    picks = playerSlots(place, await listSize(tx), npcs, random)
  }
  const wanted = picks.flatMap((pick) => (pick.kind === 'place' ? [pick.place] : []))
  const found = await playersAt(tx, wanted)
  const fill = npcSlots(npcs, random)
  const rows = picks.map((pick, slot) => {
    const base = { characterId: me.characterId, slot }
    if (pick.kind === 'referee')
      return { ...base, kind: 'referee' as const, refereePlace: pick.place }
    const opponentId = pick.kind === 'place' ? found.get(pick.place) : undefined
    if (opponentId) return { ...base, kind: 'player' as const, opponentId }
    const npcId = pick.kind === 'npc' ? pick.npcId : (fill[slot] as { npcId: string }).npcId
    return { ...base, kind: 'npc' as const, npcId }
  })
  await tx.delete(arenaOpponents).where(eq(arenaOpponents.characterId, me.characterId))
  await tx.insert(arenaOpponents).values(rows)
}

export async function slotRow(tx: Tx, characterId: string, slot: number) {
  const [row] = await tx
    .select()
    .from(arenaOpponents)
    .where(and(eq(arenaOpponents.characterId, characterId), eq(arenaOpponents.slot, slot)))
  return row
}

async function slotViews(tx: Tx, me: ArenaRow): Promise<ArenaSlotView[]> {
  const slots = await tx
    .select()
    .from(arenaOpponents)
    .where(eq(arenaOpponents.characterId, me.characterId))
    .orderBy(asc(arenaOpponents.slot))
  const ids = slots.flatMap((s) => (s.opponentId ? [s.opponentId] : []))
  const players = ids.length
    ? await tx
        .select({
          id: characters.id,
          name: characters.name,
          level: characters.level,
          clothing: lookColumn,
          tier: arenaPlayers.tier,
          score: arenaPlayers.score,
        })
        .from(characters)
        .innerJoin(arenaPlayers, eq(arenaPlayers.characterId, characters.id))
        .where(inArray(characters.id, ids))
    : []
  const byId = new Map(players.map((p) => [p.id, p]))
  const places = await placesOf(tx, ids)
  return slots.flatMap((s): ArenaSlotView[] => {
    const base = { slot: s.slot, beaten: s.beaten }
    if (s.kind === 'referee') {
      const place = s.refereePlace!
      return [{ ...base, kind: 'referee', place, score: refereeScore(me.score, place) }]
    }
    if (s.kind === 'npc') {
      const npcId = s.npcId!
      const level = Number(npc(npcId)?.Level ?? 1)
      return [{ ...base, kind: 'npc', npcId, level, score: npcScore(npcId) }]
    }
    const p = byId.get(s.opponentId!)
    if (!p) return []
    const { id: characterId, ...rest } = p
    return [{ ...base, kind: 'player', characterId, ...rest, place: places.get(p.id) ?? 0 }]
  })
}

export async function arenaView(tx: Tx, me: ArenaRow, character: CharacterRow): Promise<ArenaView> {
  const now = new Date()
  const counters = dailyCounters(me, utcDay(now))
  const tier = tierOf(me.tier)
  const top = me.tier >= TOP_TIER
  const refreshReady = freeRefreshReady(me.freeRefreshAt, now)
  const place =
    me.tier >= PLAYER_TIER
      ? ((await placesOf(tx, [me.characterId])).get(me.characterId) ?? null)
      : null
  return {
    tier: me.tier,
    score: me.score,
    place,
    streak: me.streak,
    fights: me.fights,
    wins: me.wins,
    winRate: winRate(me.wins, me.fights),
    honor: character.honor,
    freeTriesLeft: Math.max(0, ARENA_COSTS.freeTries - counters.triesUsed),
    triesBought: counters.triesBought,
    maxBought: ARENA_COSTS.maxBought,
    tryGold: nextTryGold(counters),
    freeRefreshAt: refreshReady
      ? null
      : new Date(me.freeRefreshAt!.getTime() + ARENA_COSTS.refreshSeconds * 1000).toISOString(),
    refreshGold: ARENA_COSTS.refreshGold,
    bossReady: !top && me.score >= tier.endscore,
    bossNpcId: top ? null : bossNpc(me.tier),
    bossScore: top ? null : tier.endscore,
    slots: await slotViews(tx, me),
  }
}

export async function addLog(
  tx: Tx,
  values: typeof arenaLogs.$inferInsert & { kind: ArenaLogKind },
) {
  await tx.insert(arenaLogs).values(values)
  const duel = DUEL_LOG_KINDS.includes(values.kind)
  const kinds = duel ? DUEL_LOG_KINDS : ARENA_LOG_KINDS
  const config = arenaConfig()
  const own = and(eq(arenaLogs.characterId, values.characterId), inArray(arenaLogs.kind, kinds))
  const keep = tx
    .select({ id: arenaLogs.id })
    .from(arenaLogs)
    .where(own)
    .orderBy(desc(arenaLogs.createdAt), desc(arenaLogs.id))
    .limit(duel ? config.savefightfriendcount : config.savaselffightcount)
  await tx.delete(arenaLogs).where(and(own, notInArray(arenaLogs.id, keep)))
}

export async function logViews(tx: Tx, characterId: string, duels: boolean) {
  const rows = await tx
    .select({
      log: arenaLogs,
      // The opponent is still in the arena (a revenge needs their snapshot).
      opponentJoined: sql<boolean>`${arenaPlayers.characterId} is not null`,
    })
    .from(arenaLogs)
    .leftJoin(arenaPlayers, eq(arenaPlayers.characterId, arenaLogs.opponentId))
    .where(
      and(
        eq(arenaLogs.characterId, characterId),
        inArray(arenaLogs.kind, duels ? DUEL_LOG_KINDS : ARENA_LOG_KINDS),
      ),
    )
    .orderBy(desc(arenaLogs.createdAt), desc(arenaLogs.id))
  return rows.map(({ log, opponentJoined }): ArenaLogView => ({
    id: log.id,
    kind: log.kind,
    opponentName: log.opponentName,
    result: log.result,
    scoreDelta: log.scoreDelta,
    honor: log.honor,
    streak: log.streak,
    createdAt: log.createdAt.toISOString(),
    canRevenge: log.kind === 'defense' && log.result === 0 && opponentJoined,
  }))
}
