// Card Room (M6 decisions 27-30): card boxes add stacking cards; a complete collection pays its
// prize once. Every action locks the character row first, then the card rows (plan ground rules).
import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { openBox } from '../../../../game-core/src/cards/boxes.js'
import { CARD_COLLECTIONS, cardIdsOf } from '../../../../game-core/src/cards/constants.js'
import {
  cardCollectionParamsSchema,
  type CardClaimResult,
  type CardRoomView,
} from '../../../../shared/src/schemas/cards.js'
import type { Db } from '../../db/client.js'
import { characterCardPrizes, characterCards, inventoryItems } from '../../db/schema.js'
import { requireBagRoom } from '../../game/bag.js'
import { playerFighter } from '../../game/combat.js'
import { rebornCards } from '../../game/data.js'
import { consumeOne, grantItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

const bad = (code: string, message: string) => new HttpError(400, code, message)

async function view(tx: Tx | Db, characterId: string): Promise<CardRoomView> {
  const owned = await tx
    .select()
    .from(characterCards)
    .where(eq(characterCards.characterId, characterId))
  const claimed = await tx
    .select()
    .from(characterCardPrizes)
    .where(eq(characterCardPrizes.characterId, characterId))
  const counts = new Map(owned.map((row) => [row.cardId, row.count]))
  return {
    collections: rebornCards().collections.map((collection, index) => {
      const cards = collection.cards.map((card) => ({
        id: card.id,
        nameKey: card.nameKey,
        count: counts.get(card.id) ?? 0,
      }))
      return {
        id: collection.id,
        nameKey: collection.nameKey,
        rarity: collection.rarity,
        cards,
        owned: cards.filter((card) => card.count > 0).length,
        total: cards.length,
        prize: [...CARD_COLLECTIONS[index]!.prize],
        claimed: claimed.some((row) => row.collection === collection.id),
      }
    }),
  }
}

/**
 * Opens a card box from the bag (decision 28) inside the item-use transaction, after the caller
 * locked the character row. Returns null when the item is not a card box.
 */
export async function openCardBox(
  tx: Tx,
  characterId: string,
  row: typeof inventoryItems.$inferSelect,
) {
  const box = rebornCards().boxes.find((b) => b.item === row.itemId)
  if (!box) return null
  const cardId = openBox(box.rarity, createRandom(randomInt(2 ** 31)))
  await consumeOne(tx, row)
  await tx
    .insert(characterCards)
    .values({ characterId, cardId, count: 1 })
    .onConflictDoUpdate({
      target: [characterCards.characterId, characterCards.cardId],
      set: { count: sql`${characterCards.count} + 1` },
    })
  const nameKey =
    rebornCards()
      .collections.flatMap((c) => c.cards)
      .find((card) => card.id === cardId)?.nameKey ?? ''
  return { cardId, nameKey }
}

async function claim(tx: Tx, userId: string, collectionId: number): Promise<CardClaimResult> {
  const character = await lockCharacter(tx, userId)
  const collection = CARD_COLLECTIONS[collectionId - 1]!
  const [done] = await tx
    .select()
    .from(characterCardPrizes)
    .where(
      and(
        eq(characterCardPrizes.characterId, character.id),
        eq(characterCardPrizes.collection, collectionId),
      ),
    )
  if (done) throw bad('already_claimed', 'You have already claimed this prize.')
  const owned = await tx
    .select()
    .from(characterCards)
    .where(
      and(
        eq(characterCards.characterId, character.id),
        inArray(characterCards.cardId, cardIdsOf(collection)),
      ),
    )
    .for('update')
  if (owned.length < cardIdsOf(collection).length)
    throw bad('collection_incomplete', 'Collect every card of this collection first.')

  const prize = collection.prize.flatMap(({ itemId, count }) =>
    Array.from({ length: count }, () => ({ itemId, bound: true })),
  )
  // A full bag refuses the prize; nothing is recorded, so the claim stays open.
  await requireBagRoom(tx, character.id, prize)
  await grantItems(tx, character.id, prize)
  await tx
    .insert(characterCardPrizes)
    .values({ characterId: character.id, collection: collectionId })
  return {
    ...(await view(tx, character.id)),
    character: toCharacter(character, await playerFighter(tx, character)),
  }
}

export async function cardRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return view(db, character.id)
  })
  app.post(
    '/collections/:id/claim',
    { config: { rateLimit: RATE_LIMITS.item } },
    async (request) => {
      const userId = requireUser(request).id
      const { id } = cardCollectionParamsSchema.parse(request.params)
      return db.transaction((tx) => claim(tx, userId, id))
    },
  )
}

export default cardRoutes
