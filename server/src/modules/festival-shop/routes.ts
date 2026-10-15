// Festival Shop under /api/game/festival-shop: the catalogue with the token balance, and buying
// one offer (Reborn's `christmasShopBuy {itemIndex}`). Prices come from the config only; the
// character row is locked first, then the shop row; the bag is checked before any token moves.
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  festivalShopBuySchema,
  type FestivalShopBuyResult,
  type FestivalShopView,
} from '../../../../shared/src/schemas/festival-shop.js'
import type { Db } from '../../db/client.js'
import { characterFestivalShop } from '../../db/schema.js'
import { itemInfo } from '../../game/bag.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  requireBagRoom,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { FESTIVAL_SHOP_MIN_LEVEL, FESTIVAL_SHOP_PLACEHOLDERS as SHOP } from './config.js'

type ShopRow = { tokens: number; purchases: Record<string, number> }

async function shopRow(tx: Tx, characterId: string, lock = false): Promise<ShopRow> {
  const query = tx
    .select()
    .from(characterFestivalShop)
    .where(eq(characterFestivalShop.characterId, characterId))
  const [row] = lock ? await query.for('update') : await query
  return row ?? { tokens: 0, purchases: {} }
}

const view = ({ tokens, purchases }: ShopRow): FestivalShopView => ({
  tokens,
  offers: SHOP.offers.map((offer, index) => ({
    index,
    itemId: offer.itemId,
    info: itemInfo(offer.itemId),
    amount: offer.amount,
    cost: offer.cost,
    limit: offer.limit,
    purchased: purchases[offer.itemId] ?? 0,
  })),
})

function requireLevel(character: CharacterRow) {
  if (character.level < FESTIVAL_SHOP_MIN_LEVEL)
    throw bad('too_low', `The Festival Shop opens at level ${FESTIVAL_SHOP_MIN_LEVEL}.`)
}

async function buy(tx: Tx, character: CharacterRow, index: number): Promise<FestivalShopBuyResult> {
  requireLevel(character)
  const offer = SHOP.offers[index]
  if (!offer) throw bad('unknown_item', 'That item is not in the Festival Shop.')
  const row = await shopRow(tx, character.id, true)
  const purchased = row.purchases[offer.itemId] ?? 0
  if (purchased >= offer.limit) throw bad('sold_out', 'That item is sold out.')
  if (row.tokens < offer.cost) throw bad('no_tokens', 'You do not have enough Festival Tokens.')
  const awards = Array.from({ length: offer.amount }, () => ({
    itemId: offer.itemId,
    bound: SHOP.bound,
  }))
  await requireBagRoom(tx, character.id, awards)
  const next = {
    tokens: row.tokens - offer.cost,
    purchases: { ...row.purchases, [offer.itemId]: purchased + 1 },
  }
  await tx
    .update(characterFestivalShop)
    .set(next)
    .where(eq(characterFestivalShop.characterId, character.id))
  await grantItems(tx, character.id, awards)
  return { shop: view(next), character: await characterView(tx, character.id) }
}

export async function festivalShopRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) => {
      requireLevel(character)
      return view(await shopRow(tx, character.id))
    }),
  )
  app.post('/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { index } = festivalShopBuySchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => buy(tx, character, index))
  })
}

export default festivalShopRoutes
