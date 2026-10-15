// Energy Refill (Reborn's `refillEnergy`): POST /api/game/energy/refill with the character locked.
import type { FastifyInstance } from 'fastify'
import type { EnergyRefillResult } from '../../../../shared/src/schemas/energy.js'
import type { Db } from '../../db/client.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { characterView, withCharacter } from '../gates/common.js'
import { refillEnergy } from './energy.js'

export async function energyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post('/refill', { config: { rateLimit: RATE_LIMITS.energyRefill } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<EnergyRefillResult> => ({
      restored: await refillEnergy(tx, character),
      character: await characterView(tx, character.id),
    })),
  )
}

export default energyRoutes
