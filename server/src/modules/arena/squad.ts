// Squad Arena 3v3 (Reborn scene 6001: `loadSquadArena`, `setSquadArenaLoadouts`,
// `squadArenaRefresh`, `squadArenaFight`, `buySquadArenaTickets`, the Exchange) under
// /api/game/arena/squad. A squad is three equipment sets with different main stats; opponents are
// real players' squads only. Refreshing and fighting each spend a ticket (free ones first, then
// bought ones); a list with no eligible squad costs nothing.
import { createRandom, simulateFight } from '@pockie/game-core'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { eloDelta } from '../../../../game-core/src/arena/index.js'
import {
  buyTicketsSchema,
  coinShopBuySchema,
  squadFightSchema,
  squadLoadoutsSchema,
  type SquadActionResult,
  type SquadFightResult,
  type SquadRound,
  type SquadView,
} from '../../../../shared/src/schemas/arena-extras.js'
import type { Db } from '../../db/client.js'
import { characters, squadPlayers, type SquadHistoryRow } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  saveCharacter,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { SQUAD_ARENA, SQUAD_ARENA_PLACEHOLDERS as P, SQUAD_TICKETS } from './config.js'
import { buyCoinOffer, lockExtras, offerViews, readExtras, saveExtras } from './extras.js'
import {
  loadoutViews,
  lockSquads,
  squadError,
  squadLadder,
  squadRankOf,
  setFighter,
  type SquadRow,
} from './squad-store.js'
import { lockCharacters, lookColumn } from './store.js'

const LEADERBOARD_SIZE = 10
/** Nearest squads by score the 18 opponents are drawn from. */
const CANDIDATE_POOL = 40

const freeUsed = (row: SquadRow, today = utcDay()) => (row.day === today ? row.ticketsUsed : 0)

function requireLevel(character: CharacterRow) {
  if (character.level < SQUAD_ARENA.minLevel)
    throw bad('level_too_low', `You must be at least level ${SQUAD_ARENA.minLevel} to participate.`)
}

async function requireSquad(tx: Tx, character: CharacterRow, row: SquadRow) {
  if (!row.loadouts.length) throw bad('no_squad', 'Select your squad first.')
  const error = squadError(await loadoutViews(tx, character), row.loadouts)
  if (error) throw bad('squad_invalid', `Your squad is no longer valid. ${error}`)
}

async function squadView(tx: Tx, character: CharacterRow, row: SquadRow): Promise<SquadView> {
  const extras = await readExtras(tx, character.id)
  const loadouts = await loadoutViews(tx, character)
  const ids = row.opponents.map((o) => o.characterId)
  const others = ids.length
    ? await tx
        .select({
          id: characters.id,
          name: characters.name,
          level: characters.level,
          clothing: lookColumn,
          score: squadPlayers.score,
        })
        .from(characters)
        .innerJoin(squadPlayers, eq(squadPlayers.characterId, characters.id))
        .where(inArray(characters.id, ids))
    : []
  const byId = new Map(others.map((o) => [o.id, o]))
  return {
    minLevel: SQUAD_ARENA.minLevel,
    level: character.level,
    score: row.score,
    rank: row.loadouts.length ? await squadRankOf(tx, character.id) : null,
    fights: row.fights,
    wins: row.wins,
    freeTickets: Math.max(0, P.freeTicketsPerDay - freeUsed(row)),
    boughtTickets: extras.squadTickets,
    teamCoins: extras.teamCoins,
    loadouts,
    selected: row.loadouts,
    squadValid: row.loadouts.length > 0 && squadError(loadouts, row.loadouts) === null,
    opponents: row.opponents.flatMap((o, index) => {
      const other = byId.get(o.characterId)
      if (!other) return []
      const { id: characterId, ...rest } = other
      return [{ index, characterId, ...rest, won: o.won }]
    }),
    history: row.history,
    leaderboard: (await squadLadder(tx, LEADERBOARD_SIZE)).map(
      ({ rank, characterId, name, score }) => ({
        rank,
        characterId,
        name,
        score,
      }),
    ),
    shop: offerViews(P.shop),
    rewards: {
      teamCoinsPerMatch: SQUAD_ARENA.teamCoinsPerMatch,
      giftCouponChance: SQUAD_ARENA.giftCouponChance,
      giftCoupons: SQUAD_ARENA.giftCoupons,
      rankMultiplier: SQUAD_ARENA.rankMultiplier,
    },
  }
}

async function result(tx: Tx, characterId: string): Promise<SquadActionResult> {
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  const [row] = await tx
    .select()
    .from(squadPlayers)
    .where(eq(squadPlayers.characterId, characterId))
  return {
    squad: await squadView(tx, character!, row!),
    character: await characterView(tx, characterId),
  }
}

/** Spends one ticket: a free one of today, else a bought one. */
async function spendTicket(tx: Tx, row: SquadRow) {
  const today = utcDay()
  const used = freeUsed(row, today)
  if (used < P.freeTicketsPerDay) {
    await tx
      .update(squadPlayers)
      .set({ day: today, ticketsUsed: used + 1 })
      .where(eq(squadPlayers.characterId, row.characterId))
    return
  }
  const extras = await lockExtras(tx, row.characterId)
  if (extras.squadTickets <= 0) throw bad('no_tickets', 'You have no Squad Arena tickets left.')
  await saveExtras(tx, row.characterId, { squadTickets: extras.squadTickets - 1 })
}

/** Up to 18 other ninjas with a squad, drawn from the 40 nearest by score, best first. */
async function rollOpponents(tx: Tx, row: SquadRow) {
  const pool = await tx
    .select({ characterId: squadPlayers.characterId, score: squadPlayers.score })
    .from(squadPlayers)
    .where(
      and(
        ne(squadPlayers.characterId, row.characterId),
        sql`cardinality(${squadPlayers.loadouts}) = ${SQUAD_ARENA.squadSize}`,
      ),
    )
    .orderBy(sql`abs(${squadPlayers.score} - ${row.score})`, asc(squadPlayers.characterId))
    .limit(CANDIDATE_POOL)
  const random = createRandom(newSeed())
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = random.between(0, i)
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
    .slice(0, SQUAD_ARENA.opponents)
    .sort((a, b) => b.score - a.score)
    .map(({ characterId }) => ({ characterId, won: false }))
}

const pushHistory = (history: SquadHistoryRow[], line: SquadHistoryRow) =>
  [...history, line].slice(-P.historySize)

/** Three 1v1 fights in squad order, each side at full HP; two wins take the match. */
async function squadBattle(
  tx: Tx,
  me: { character: CharacterRow; row: SquadRow },
  them: { character: CharacterRow; row: SquadRow },
) {
  const rounds: SquadRound[] = []
  for (const [index, mySet] of me.row.loadouts.entries()) {
    const theirSet = them.row.loadouts[index]!
    const attacker = await setFighter(tx, me.character, mySet)
    const defender = await setFighter(tx, them.character, theirSet)
    const replay = simulateFight({
      attackers: [attacker.fighter],
      defenders: [defender.fighter],
      seed: newSeed(),
    })
    rounds.push({
      replay,
      looks: [attacker.look, defender.look],
      won: replay.winner === 'attackers',
      sets: [mySet, theirSet],
    })
  }
  return { rounds, won: rounds.filter((round) => round.won).length >= P.winsNeeded }
}

export async function squadRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/squad', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      const row = (await lockSquads(tx, [character.id])).get(character.id)!
      return squadView(tx, character, row)
    }),
  )

  app.post('/squad/loadouts', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { loadouts } = squadLoadoutsSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character) => {
      requireLevel(character)
      const row = (await lockSquads(tx, [character.id])).get(character.id)!
      const error = squadError(await loadoutViews(tx, character), loadouts)
      if (error) throw bad('squad_invalid', error)
      const saved = { ...row, loadouts }
      // The first squad gets its opponent list for free.
      const opponents = row.opponents.length ? row.opponents : await rollOpponents(tx, saved)
      await tx
        .update(squadPlayers)
        .set({ loadouts, opponents })
        .where(eq(squadPlayers.characterId, character.id))
      return result(tx, character.id)
    })
  })

  app.post('/squad/refresh', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      requireLevel(character)
      const row = (await lockSquads(tx, [character.id])).get(character.id)!
      await requireSquad(tx, character, row)
      const opponents = await rollOpponents(tx, row)
      // "No eligible player squads. No ticket was spent."
      if (!opponents.length) return { ...(await result(tx, character.id)), empty: true }
      await spendTicket(tx, row)
      await tx
        .update(squadPlayers)
        .set({ opponents })
        .where(eq(squadPlayers.characterId, character.id))
      return { ...(await result(tx, character.id)), empty: false }
    }),
  )

  app.post('/squad/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { index } = squadFightSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx): Promise<SquadFightResult> => {
      const me = await characterOf(tx, userId)
      const [peek] = await tx.select().from(squadPlayers).where(eq(squadPlayers.characterId, me.id))
      const targetId = peek?.opponents[index]?.characterId
      if (!targetId) throw bad('no_opponent', 'There is no squad in that place.')
      // Both ninjas, then both squad rows, in id order; then re-check what was read unlocked.
      const locked = await lockCharacters(tx, [me.id, targetId])
      const character = locked.get(me.id)!
      const target = locked.get(targetId)
      if (!target) throw bad('list_changed', 'That ninja left the Squad Arena.')
      const rows = await lockSquads(tx, [me.id, targetId])
      const mine = rows.get(me.id)!
      const theirs = rows.get(targetId)!
      const slot = mine.opponents[index]
      if (slot?.characterId !== targetId)
        throw bad('list_changed', 'The opponent list changed. Please try again.')
      if (slot.won) throw bad('beaten', 'You have already beaten this squad.')
      requireLevel(character)
      await requireSquad(tx, character, mine)
      const theirViews = await loadoutViews(tx, target)
      if (!theirs.loadouts.length || squadError(theirViews, theirs.loadouts))
        throw bad(
          'squad_unavailable',
          'This player squad is no longer available. Refresh your opponents.',
        )
      await spendTicket(tx, mine)

      const battle = await squadBattle(
        tx,
        { character, row: mine },
        { character: target, row: theirs },
      )
      const won = battle.won
      const scoreDelta =
        eloDelta(mine.score, theirs.score, won ? 1 : 0) * SQUAD_ARENA.rankMultiplier
      const now = new Date()
      const giftCoupons =
        createRandom(newSeed()).next() < SQUAD_ARENA.giftCouponChance ? SQUAD_ARENA.giftCoupons : 0
      const teamCoins = SQUAD_ARENA.teamCoinsPerMatch
      const at = now.toISOString()
      await tx
        .update(squadPlayers)
        .set({
          score: Math.max(0, mine.score + scoreDelta),
          ...(scoreDelta !== 0 && { scoreAt: now }),
          fights: mine.fights + 1,
          wins: mine.wins + (won ? 1 : 0),
          opponents: mine.opponents.map((o, i) => (i === index ? { ...o, won: o.won || won } : o)),
          history: pushHistory(mine.history, {
            name: target.name,
            scoreDelta,
            challenged: true,
            won,
            at,
          }),
        })
        .where(eq(squadPlayers.characterId, me.id))
      await tx
        .update(squadPlayers)
        .set({
          score: Math.max(0, theirs.score - scoreDelta),
          ...(scoreDelta !== 0 && { scoreAt: now }),
          fights: theirs.fights + 1,
          wins: theirs.wins + (won ? 0 : 1),
          history: pushHistory(theirs.history, {
            name: character.name,
            scoreDelta: -scoreDelta,
            challenged: false,
            won: !won,
            at,
          }),
        })
        .where(eq(squadPlayers.characterId, targetId))
      const extras = await lockExtras(tx, me.id)
      await saveExtras(tx, me.id, { teamCoins: extras.teamCoins + teamCoins })
      if (giftCoupons)
        await saveCharacter(tx, me.id, { giftCoupon: character.giftCoupon + giftCoupons })
      return {
        rounds: battle.rounds,
        won,
        scoreDelta,
        teamCoins,
        giftCoupons,
        ...(await result(tx, me.id)),
      }
    })
  })

  // Buy Squad Arena Tickets (spec: 200 Gift Certificates each, 1-10 at a time).
  app.post('/squad/tickets', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { amount } = buyTicketsSchema.parse(request.body)
    if (amount > SQUAD_TICKETS.maxPerPurchase)
      throw bad('too_many', `Buy at most ${SQUAD_TICKETS.maxPerPurchase} tickets at a time.`)
    return withCharacter(db, request, async (tx, character) => {
      const cost = amount * SQUAD_TICKETS.giftCoupons
      if (character.giftCoupon < cost)
        throw bad('no_coupons', 'You do not have enough Gift Certificates.')
      await lockSquads(tx, [character.id])
      const extras = await lockExtras(tx, character.id)
      await saveCharacter(tx, character.id, { giftCoupon: character.giftCoupon - cost })
      await saveExtras(tx, character.id, { squadTickets: extras.squadTickets + amount })
      return result(tx, character.id)
    })
  })

  // Squad Arena Exchange: Team Coins for items.
  app.post('/squad/shop/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { id } = coinShopBuySchema.parse(request.body)
    return withCharacter(db, request, async (tx, character) => {
      await lockSquads(tx, [character.id])
      await buyCoinOffer(tx, character.id, P.shop, id, 'teamCoins')
      return result(tx, character.id)
    })
  })
}
