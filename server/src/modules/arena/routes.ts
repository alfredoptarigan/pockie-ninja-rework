// The arena under /api/game/arena (docs/original-data/pvp-rankings.md 2): view, slot fights, the
// boss, revenge, list refresh and the fight log with replays. Duels and the Honor shop register
// their own routes.
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { freeRefreshReady, ARENA_COSTS } from '../../../../game-core/src/arena/index.js'
import {
  arenaFightSchema,
  arenaLogParamsSchema,
  arenaRevengeSchema,
  type ArenaActionResult,
  type ArenaFightResult,
  type ArenaReplay,
} from '../../../../shared/src/schemas/arena.js'
import type { Db } from '../../db/client.js'
import { arenaLogs, arenaPlayers, characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bad, characterView, saveCharacter, withCharacter } from '../gates/common.js'
import { duelRoutes } from './duels.js'
import {
  arenaFight,
  bossFight,
  chargeRevenge,
  chargeTry,
  markBeaten,
  npcOpponent,
  playerOpponent,
  recordRevenge,
  refereeOpponent,
  type Opponent,
} from './fights.js'
import { withPair } from './pair.js'
import { honorShopRoutes } from './shop.js'
import { arenaFighter } from './snapshot.js'
import { arenaView, joinArena, logViews, rollSlots, slotRow, type ArenaRow } from './store.js'

const notJoined = () => bad('not_joined', 'Open the arena first.')

async function reload(tx: Tx, characterId: string): Promise<ArenaActionResult> {
  const [arena] = await tx
    .select()
    .from(arenaPlayers)
    .where(eq(arenaPlayers.characterId, characterId))
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  return {
    arena: await arenaView(tx, arena!, character!),
    character: await characterView(tx, characterId),
  }
}

export async function arenaRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const options = { db }
  await app.register(duelRoutes, options)
  await app.register(honorShopRoutes, options)

  // Joins on the first look (initscore, snapshot, first list), so it runs locked like a write.
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) =>
      arenaView(tx, await joinArena(tx, character), character),
    ),
  )

  app.post('/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { slot } = arenaFightSchema.parse(request.body)
    return withPair(
      db,
      request,
      async (tx, me) => (await slotRow(tx, me.id, slot))?.opponentId ?? null,
      async (tx, { character, target, arenas }): Promise<ArenaFightResult> => {
        const me = arenas.get(character.id)
        if (!me) throw notJoined()
        const row = await slotRow(tx, character.id, slot)
        if (!row) throw bad('no_opponent', 'There is no opponent in that place.')
        // A refresh or a deleted ninja between the first read and the locks.
        if ((row.opponentId ?? undefined) !== target?.id)
          throw bad('list_changed', 'The opponent list changed. Please try again.')
        if (row.beaten) throw bad('beaten', 'You have already beaten this opponent.')
        let opponent: Opponent
        if (row.kind === 'npc') opponent = npcOpponent(row.npcId!)
        else if (row.kind === 'referee')
          opponent = refereeOpponent(await arenaFighter(tx, character), me.score, row.refereePlace!)
        else {
          const theirs = target && arenas.get(target.id)
          if (!target || !theirs) throw bad('list_changed', 'That ninja left the arena.')
          opponent = await playerOpponent(tx, target, theirs)
        }
        const { gold, counters } = chargeTry(character, me)
        const outcome = await arenaFight(tx, { character, arena: me }, opponent, {
          counters,
          gold,
          revenge: false,
        })
        if (outcome.won) await markBeaten(tx, character.id, slot)
        return { ...outcome, promotedTo: null, ...(await reload(tx, character.id)) }
      },
    )
  })

  app.post('/boss', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withPair(
      db,
      request,
      async () => null,
      async (tx, { character, arenas }): Promise<ArenaFightResult> => {
        const me = arenas.get(character.id)
        if (!me) throw notJoined()
        const outcome = await bossFight(tx, character, me)
        return { ...outcome, ...(await reload(tx, character.id)) }
      },
    ),
  )

  app.post('/revenge', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { logId } = arenaRevengeSchema.parse(request.body)
    const ownLog = (tx: Tx, characterId: string) =>
      tx
        .select()
        .from(arenaLogs)
        .where(and(eq(arenaLogs.id, logId), eq(arenaLogs.characterId, characterId)))
        .then((rows) => rows[0])
    return withPair(
      db,
      request,
      async (tx, me) => (await ownLog(tx, me.id))?.opponentId ?? null,
      async (tx, { character, target, arenas }): Promise<ArenaFightResult> => {
        const me = arenas.get(character.id)
        if (!me) throw notJoined()
        const log = await ownLog(tx, character.id)
        const theirs = target && arenas.get(target.id)
        if (
          !log ||
          log.kind !== 'defense' ||
          log.result !== 0 ||
          !target ||
          !theirs ||
          log.opponentId !== target.id
        )
          throw bad('cannot_revenge', 'You can only take revenge on a ninja who beat you.')
        const { gold, counters, used } = await chargeRevenge(tx, character, me, target.id)
        const opponent = await playerOpponent(tx, target, theirs)
        const outcome = await arenaFight(tx, { character, arena: me }, opponent, {
          counters,
          gold,
          revenge: true,
        })
        await recordRevenge(tx, character.id, target.id, used)
        return { ...outcome, promotedTo: null, ...(await reload(tx, character.id)) }
      },
    )
  })

  // One free refresh once refurbishtime has passed since the last free one, else 20 Gold.
  app.post('/refresh', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<ArenaActionResult> => {
      const me: ArenaRow = await joinArena(tx, character)
      const now = new Date()
      const free = freeRefreshReady(me.freeRefreshAt, now)
      const gold = free ? 0 : ARENA_COSTS.refreshGold
      if (character.gold < gold) throw bad('no_gold', 'You do not have enough Gold.')
      if (gold) await saveCharacter(tx, character.id, { gold: character.gold - gold })
      if (free)
        await tx
          .update(arenaPlayers)
          .set({ freeRefreshAt: now })
          .where(eq(arenaPlayers.characterId, character.id))
      await rollSlots(tx, me)
      return reload(tx, character.id)
    }),
  )

  app.get('/logs', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const me = await characterOf(db, requireUser(request).id)
    return db.transaction(async (tx) => ({ logs: await logViews(tx, me.id, false) }))
  })

  app.get('/logs/:id', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const { id } = arenaLogParamsSchema.parse(request.params)
    const me = await characterOf(db, requireUser(request).id)
    const [log] = await db
      .select({ replay: arenaLogs.replay })
      .from(arenaLogs)
      .where(and(eq(arenaLogs.id, id), eq(arenaLogs.characterId, me.id)))
    if (!log) throw bad('no_log', 'That fight is not in your log.')
    return log.replay as ArenaReplay
  })
}
