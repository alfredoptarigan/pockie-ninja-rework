// Honor sinks (pvp-rankings.md 2.9, decision 11): the Honor shop (scoreprize.ini) and Honor -> EXP
// (HonorExp.ini) at your arena tier.
import { createRandom } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { honorExchange, pickIdentifyCount } from '../../../../game-core/src/arena/index.js'
import {
  honorExchangeSchema,
  honorShopBuySchema,
  type HonorShopResult,
  type HonorShopView,
} from '../../../../shared/src/schemas/arena.js'
import type { Db } from '../../db/client.js'
import { arenaPlayers } from '../../db/schema.js'
import { arenaHonorShop } from '../../game/data.js'
import { expUpdate, grantItems, type Tx } from '../../game/progress.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  requireBagRoom,
  saveCharacter,
  withCharacter,
} from '../gates/common.js'
import { refreshArenaSnapshot } from './snapshot.js'
import { tierOf } from './store.js'

/** Honor shop items are bound: Honor cannot be turned into tradable goods (decision noted). */
const SHOP_ITEMS_BOUND = true

export async function tierOfCharacter(tx: Tx, characterId: string) {
  const [row] = await tx
    .select({ tier: arenaPlayers.tier })
    .from(arenaPlayers)
    .where(eq(arenaPlayers.characterId, characterId))
  return row?.tier ?? 0
}

function shopView(honor: number, tier: number): HonorShopView {
  const offers = Object.entries(arenaHonorShop())
    .map(([itemId, offer]) => ({ itemId, honor: offer.honor, minTier: offer.rank }))
    .sort((a, b) => a.honor - b.honor || a.itemId.localeCompare(b.itemId))
  return { tier, honor, offers, exchange: tierOf(tier).HonorExp }
}

async function result(tx: Tx, characterId: string, levelsGained?: number) {
  const view = await characterView(tx, characterId)
  const tier = await tierOfCharacter(tx, characterId)
  const shop = shopView(view.honor, tier)
  return { shop, character: view, ...(levelsGained !== undefined && { levelsGained }) }
}

export async function honorShopRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/shop', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) =>
      shopView(character.honor, await tierOfCharacter(tx, character.id)),
    ),
  )

  app.post('/shop/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { itemId } = honorShopBuySchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<HonorShopResult> => {
      // The original dereferenced null for an unknown id (bug 16).
      const offer = arenaHonorShop()[itemId]
      if (!offer) throw bad('unknown_item', 'That item is not sold here.')
      if ((await tierOfCharacter(tx, character.id)) < offer.rank)
        throw bad('tier_too_low', 'Your arena rank is too low for this item.')
      if (character.honor < offer.honor) throw bad('no_honor', 'You do not have enough Honor.')
      const award = { itemId, bound: SHOP_ITEMS_BOUND }
      await requireBagRoom(tx, character.id, [award])
      const identifyCount = pickIdentifyCount(offer, createRandom(randomInt(2 ** 31)))
      await grantItems(tx, character.id, [{ ...award, identifyCount }])
      await saveCharacter(tx, character.id, { honor: character.honor - offer.honor })
      return result(tx, character.id)
    })
  })

  app.post('/shop/exchange', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { units } = honorExchangeSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<HonorShopResult> => {
      const rate = tierOf(await tierOfCharacter(tx, character.id)).HonorExp
      const { honor, exp } = honorExchange(rate, units)
      if (character.honor < honor) throw bad('no_honor', 'You do not have enough Honor.')
      const { levelsGained, ...update } = expUpdate(character, exp)
      await saveCharacter(tx, character.id, { ...update, honor: character.honor - honor })
      if (levelsGained > 0) await refreshArenaSnapshot(tx, character.id)
      return result(tx, character.id, levelsGained)
    })
  })
}
