// Market routes (M4 task 7). Mounted by app.ts under /api/game/market.
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  marketBuySchema,
  marketCancelSchema,
  marketClaimItemSchema,
  marketClaimWalletSchema,
  marketListSchema,
} from '../../../../shared/src/schemas/market.js'
import type { Db } from '../../db/client.js'
import { characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import {
  buyListing,
  cancelListing,
  claimItems,
  claimWallet,
  listItem,
  requireMarket,
} from './market.js'
import { MARKET_RATE_LIMITS as LIMITS } from './rate-limits.js'
import { board, history, mine, recentSales, warehouseView } from './views.js'

type Character = typeof characters.$inferSelect

export interface MarketRouteOptions {
  db: Db
  /** Push hook after a sale commits (realtime "Market sale" notice); optional. */
  onSale?: (sellerId: string) => void
}

const now = () => new Date(Date.now())

export default async function marketRoutes(
  app: FastifyInstance,
  { db, onSale }: MarketRouteOptions,
) {
  const reader = async (request: FastifyRequest) => {
    const c = await characterOf(db, requireUser(request).id)
    requireMarket(c)
    return c
  }
  const reload = async (tx: Tx, id: string) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, id))
    return toCharacter(row!)
  }
  /** One transaction with the caller's character locked first. */
  const locked = <T extends object>(
    request: FastifyRequest,
    action: (tx: Tx, c: Character) => Promise<T>,
  ) =>
    db.transaction(async (tx) => {
      const c = await lockCharacter(tx, requireUser(request).id)
      const result = await action(tx, c)
      return { ...result, character: await reload(tx, c.id) }
    })

  app.get('/board', { config: { rateLimit: LIMITS.read } }, async (request) =>
    board(db, await reader(request), now()),
  )
  app.get('/recent', { config: { rateLimit: LIMITS.read } }, async (request) => {
    await reader(request)
    return recentSales(db)
  })
  app.get('/history', { config: { rateLimit: LIMITS.read } }, async (request) =>
    history(db, await reader(request)),
  )
  app.get('/mine', { config: { rateLimit: LIMITS.read } }, async (request) =>
    mine(db, await reader(request), now()),
  )
  app.get('/warehouse', { config: { rateLimit: LIMITS.read } }, async (request) =>
    warehouseView(db, await reader(request)),
  )

  app.post('/list', { config: { rateLimit: LIMITS.list } }, (request) => {
    const input = marketListSchema.parse(request.body)
    return locked(request, async (tx, c) => ({
      listing: await listItem(tx, c, input, now()),
    }))
  })
  app.post('/cancel', { config: { rateLimit: LIMITS.cancel } }, (request) => {
    const { listingId } = marketCancelSchema.parse(request.body)
    return locked(request, async (tx, c) => {
      await cancelListing(tx, c, listingId)
      return {}
    })
  })
  app.post('/buy', { config: { rateLimit: LIMITS.buy } }, async (request) => {
    const input = marketBuySchema.parse(request.body)
    const userId = requireUser(request).id
    // Buy locks buyer and seller in id order itself, so it cannot lock the caller first.
    const { sellerId, character } = await db.transaction(async (tx) => {
      const buyer = await characterOf(tx, userId)
      const sale = await buyListing(tx, buyer.id, input, now())
      return { ...sale, character: await reload(tx, buyer.id) }
    })
    onSale?.(sellerId)
    return { character }
  })
  app.post('/warehouse/claim', { config: { rateLimit: LIMITS.claim } }, (request) => {
    const { inventoryId } = marketClaimItemSchema.parse(request.body ?? {})
    return locked(request, (tx, c) => claimItems(tx, c, inventoryId))
  })
  app.post('/wallet/claim', { config: { rateLimit: LIMITS.claim } }, (request) => {
    marketClaimWalletSchema.parse(request.body ?? {})
    return locked(request, (tx, c) => claimWallet(tx, c))
  })
}
