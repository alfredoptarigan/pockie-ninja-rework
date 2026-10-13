// Ninjutsu Duels (CompeteSystem OnCustomFriendFight 524-620): tier 2 on both sides, 10 free a day
// then 2 Gold, the defender's snapshot, no rewards, a log row on both sides. A block either way
// refuses the duel (decision 17).
import { createRandom } from '@pockie/game-core'
import { and, eq, gte, inArray, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  dailyCounters,
  duelCost,
  duelWindow,
  ARENA_COSTS,
} from '../../../../game-core/src/arena/index.js'
import {
  arenaDuelSchema,
  type DuelCandidate,
  type DuelResult,
  type DuelView,
} from '../../../../shared/src/schemas/arena.js'
import type { Db } from '../../db/client.js'
import { arenaPlayers, blocks, characters, friends } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bad, characterView, newSeed, saveCharacter, utcDay } from '../gates/common.js'
import { fight, playerOpponent } from './fights.js'
import { withPair } from './pair.js'
import { arenaFighter } from './snapshot.js'
import {
  addLog,
  listSize,
  logViews,
  placesOf,
  playersAt,
  PLAYER_TIER,
  type ArenaRow,
} from './store.js'

const candidateColumns = {
  name: characters.name,
  level: characters.level,
  clothing: characters.clothing,
  tier: arenaPlayers.tier,
  score: arenaPlayers.score,
}

async function candidates(tx: Tx, characterId: string): Promise<DuelCandidate[]> {
  const place = (await placesOf(tx, [characterId])).get(characterId)
  if (place === undefined) return []
  const places = duelWindow(place, await listSize(tx), createRandom(newSeed()))
  const ids = [...(await playersAt(tx, places)).values()]
  if (!ids.length) return []
  return tx
    .select(candidateColumns)
    .from(characters)
    .innerJoin(arenaPlayers, eq(arenaPlayers.characterId, characters.id))
    .where(inArray(characters.id, ids))
}

async function duelView(tx: Tx, characterId: string): Promise<DuelView> {
  const [arena] = await tx
    .select()
    .from(arenaPlayers)
    .where(eq(arenaPlayers.characterId, characterId))
  const duelsUsed = arena ? dailyCounters(arena, utcDay()).duelsUsed : 0
  const friendRows = await tx
    .select(candidateColumns)
    .from(friends)
    .innerJoin(characters, eq(characters.id, friends.friendId))
    .innerJoin(arenaPlayers, eq(arenaPlayers.characterId, friends.friendId))
    .where(and(eq(friends.ownerId, characterId), gte(arenaPlayers.tier, PLAYER_TIER)))
  return {
    tier: arena?.tier ?? 0,
    duelsUsed,
    freeDuels: ARENA_COSTS.freeDuels,
    duelGold: duelCost(duelsUsed),
    candidates: arena && arena.tier >= PLAYER_TIER ? await candidates(tx, characterId) : [],
    friends: friendRows,
    logs: await logViews(tx, characterId, true),
  }
}

async function blocked(tx: Tx, a: string, b: string) {
  const [row] = await tx
    .select({ owner: blocks.ownerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.ownerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.ownerId, b), eq(blocks.blockedId, a)),
      ),
    )
  return Boolean(row)
}

const requireTier = (arena: ArenaRow | undefined, code: string, message: string) => {
  if (!arena || arena.tier < PLAYER_TIER) throw bad(code, message)
  return arena
}

export async function duelRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/duels', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const me = await characterOf(db, requireUser(request).id)
    return db.transaction((tx) => duelView(tx, me.id))
  })

  app.post('/duel', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { name } = arenaDuelSchema.parse(request.body)
    return withPair(
      db,
      request,
      async (tx, me) => {
        const [row] = await tx
          .select({ id: characters.id })
          .from(characters)
          .where(eq(characters.nameLower, name.toLowerCase()))
        if (!row) throw bad('unknown_name', 'There is no ninja with that name.')
        if (row.id === me.id) throw bad('self', 'You cannot duel yourself.')
        return row.id
      },
      async (tx, { character, target, arenas }): Promise<DuelResult> => {
        if (!target) throw bad('unknown_name', 'There is no ninja with that name.')
        const me = requireTier(
          arenas.get(character.id),
          'tier_too_low',
          'Ninjutsu Duels need the rank Beginner III or higher.',
        )
        const theirs = requireTier(
          arenas.get(target.id),
          'target_tier_too_low',
          "Ninjutsu Duels need the rank Beginner III or higher. Your opponent's rank is too low.",
        )
        if (await blocked(tx, character.id, target.id))
          throw bad('blocked', 'You cannot duel this ninja.')
        const counters = dailyCounters(me, utcDay())
        const gold = duelCost(counters.duelsUsed)
        if (character.gold < gold) throw bad('no_gold', 'You do not have enough Gold.')

        const opponent = await playerOpponent(tx, target, theirs)
        const { replay, won, looks } = fight(await arenaFighter(tx, character), opponent)
        await tx
          .update(arenaPlayers)
          .set({ ...counters, duelsUsed: counters.duelsUsed + 1 })
          .where(eq(arenaPlayers.characterId, character.id))
        if (gold) await saveCharacter(tx, character.id, { gold: character.gold - gold })
        const log = { replay: { replay, looks } }
        await addLog(tx, {
          ...log,
          characterId: character.id,
          kind: 'duel',
          opponentId: target.id,
          opponentName: target.name,
          result: won ? 1 : 0,
        })
        await addLog(tx, {
          ...log,
          characterId: target.id,
          kind: 'duel_defense',
          opponentId: character.id,
          opponentName: character.name,
          result: won ? 0 : 1,
        })
        return {
          replay,
          looks,
          won,
          duel: await duelView(tx, character.id),
          character: await characterView(tx, character.id),
        }
      },
    )
  })
}
