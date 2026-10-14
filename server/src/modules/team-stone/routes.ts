// Team Stone routes (M5 decision 28) under /api/game/team-stone: state, queue, leaderboard,
// replays and the Battle Coin shop (the Honor shop list at the Honor price, paid in BC).
import { createRandom } from '@pockie/game-core'
import { fighterPower } from '../../../../game-core/src/events/team-stone.js'
import { pickIdentifyCount } from '../../../../game-core/src/arena/index.js'
import { WING_BC_OFFERS } from '../../../../game-core/src/wings/constants.js'
import {
  teamStoneMatchParamsSchema,
  teamStoneShopBuySchema,
  type TeamStoneLeaderboard,
  type TeamStoneMatchEntry,
  type TeamStoneReplay,
  type TeamStoneShopResult,
  type TeamStoneShopView,
  type TeamStoneView,
} from '../../../../shared/src/schemas/team-stone.js'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import type { Db } from '../../db/client.js'
import { characters, teamStoneMatches, teamStonePlayers, teamStoneQueue } from '../../db/schema.js'
import { arenaHonorShop } from '../../game/data.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { tierOfCharacter } from '../arena/shop.js'
import { arenaFighter } from '../arena/snapshot.js'
import {
  bad,
  characterView,
  requireBagRoom,
  saveCharacter,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import type { StoredMatch } from './matchmaking.js'
import {
  attemptsUsed,
  config,
  currentScore,
  leagueOf,
  lockPlayer,
  monthStart,
  settle,
  utcDay,
  weekStart,
  type PlayerRow,
} from './store.js'

const DAY_MS = 86_400_000
const HISTORY_SIZE = 5
const LEADERBOARD_SIZE = 10
/** BC shop items are bound like the Honor shop's. */
const SHOP_ITEMS_BOUND = true

const nextDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString()
const nextMonth = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()

const inMatch = (characterId: string) =>
  sql`(${characterId} = any(${teamStoneMatches.teamA}) or ${characterId} = any(${teamStoneMatches.teamB}))`

async function history(db: Tx | Db, characterId: string): Promise<TeamStoneMatchEntry[]> {
  const rows = await db
    .select()
    .from(teamStoneMatches)
    .where(inMatch(characterId))
    .orderBy(desc(teamStoneMatches.createdAt))
    .limit(HISTORY_SIZE)
  return rows.map((row) => {
    const stored = row.replay as StoredMatch
    const side = row.teamA.includes(characterId) ? 0 : 1
    const [a, b] = [stored.names.slice(0, 3), stored.names.slice(3)]
    return {
      id: row.id,
      won: row.winner === side,
      delta: stored.deltas[characterId] ?? 0,
      team: side === 0 ? a : b,
      enemy: side === 0 ? b : a,
      createdAt: row.createdAt.toISOString(),
    }
  })
}

async function view(
  db: Tx | Db,
  character: CharacterRow,
  player: PlayerRow | undefined,
  now = new Date(),
): Promise<TeamStoneView> {
  const { minLevel, attemptsPerDay, leagues } = config()
  const score = player ? currentScore(player, now) : 0
  const [queued] = await db
    .select({ queuedAt: teamStoneQueue.queuedAt })
    .from(teamStoneQueue)
    .where(eq(teamStoneQueue.characterId, character.id))
  return {
    minLevel,
    attemptsPerDay,
    attemptsUsed: player ? attemptsUsed(player, now) : 0,
    score,
    battleCoins: character.battleCoins,
    league: leagues.indexOf(leagueOf(score)),
    leagues,
    playedThisWeek: !!player && player.week === weekStart(now) && player.playedThisWeek,
    queue: queued ? { queuedAt: queued.queuedAt.toISOString() } : null,
    dayResetAt: nextDay(utcDay(now), 1),
    weekResetAt: nextDay(weekStart(now), 7),
    monthResetAt: nextMonth(now),
    history: await history(db, character.id),
  }
}

const playerOf = async (db: Tx | Db, characterId: string) =>
  (await db.select().from(teamStonePlayers).where(eq(teamStonePlayers.characterId, characterId)))[0]

/** POST /queue: level 50+, an attempt left (spent only when the fight starts), not queued. */
async function joinQueue(tx: Tx, character: CharacterRow) {
  const now = new Date()
  const { minLevel, attemptsPerDay } = config()
  if (character.level < minLevel) throw bad('too_low', `Team Stone opens at level ${minLevel}.`)
  const player = await settle(tx, await lockPlayer(tx, character.id), now)
  if (attemptsUsed(player, now) >= attemptsPerDay)
    throw bad('no_attempts', 'You have used all Team Stone fights for today.')
  const { fighter } = await arenaFighter(tx, character)
  const [queued] = await tx
    .insert(teamStoneQueue)
    .values({ characterId: character.id, score: player.score, power: fighterPower(fighter) })
    .onConflictDoNothing()
    .returning()
  if (!queued) throw bad('already_queued', 'You are already in the Team Stone queue.')
  return view(tx, character, player, now)
}

async function leaveQueue(tx: Tx, character: CharacterRow) {
  await tx.delete(teamStoneQueue).where(eq(teamStoneQueue.characterId, character.id))
  return view(tx, character, await playerOf(tx, character.id))
}

async function leaderboard(db: Db, characterId: string): Promise<TeamStoneLeaderboard> {
  const rows = await db
    .select({
      characterId: teamStonePlayers.characterId,
      name: characters.name,
      level: characters.level,
      score: teamStonePlayers.score,
    })
    .from(teamStonePlayers)
    .innerJoin(characters, eq(characters.id, teamStonePlayers.characterId))
    .where(
      and(eq(teamStonePlayers.month, monthStart(new Date())), sql`${teamStonePlayers.score} > 0`),
    )
    .orderBy(desc(teamStonePlayers.score), asc(teamStonePlayers.characterId))
    .limit(LEADERBOARD_SIZE)
  const ranked = rows.map((row, i) => ({ ...row, place: i + 1 }))
  return {
    rows: ranked.map(({ characterId: _, ...row }) => row),
    myPlace: ranked.find((row) => row.characterId === characterId)?.place ?? null,
  }
}

async function replayOf(db: Db, characterId: string, matchId: string): Promise<TeamStoneReplay> {
  const [row] = await db
    .select()
    .from(teamStoneMatches)
    .where(and(eq(teamStoneMatches.id, matchId), inMatch(characterId)))
  if (!row) throw new HttpError(404, 'unknown_match', 'That match was not found.')
  const stored = row.replay as StoredMatch
  return {
    replay: stored.replay,
    looks: stored.looks,
    side: row.teamA.includes(characterId) ? 0 : 1,
  }
}

/** The Honor shop list plus the M6 wing offers (decision 26), which roll no identify props. */
const bcShop = () => ({
  ...arenaHonorShop(),
  ...Object.fromEntries(
    Object.entries(WING_BC_OFFERS).map(([itemId, honor]) => [
      itemId,
      { c1: 0, c2: 0, c3: 0, c4: 0, honor, rank: 0 },
    ]),
  ),
})

const shopView = (battleCoins: number): TeamStoneShopView => ({
  battleCoins,
  offers: Object.entries(bcShop())
    .map(([itemId, offer]) => ({ itemId, price: offer.honor }))
    .sort((a, b) => a.price - b.price || a.itemId.localeCompare(b.itemId)),
})

/** One transaction with the character locked first: the BC check and the spend cannot race. */
async function buy(tx: Tx, character: CharacterRow, itemId: string): Promise<TeamStoneShopResult> {
  const offer = bcShop()[itemId]
  if (!offer) throw bad('unknown_item', 'That item is not sold here.')
  // The Honor shop list comes with its arena rank gate.
  if ((await tierOfCharacter(tx, character.id)) < offer.rank)
    throw bad('tier_too_low', 'Your arena rank is too low for this item.')
  if (character.battleCoins < offer.honor)
    throw bad('no_battle_coins', 'You do not have enough Battle Coins.')
  const award = { itemId, bound: SHOP_ITEMS_BOUND }
  await requireBagRoom(tx, character.id, [award])
  const identifyCount =
    itemId in WING_BC_OFFERS ? 0 : pickIdentifyCount(offer, createRandom(randomInt(2 ** 31)))
  await grantItems(tx, character.id, [{ ...award, identifyCount }])
  const battleCoins = character.battleCoins - offer.honor
  await saveCharacter(tx, character.id, { battleCoins })
  return { shop: shopView(battleCoins), character: await characterView(tx, character.id) }
}

export async function teamStoneRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return view(db, character, await playerOf(db, character.id))
  })
  app.post('/queue', { config: { rateLimit: RATE_LIMITS.item } }, (request) =>
    withCharacter(db, request, joinQueue),
  )
  app.post('/queue/leave', { config: { rateLimit: RATE_LIMITS.item } }, (request) =>
    withCharacter(db, request, leaveQueue),
  )
  app.get('/leaderboard', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return leaderboard(db, character.id)
  })
  app.get('/matches/:id', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const { id } = teamStoneMatchParamsSchema.parse(request.params)
    const character = await characterOf(db, requireUser(request).id)
    return replayOf(db, character.id, id)
  })
  app.get('/shop', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    shopView((await characterOf(db, requireUser(request).id)).battleCoins),
  )
  app.post('/shop/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { itemId } = teamStoneShopBuySchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => buy(tx, character, itemId))
  })
}

export default teamStoneRoutes
export { matchTeamStone, TEAM_STONE_MATCH_INTERVAL_MS } from './matchmaking.js'
export { payTeamStoneWeek, resetTeamStoneMonth, TEAM_STONE_SETTLE_INTERVAL_MS } from './store.js'
