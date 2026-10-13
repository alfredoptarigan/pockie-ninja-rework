// Transactions that touch two ninjas (arena fights, revenges, duels): characters are locked by id
// ascending, then their arena rows, so concurrent fights on one defender queue up consistently.
import { GateRuleError } from '@pockie/game-core'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { bad, type CharacterRow } from '../gates/common.js'
import { lockArenaRows, lockCharacters, type ArenaRow } from './store.js'

export interface Pair {
  character: CharacterRow
  /** The other ninja, locked; undefined when there is none (NPC slots) or they are gone. */
  target?: CharacterRow
  arenas: Map<string, ArenaRow>
}

/**
 * `targetOf` reads (unlocked) who the other side is; both characters and arena rows are then
 * locked in the fixed order and `action` must re-check that the target is still the same.
 */
export async function withPair<T>(
  db: Db,
  request: FastifyRequest,
  targetOf: (tx: Tx, me: CharacterRow) => Promise<string | null>,
  action: (tx: Tx, pair: Pair) => Promise<T>,
) {
  const userId = requireUser(request).id
  try {
    return await db.transaction(async (tx) => {
      const me = await characterOf(tx, userId)
      const targetId = await targetOf(tx, me)
      const ids = [...new Set([me.id, ...(targetId ? [targetId] : [])])]
      const characters = await lockCharacters(tx, ids)
      const arenas = await lockArenaRows(tx, ids)
      const target = targetId ? characters.get(targetId) : undefined
      return action(tx, { character: characters.get(me.id)!, target, arenas })
    })
  } catch (error) {
    if (error instanceof GateRuleError) throw bad(error.code, error.message)
    throw error
  }
}
