// Ninja Mall (Reborn chunk 185 `Mall`) under /api/game/mall: the catalogue by tab and buying a
// row with a quantity. Prices come from the catalogue only; the character row is locked first,
// the bag is checked before any currency moves.
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  MALL_GROUP_LABELS,
  MALL_GROUPS,
  mallBuySchema,
  type MallBuyInput,
  type MallBuyResult,
  type MallView,
} from '../../../../shared/src/schemas/mall.js'
import type { Db } from '../../db/client.js'
import { characterMallPurchases, characters } from '../../db/schema.js'
import { itemInfo } from '../../game/bag.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { nextDay } from '../events/view.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  requireBagRoom,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { MALL_CATALOGUE } from './catalogue.js'

/** Today's purchases of daily-limited items, by item. */
async function boughtToday(tx: Tx, characterId: string, now: Date) {
  const rows = await tx
    .select()
    .from(characterMallPurchases)
    .where(
      and(
        eq(characterMallPurchases.characterId, characterId),
        eq(characterMallPurchases.day, utcDay(now)),
      ),
    )
  return new Map(rows.map((row) => [row.itemId, row.count]))
}

async function view(tx: Tx, characterId: string, now = new Date()): Promise<MallView> {
  const bought = await boughtToday(tx, characterId, now)
  const items = MALL_CATALOGUE.map((entry, index) => ({
    entry,
    view: {
      index,
      itemId: entry.itemId,
      info: itemInfo(entry.itemId),
      price: entry.price,
      currency: 'gold' as const,
      ...(entry.coupons && { altCurrency: 'coupons' as const, altPrice: entry.price }),
      ...(entry.dailyLimit !== undefined && {
        dailyLimit: entry.dailyLimit,
        purchasedToday: bought.get(entry.itemId) ?? 0,
      }),
    },
  }))
  return {
    groups: MALL_GROUPS.map((key) => ({
      key,
      label: MALL_GROUP_LABELS[key],
      items: items.filter(({ entry }) => entry.groups.includes(key)).map(({ view }) => view),
    })).filter((group) => group.items.length > 0),
    resetAt: nextDay(now),
  }
}

async function buy(
  tx: Tx,
  character: CharacterRow,
  { index, quantity, currency }: MallBuyInput,
): Promise<MallBuyResult> {
  const now = new Date()
  const entry = MALL_CATALOGUE[index]
  if (!entry) throw bad('unknown_item', 'That item is not in the Mall.')
  if (currency === 'coupons' && !entry.coupons)
    throw bad('invalid_currency', 'That item can only be bought with Gold.')
  if (entry.dailyLimit !== undefined) {
    const bought = (await boughtToday(tx, character.id, now)).get(entry.itemId) ?? 0
    if (bought + quantity > entry.dailyLimit)
      throw bad(
        'limit_reached',
        `You can buy ${entry.dailyLimit - bought} more of this today (limit ${entry.dailyLimit}).`,
      )
  }
  const total = entry.price * quantity
  const column = currency === 'gold' ? 'gold' : 'giftCoupon'
  if (character[column] < total)
    throw bad(
      `no_${currency}`,
      `You do not have enough ${currency === 'gold' ? 'Gold' : 'Gift Certificates'}.`,
    )
  // 2011: Gold buys unbound items, Gift Certificates bound ones.
  const awards = Array.from({ length: quantity }, () => ({
    itemId: entry.itemId,
    bound: currency === 'coupons',
  }))
  await requireBagRoom(tx, character.id, awards)
  await tx
    .update(characters)
    .set({ [column]: sql`${characters[column]} - ${total}` })
    .where(eq(characters.id, character.id))
  await grantItems(tx, character.id, awards)
  if (entry.dailyLimit !== undefined) {
    const day = utcDay(now)
    await tx
      .insert(characterMallPurchases)
      .values({ characterId: character.id, itemId: entry.itemId, day, count: quantity })
      .onConflictDoUpdate({
        target: [characterMallPurchases.characterId, characterMallPurchases.itemId],
        set: {
          day,
          count: sql`case when ${characterMallPurchases.day} = ${day} then ${characterMallPurchases.count} + ${quantity} else ${quantity} end`,
        },
      })
  }
  return {
    mall: await view(tx, character.id, now),
    character: await characterView(tx, character.id),
  }
}

export async function mallRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, (tx, character) => view(tx, character.id)),
  )
  app.post('/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const input = mallBuySchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => buy(tx, character, input))
  })
}

export default mallRoutes
