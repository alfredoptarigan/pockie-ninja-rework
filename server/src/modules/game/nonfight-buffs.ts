import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characterBuffs, characters } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { activateTitle, buffDefinition, buffView } from '../../game/nonfight-buffs.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

/** A buff change may reduce maxima; preserve current HP/MP, clamped to the new stats. */
export async function refreshBuffState(tx: Tx, character: typeof characters.$inferSelect) {
  const fighter = await playerFighter(tx, character)
  const state = { ...character, hp: fighter.hp, mp: fighter.mp }
  await tx
    .update(characters)
    .set({ hp: state.hp, mp: state.mp })
    .where(eq(characters.id, character.id))
  await refreshArenaSnapshot(tx, character.id)
  return toCharacter(state, fighter)
}
export async function nonfightBuffRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/buffs', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return buffView(db, character.id)
  })
  app.post('/titles/activate', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { titleId } = z.object({ titleId: z.number().int().nonnegative() }).parse(request.body)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      await activateTitle(tx, character.id, titleId)
      return {
        ...(await buffView(tx, character.id)),
        character: await refreshBuffState(tx, character),
      }
    })
  })
  app.post(
    '/buffs/:buffId/remove',
    { config: { rateLimit: RATE_LIMITS.item } },
    async (request) => {
      const { buffId } = z
        .object({ buffId: z.coerce.number().int().positive() })
        .parse(request.params)
      return db.transaction(async (tx) => {
        const character = await lockCharacter(tx, requireUser(request).id)
        if (!buffDefinition(buffId)?.deltype)
          throw new HttpError(400, 'cannot_remove', 'Unequip the title to remove its bonus.')
        const removed = await tx
          .delete(characterBuffs)
          .where(
            and(eq(characterBuffs.characterId, character.id), eq(characterBuffs.buffId, buffId)),
          )
          .returning()
        if (!removed.length) throw new HttpError(404, 'no_buff', 'You do not have that buff.')
        return {
          ...(await buffView(tx, character.id)),
          character: await refreshBuffState(tx, character),
        }
      })
    },
  )
}
