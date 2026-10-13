import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import {
  characters,
  characterTreasures,
  inventoryItems,
  treasureJackpots,
} from '../../db/schema.js'
import { requireBagRoom, unequippedBagItemsWhere } from '../../game/bag.js'
import { item } from '../../game/data.js'
import { consumeOne, grantItems, removeItems } from '../../game/progress.js'
import { treasureCards, treasureReward, treasureTerms } from '../../game/treasure.js'
import { HttpError } from '../../http.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

const params = z.object({ id: z.uuid() })
const payment = z.object({ currency: z.enum(['gold', 'giftCoupon']).default('gold') })
const choice = z.object({ slot: z.number().int().min(0).max(4) })
const bad = (code: string, message: string) => new HttpError(400, code, message)
const view = (row: typeof characterTreasures.$inferSelect) => ({
  id: row.id,
  boxId: row.boxId,
  slots: 5,
})

export async function treasureRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/treasure', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const [pending] = await db
      .select()
      .from(characterTreasures)
      .where(eq(characterTreasures.characterId, character.id))
    return { treasure: pending ? view(pending) : null }
  })
  app.post('/items/:id/treasure', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = params.parse(request.params)
    const { currency } = payment.parse(request.body ?? {})
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      const [pending] = await tx
        .select()
        .from(characterTreasures)
        .where(eq(characterTreasures.characterId, character.id))
      if (pending) throw bad('treasure_pending', 'Pick your pending treasure card first.')
      const [box] = await tx
        .select()
        .from(inventoryItems)
        .where(and(unequippedBagItemsWhere(character.id), eq(inventoryItems.id, id)))
      if (!box) throw new HttpError(404, 'no_item', 'You do not have that item.')
      const terms = treasureTerms(box.itemId)
      if (!terms) throw bad('cannot_use', 'That item is not a treasure box.')
      if (character.level < Number(item(box.itemId)?.UseLevel ?? 0))
        throw bad('too_low', 'Your level is too low.')
      const keys = await tx
        .select()
        .from(inventoryItems)
        .where(and(unequippedBagItemsWhere(character.id), eq(inventoryItems.itemId, 'i100004')))
      if (keys.reduce((sum, row) => sum + row.count, 0) >= terms.OpenNum) {
        await removeItems(tx, character.id, 'i100004', terms.OpenNum)
      } else {
        if (character[currency] < terms.Gold)
          throw bad(
            'no_money',
            `You need ${terms.Gold} ${currency === 'gold' ? 'Gold' : 'Gift Coupons'}.`,
          )
        await tx
          .update(characters)
          .set({ [currency]: character[currency] - terms.Gold })
          .where(eq(characters.id, character.id))
      }
      await consumeOne(tx, box)
      const [pendingBox] = await tx
        .insert(characterTreasures)
        .values({
          characterId: character.id,
          boxId: box.itemId,
          cards: treasureCards(box.itemId, createRandom(randomInt(2 ** 31))),
        })
        .returning()
      const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
      return { treasure: view(pendingBox!), character: toCharacter(updated!) }
    })
  })
  app.post('/treasure/:id/pick', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { id } = params.parse(request.params)
    const { slot } = choice.parse(request.body)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      const [pending] = await tx
        .select()
        .from(characterTreasures)
        .where(and(eq(characterTreasures.characterId, character.id), eq(characterTreasures.id, id)))
      if (!pending)
        throw bad('no_treasure', 'That treasure has already been claimed or is not yours.')
      const cards = [...pending.cards]
      let reward = treasureReward(pending.boxId, cards[slot]!)
      // Original jackpot check: RandInt(0, Odds1) == Odds, then the server-wide Value limit.
      if (reward.Value > 0) {
        await tx.insert(treasureJackpots).values({ itemId: reward.ItemId }).onConflictDoNothing()
        const [counter] = await tx
          .select()
          .from(treasureJackpots)
          .where(eq(treasureJackpots.itemId, reward.ItemId))
          .for('update')
        if (randomInt(reward.Odds1 + 1) === reward.Odds && counter!.claimed < reward.Value) {
          await tx
            .update(treasureJackpots)
            .set({ claimed: sql`${treasureJackpots.claimed} + 1` })
            .where(eq(treasureJackpots.itemId, reward.ItemId))
        } else {
          const swap = cards.findIndex((_, index) => index !== slot)
          ;[cards[slot], cards[swap]] = [cards[swap]!, cards[slot]!]
          reward = treasureReward(pending.boxId, cards[slot]!)
        }
      }
      const count = Math.min(reward.Count, Number(item(reward.ItemId)?.ItemMaxFoldNum ?? 1))
      const items = Array.from({ length: count }, () => ({
        itemId: reward.ItemId,
        bound: reward.BindingStatus === 1,
      }))
      await requireBagRoom(tx, character.id, items)
      await grantItems(tx, character.id, items)
      await tx.delete(characterTreasures).where(eq(characterTreasures.id, id))
      return { cards, slot, reward: { ...items[0]!, count }, character: toCharacter(character) }
    })
  })
}
