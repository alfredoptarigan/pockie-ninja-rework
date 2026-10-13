// Rankings window (UI_GameTop) and the weekly toll gate ranking, under /api/game/rankings.
import {
  RANKING_PAGE_SIZE,
  rankingParamsSchema,
  rankingQuerySchema,
  tollGateRankingParamsSchema,
  type RankingPage,
  type RankingTree,
  type TollGateClaimResult,
  type TollGateRanking,
} from '@pockie/shared'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { rankings } from '../../game/data.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { tollGateTables } from '../gates/data.js'
import { characterView } from '../gates/common.js'
import { rankingList } from './lists.js'
import { claimTollGateReward, requireRankedGate, tollGateRanking } from './toll-gate-weekly.js'

function rankingTree(): RankingTree {
  const { lists, tollGates } = rankings()
  return {
    lists: lists.map(({ key, group, label }) => ({ key, group, label })),
    tollGates: {
      group: tollGates.group,
      label: tollGates.label,
      gates: tollGates.gates.map((id) => ({
        id,
        nameKey: `lg_${tollGateTables().gates[String(id)]?.TollGateName ?? `TollGate_${id}`}`,
      })),
    },
  }
}

export async function rankingRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    requireUser(request)
    return rankingTree()
  })

  app.get('/:key', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const { key } = rankingParamsSchema.parse(request.params)
    const query = rankingQuerySchema.parse(request.query)
    const character = await characterOf(db, requireUser(request).id)
    const all = await rankingList(db, key)
    const myPlace = all.find((row) => row.characterId === character.id)?.place ?? null
    const page =
      query.find === 'me' ? (myPlace ? Math.ceil(myPlace / RANKING_PAGE_SIZE) : 1) : query.page
    const start = (page - 1) * RANKING_PAGE_SIZE
    const result: RankingPage = {
      key,
      page,
      pages: Math.max(1, Math.ceil(all.length / RANKING_PAGE_SIZE)),
      total: all.length,
      rows: all.slice(start, start + RANKING_PAGE_SIZE).map(({ characterId: _, ...row }) => row),
      myPlace,
    }
    return result
  })

  app.get(
    '/toll-gates/:gateId',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request): Promise<TollGateRanking> => {
      const { gateId } = tollGateRankingParamsSchema.parse(request.params)
      requireRankedGate(gateId)
      const character = await characterOf(db, requireUser(request).id)
      return tollGateRanking(db, gateId, character.id)
    },
  )

  app.post(
    '/toll-gates/:gateId/claim',
    { config: { rateLimit: RATE_LIMITS.gates } },
    async (request): Promise<TollGateClaimResult> => {
      const { gateId } = tollGateRankingParamsSchema.parse(request.params)
      requireRankedGate(gateId)
      const userId = requireUser(request).id
      return db.transaction(async (tx) => {
        const character = await lockCharacter(tx, userId)
        const reward = await claimTollGateReward(tx, character, gateId)
        return {
          reward,
          ranking: await tollGateRanking(tx, gateId, character.id),
          character: await characterView(tx, character.id),
        }
      })
    },
  )
}
