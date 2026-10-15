// Gems and enchantments under /api/game/forge: socketing a gem (Reborn's bag gemInsert), Remove
// Gems (Armory Remove tab and the bag menu's gemRemoveByUID), Create Hole (gemCreateHole) and the
// Enchantment tab (enchantAttempt). Rules follow the 2011 EnchaseSystem, AddHoleSystem and
// AddMagicSystem where Reborn's client does not decide them. Every route locks the character row,
// then the item rows it changes.
import { isAppraised } from '@pockie/game-core'
import { enchantSchema, forgeItemSchema, gemHoleSchema, gemInsertSchema } from '@pockie/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { inventoryItems } from '../../db/schema.js'
import { bagItemsWhere, requireBagRoom } from '../../game/bag.js'
import { item } from '../../game/data.js'
import { gemOf, stoneOf } from '../../game/gems.js'
import { consumeOne, grantItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bad, equipmentOf, pay, respond, spendTalisman } from './routes.js'

type ItemRow = typeof inventoryItems.$inferSelect

/**
 * Reborn decides these on its server and its client shows no price.
 * - removeGemGold: Gold per gem taken out. Confirmed 0 (user decision, docs/audit section 6):
 *   Reborn's Remove tab and the menu's Remove Gems send no payment; 2011 charged
 *   DivideJewelLevel1..10 (4..191 Gold or Gift Coupons) by gem level.
 * - enchantGold (PLACEHOLDER, to be confirmed): Gold per enchantment on top of the stone. Reborn's Enchantment tab takes only the
 *   stone; 2011 charged AddMagicCost (1 Gold or Gift Coupon) or a Level 8 Enchantment Talisman.
 * Create Hole needs a Slot Talisman as in Reborn (its Attempt is disabled without one), so 2011's
 * AddHoleCost (58 Gold) is not offered.
 */
export const GEM_PLACEHOLDERS = { removeGemGold: 0, enchantGold: 0 } as const

/** FreeTimesItem FreePropName of the Slot Talismans (i161002, i161040-i161046). */
const SLOT_TALISMAN = 'FreeAddHole'

/** One of the character's bag rows (worn included), locked for update. */
async function lockedItem(tx: Tx, characterId: string, id: string): Promise<ItemRow> {
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(and(bagItemsWhere(characterId), eq(inventoryItems.id, id)))
    .for('update')
  if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
  return row
}

/** Gear whose stats changed: worn gear also updates the arena defence. */
async function saveGear(tx: Tx, gear: ItemRow, set: Partial<ItemRow>) {
  await tx.update(inventoryItems).set(set).where(eq(inventoryItems.id, gear.id))
  if (gear.equippedSlot) await refreshArenaSnapshot(tx, gear.characterId)
}

export default async function gemRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Reborn's gemInsert (a held gem dropped on gear) / EnchaseSystem custom 121: the first open
  // socket takes the gem. Gear of any level fits a gem whose level it reaches; a bound gem binds it.
  app.post('/gems/insert', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, gemId } = gemInsertSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const gear = await lockedItem(tx, character.id, itemId)
      const config = equipmentOf(gear, 'given a gem')
      const gemRow = await lockedItem(tx, character.id, gemId)
      const gem = gemOf(gemRow.itemId)
      if (!gem) throw bad('not_gem', 'That is not a gem.')
      if ((config.UseLevel ?? 0) < gem.level)
        throw bad('too_low', `That gem needs gear of level ${gem.level} or higher.`)
      const open = gear.gems.indexOf(null)
      if (open < 0) {
        throw bad(
          'no_socket',
          gear.gems.length > 0
            ? 'Every gem socket of that item is full.'
            : 'That item has no gem socket. Create one first.',
        )
      }
      await consumeOne(tx, gemRow)
      await saveGear(tx, gear, {
        gems: gear.gems.map((id, index) => (index === open ? gemRow.itemId : id)),
        bound: gear.bound || gemRow.bound,
      })
      return respond(tx, character.id, gear.id)
    })
  })

  // Reborn's gemRemove / gemRemoveByUID: every gem back to the bag with the gear's binding
  // (EnchaseSystem.DivieJewel); the sockets stay open.
  app.post('/gems/remove', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId } = forgeItemSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const gear = await lockedItem(tx, character.id, itemId)
      const gems = gear.gems.filter((id): id is string => id !== null)
      if (gems.length === 0) throw bad('no_gems', 'That item has no gems.')
      const awards = gems.map((gemId) => ({ itemId: gemId, bound: gear.bound }))
      await requireBagRoom(tx, character.id, awards, {
        message: 'Inventory is full! Please make some space first.',
      })
      await pay(tx, character, 'gold', GEM_PLACEHOLDERS.removeGemGold * gems.length)
      await grantItems(tx, character.id, awards)
      await saveGear(tx, gear, { gems: gear.gems.map(() => null) })
      return respond(tx, character.id, gear.id)
    })
  })

  // Reborn's gemCreateHole / AddHoleSystem free mode: one more socket, up to MaxHoleCount, for a
  // Slot Talisman whose level range covers the gear. Always succeeds.
  app.post('/gems/hole', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, talisman } = gemHoleSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const gear = await lockedItem(tx, character.id, itemId)
      const config = equipmentOf(gear, 'given a gem slot')
      if (!isAppraised(gear)) throw bad('unappraised', 'Appraise that item first.')
      const max = config.MaxHoleCount ?? 0
      if (max === 0) throw bad('no_sockets', 'That item cannot have gem sockets.')
      if (gear.gems.length >= max) throw bad('max_sockets', 'That item has all its gem sockets.')
      if (item(talisman)?.FreePropName !== SLOT_TALISMAN)
        throw bad('no_talisman', 'You need a Slot Talisman to create a gem slot.')
      const talismanBound = await spendTalisman(tx, character.id, talisman, config.UseLevel ?? 0)
      await saveGear(tx, gear, {
        gems: [...gear.gems, null],
        bound: gear.bound || talismanBound,
      })
      return respond(tx, character.id, gear.id)
    })
  })

  // Reborn's enchantAttempt / AddMagicSystem: the stone's lines replace any earlier enchantment.
  // The stone must name the gear's EquipType and the gear must reach the stone's level.
  app.post('/enchant', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, stoneId } = enchantSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const gear = await lockedItem(tx, character.id, itemId)
      const config = equipmentOf(gear, 'enchanted')
      if (!isAppraised(gear)) throw bad('unappraised', 'Appraise that item first.')
      const stoneRow = await lockedItem(tx, character.id, stoneId)
      const stone = stoneOf(stoneRow.itemId)
      if (!stone) throw bad('not_stone', 'That is not an Enchanting Stone.')
      if (!stone.slots.includes(String(item(gear.itemId)?.EquipType)))
        throw bad('wrong_slot', 'That stone does not fit this item.')
      if ((config.UseLevel ?? 0) < stone.level)
        throw bad('too_low', `That stone needs gear of level ${stone.level} or higher.`)
      await pay(tx, character, 'gold', GEM_PLACEHOLDERS.enchantGold)
      await consumeOne(tx, stoneRow)
      await saveGear(tx, gear, {
        enchantItemId: stoneRow.itemId,
        bound: gear.bound || stoneRow.bound,
      })
      return respond(tx, character.id, gear.id)
    })
  })
}
