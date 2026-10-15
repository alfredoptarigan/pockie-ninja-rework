// Manage Outfit's Visual Outfit and the Wardrobe (reborn-windows-M-Z-hud.md). Equipping an outfit
// goes through POST /items/:id/equip like any gear (game/outfit.ts).
import {
  VISUAL_OUTFIT_GOLD,
  visualOutfitSchema,
  wardrobeStoreSchema,
  wardrobeTakeSchema,
  type WardrobeItemView,
} from '@pockie/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import { inventoryView, itemView, recastsOf, requireBagRoom } from '../../game/bag.js'
import { outfitOf } from '../../game/outfit.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { ownedItem, reloadCharacter } from '../game/actions.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { spendCurrency } from '../pets/kennel.js'

type Character = typeof characters.$inferSelect

const bad = (code: string, message: string) => new HttpError(400, code, message)

/** A bag row of the character that is an outfit, or a refusal. */
async function ownedOutfit(tx: Tx, characterId: string, id: string) {
  const row = await ownedItem(tx, characterId, id)
  if (!outfitOf(row.itemId)) throw bad('not_outfit', 'Only outfits go there.')
  return row
}

async function wardrobeOf(tx: Tx | Db, character: Pick<Character, 'id' | 'avatarId'>) {
  const rows = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.characterId, character.id), eq(inventoryItems.location, 'wardrobe')),
    )
    .orderBy(asc(inventoryItems.wardrobeSlot))
  const recasts = await recastsOf(tx, rows)
  return rows.map((row): WardrobeItemView => ({
    ...itemView(row, character.avatarId, recasts.get(row.id)),
    wardrobeSlot: row.wardrobeSlot!,
  }))
}

export async function outfitRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const limit = { config: { rateLimit: RATE_LIMITS.item } }
  /** Runs an action under the character lock; answers with the character, bag and Wardrobe. */
  const act = (request: FastifyRequest, fn: (tx: Tx, c: Character) => Promise<void>) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const c = await lockCharacter(tx, userId)
      await fn(tx, c)
      const character = await reloadCharacter(tx, c.id)
      return {
        character,
        ...(await inventoryView(tx, character)),
        wardrobe: await wardrobeOf(tx, character),
      }
    })
  }

  // Manage Outfit "Choose Visual Outfit": any outfit in your bag; only the look changes.
  app.post('/outfit/visual', limit, (request) => {
    const { inventoryId } = visualOutfitSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const outfit = outfitOf((await ownedOutfit(tx, c.id, inventoryId)).itemId)!
      await spendCurrency(tx, c, 'gold', VISUAL_OUTFIT_GOLD)
      await tx
        .update(characters)
        .set({ visualClothing: outfit.clothing })
        .where(eq(characters.id, c.id))
      await refreshArenaSnapshot(tx, c.id)
    })
  })

  app.post('/outfit/visual/clear', limit, (request) =>
    act(request, async (tx, c) => {
      await tx.update(characters).set({ visualClothing: null }).where(eq(characters.id, c.id))
      await refreshArenaSnapshot(tx, c.id)
    }),
  )

  app.get('/wardrobe', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const userId = requireUser(request).id
    const [character] = await db.select().from(characters).where(eq(characters.userId, userId))
    if (!character) throw new HttpError(404, 'no_character', 'Create a ninja first.')
    return { items: await wardrobeOf(db, character) }
  })

  // moveItemToWardrobe: a loose bag outfit into an empty slot.
  app.post('/wardrobe/store', limit, (request) => {
    const { inventoryId, slot } = wardrobeStoreSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const row = await ownedOutfit(tx, c.id, inventoryId)
      if (row.equippedSlot) throw bad('equipped', 'Take the item off first.')
      const [taken] = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.characterId, c.id), eq(inventoryItems.wardrobeSlot, slot)))
      if (taken) throw bad('slot_taken', 'That wardrobe slot is taken.')
      await tx
        .update(inventoryItems)
        .set({ location: 'wardrobe', wardrobeSlot: slot, bagPage: null, bagSlot: null })
        .where(eq(inventoryItems.id, row.id))
    })
  })

  // moveItemFromWardrobe / clearWardrobe ("Take Out"): back to the bag, which needs room.
  app.post('/wardrobe/take', limit, (request) => {
    const { slot } = wardrobeTakeSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const [row] = await tx
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.characterId, c.id), eq(inventoryItems.wardrobeSlot, slot)))
      if (!row) throw bad('empty_slot', 'That wardrobe slot is empty.')
      await requireBagRoom(tx, c.id, [row], {
        separate: true,
        message: 'Inventory is full! Please make some space first.',
      })
      await tx
        .update(inventoryItems)
        .set({ location: 'bag', wardrobeSlot: null })
        .where(eq(inventoryItems.id, row.id))
    })
  })
}
