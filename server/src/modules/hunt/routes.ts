// Hunt, Chain Attack and Adventure with Jiraiya (shared/src/schemas/hunt.ts). Every action locks
// the character row first, then the feature's row.
import type { FastifyInstance } from 'fastify'
import { chainAttackStartSchema } from '../../../../shared/src/schemas/hunt.js'
import type { Db } from '../../db/client.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { withCharacter } from '../gates/common.js'
import { adventureRow, adventureView, returnFromAdventure, startAdventure } from './adventure.js'
import { chainRow, chainView, claimChain, startChain } from './chain-attack.js'
import { beginHunt, completeHunt, huntRow, huntView } from './hunt.js'

export async function huntRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const read = { config: { rateLimit: RATE_LIMITS.read } }
  const act = { config: { rateLimit: RATE_LIMITS.gates } }
  const fight = { config: { rateLimit: RATE_LIMITS.gateFight } }

  app.get('/hunt', read, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return huntView(await huntRow(db, character.id))
  })
  app.post('/hunt/begin', act, async (request) => withCharacter(db, request, beginHunt))
  app.post('/hunt/complete', act, async (request) => withCharacter(db, request, completeHunt))

  app.get('/chain-attack', read, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return db.transaction(async (tx) => ({ chain: chainView(await chainRow(tx, character.id)) }))
  })
  app.post('/chain-attack', act, async (request) => {
    const input = chainAttackStartSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => startChain(tx, character, input))
  })
  app.post('/chain-attack/claim', fight, async (request) =>
    withCharacter(db, request, (tx, character) => claimChain(tx, character, false)),
  )
  app.post('/chain-attack/instant-finish', fight, async (request) =>
    withCharacter(db, request, (tx, character) => claimChain(tx, character, true)),
  )

  app.get('/adventure', read, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return adventureView(await adventureRow(db, character.id), character.level)
  })
  app.post('/adventure/start', act, async (request) => withCharacter(db, request, startAdventure))
  app.post('/adventure/return', act, async (request) =>
    withCharacter(db, request, returnFromAdventure),
  )
}

export default huntRoutes
