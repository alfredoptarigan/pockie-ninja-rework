// Clan Wars under /api/game/clan-events/wars (Reborn: clanWarStatus, clanWarEquipFighter,
// clanWarUnequipFighter, clanWarAttack). Every request first settles last week's Top 3 (once).
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  clanWarAttackSchema,
  clanWarFighterSchema,
  type ClanWarAttackResult,
  type ClanWarFighterResult,
} from '../../../../shared/src/schemas/clan-wars.js'
import type { Db } from '../../db/client.js'
import { clanWarFighters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { characterView, withCharacter, type CharacterRow } from '../gates/common.js'
import { eq } from 'drizzle-orm'
import {
  attack,
  hasOutfitInSet,
  removeFighter,
  saveFighter,
  settleClanWarWeek,
  warStatus,
} from './wars.js'

const AUTO_SET = 1

export async function clanWarRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const fighterAction = (
    request: FastifyRequest,
    fn: (tx: Tx, character: CharacterRow) => Promise<unknown>,
  ) =>
    withCharacter(db, request, async (tx, character): Promise<ClanWarFighterResult> => {
      await fn(tx, character)
      return {
        status: await warStatus(tx, character.id),
        character: await characterView(tx, character.id),
      }
    })

  // "Equipment set I is registered automatically": a ninja without a saved fighter gets set I
  // saved when they open Clan Wars, if set I wears an outfit.
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    await settleClanWarWeek(db)
    const me = await characterOf(db, requireUser(request).id)
    const [saved] = await db
      .select({ id: clanWarFighters.characterId })
      .from(clanWarFighters)
      .where(eq(clanWarFighters.characterId, me.id))
    if (!saved && (await hasOutfitInSet(db, me.id, AUTO_SET)))
      await withCharacter(db, request, async (tx, character) => {
        const [again] = await tx
          .select({ id: clanWarFighters.characterId })
          .from(clanWarFighters)
          .where(eq(clanWarFighters.characterId, character.id))
        if (!again) await saveFighter(tx, character, AUTO_SET)
      })
    return warStatus(db, me.id)
  })

  app.post('/fighter', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const { set } = clanWarFighterSchema.parse(request.body)
    return fighterAction(request, (tx, character) => saveFighter(tx, character, set))
  })

  app.post('/fighter/remove', { config: { rateLimit: RATE_LIMITS.item } }, (request) =>
    fighterAction(request, (tx, character) => removeFighter(tx, character.id)),
  )

  app.post('/attack', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { targetClanId, size } = clanWarAttackSchema.parse(request.body)
    await settleClanWarWeek(db)
    return withCharacter(db, request, async (tx, leader): Promise<ClanWarAttackResult> => {
      const war = await attack(tx, leader, targetClanId, size)
      return {
        war,
        status: await warStatus(tx, leader.id),
        character: await characterView(tx, leader.id),
      }
    })
  })
}

export default clanWarRoutes
