// The blacksmith under /api/game/forge (docs/original-data/blacksmith.md): Appraise
// (IdentifySystem first roll), Refine (re-roll), Enhance (ConsolidateSystem), Inscription
// (InscribeSystem) and Repair (HardinessSystem). Like the original, none of them checks the scene.
// Every route locks the character row first, then checks and pays per currency.
import { bagItemsWhere, unequippedBagItemsWhere } from '../../game/bag.js'
import {
  canAppraise,
  canEnhance,
  canRefine,
  createRandom,
  inscribeRow,
  inscribeSealsUsed,
  isAppraised,
  repairCost,
  rollEnhance,
  rollIdentify,
  rollInscribe,
  appraiseCost,
  ARMOUR,
  WEAPON,
  type EquipConfig,
} from '@pockie/game-core'
import {
  appraiseAllSchema,
  forgeItemSchema,
  forgePaidSchema,
  inscribeSchema,
  type ForgeInfo,
  type ForgePayment,
} from '@pockie/shared'
import { randomInt } from 'node:crypto'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import {
  enhanceFailRates,
  equipConfig,
  equipTables,
  identifyList,
  identifyTables,
  item,
  itemNameKey,
  sealOdds,
} from '../../game/data.js'
import { playerFighter } from '../../game/combat.js'
import { durabilityOf, equipConfigOf, gearView, wornSetCounts } from '../../game/gear.js'
import { WING_SLOT } from '../../game/wings.js'
import { consumeOne, questCommand, removeItems, type Tx } from '../../game/progress.js'
import {
  REBORN_ENHANCE_COMMAND,
  REBORN_IDENTIFY_COMMAND,
  REBORN_INSCRIBE_COMMAND,
} from '../../game/quests.js'
import { HttpError } from '../../http.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

type ItemRow = typeof inventoryItems.$inferSelect
type CharacterRow = typeof characters.$inferSelect
type Money = 'stone' | 'gold' | 'giftCoupon'

/** FreeTimesItem talismans (FreeTimesType 1 Enhance, 3 Refine). */
const ENHANCE_TALISMAN = 'i161003'
const REFINE_TALISMAN = 'i161004'
const MONEY_NAMES: Record<Money, string> = {
  stone: 'Stone',
  gold: 'Gold',
  giftCoupon: 'Gift Coupons',
}

const bad = (code: string, message: string) => new HttpError(400, code, message)
const random = () => createRandom(randomInt(2 ** 31))

function requireMoney(character: CharacterRow, money: Money, cost: number) {
  if (character[money] < cost) throw bad('no_money', `You need ${cost} ${MONEY_NAMES[money]}.`)
}

async function pay(tx: Tx, character: CharacterRow, money: Money, cost: number) {
  requireMoney(character, money, cost)
  if (cost > 0) {
    await tx
      .update(characters)
      .set({ [money]: character[money] - cost })
      .where(eq(characters.id, character.id))
  }
}

async function ownedItem(tx: Tx | Db, characterId: string, id: string) {
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(and(bagItemsWhere(characterId), eq(inventoryItems.id, id)))
  if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
  return row
}

function equipmentOf(row: ItemRow, action: string): EquipConfig {
  const config = equipConfigOf(row.itemId)
  // Wings and auras are enhanced in the Wing panel (M6 decision 24); forge rules give them nothing.
  if (!config || item(row.itemId)?.EquipType === WING_SLOT)
    throw bad('wrong_item', `That item cannot be ${action}.`)
  return config
}

/** Unequipped stacks of an item in the bag. */
const bagRows = (tx: Tx | Db, characterId: string, itemId: string) =>
  tx
    .select()
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))

const countOf = (rows: ItemRow[]) => rows.reduce((sum, row) => sum + row.count, 0)

/**
 * Spends one talisman whose FreeEquipMin/MaxLevel covers the item, unbound stacks first (a bound
 * talisman binds the item). Returns whether the talisman was bound.
 */
async function spendTalisman(tx: Tx, characterId: string, talismanId: string, useLevel: number) {
  const def = item(talismanId)
  const inRange =
    useLevel >= Number(def?.FreeEquipMinLevel ?? 0) &&
    useLevel <= Number(def?.FreeEquipMaxLevel ?? Infinity)
  const rows = (await bagRows(tx, characterId, talismanId)).sort(
    (a, b) => Number(a.bound) - Number(b.bound),
  )
  const talisman = rows[0]
  if (!talisman || !inRange) {
    throw bad('no_talisman', 'You need a suitable talisman for that.')
  }
  await consumeOne(tx, talisman)
  return talisman.bound
}

/**
 * Pays an Enhance or Refine (mode 1 talisman, mode 2 Gold or Gift Coupon) and says whether the
 * item becomes bound: a bound talisman binds at once, Gift Coupons bind on success.
 */
async function payForge(
  tx: Tx,
  character: CharacterRow,
  payment: ForgePayment,
  cost: number,
  talismanId: string,
  useLevel: number,
) {
  if (payment === 'talisman') {
    const bound = await spendTalisman(tx, character.id, talismanId, useLevel)
    return { bindNow: bound, bindOnSuccess: false }
  }
  await pay(tx, character, payment, cost)
  return { bindNow: false, bindOnSuccess: payment === 'giftCoupon' }
}

export function itemView(row: ItemRow, worn: Readonly<Record<string, number>> = {}) {
  return {
    id: row.id,
    itemId: row.itemId,
    count: row.count,
    bound: row.bound,
    equippedSlot: row.equippedSlot,
    nameKey: itemNameKey(row.itemId),
    gear: gearView(row, worn),
  }
}

function forgeInfo(bag: ItemRow[]): ForgeInfo {
  const config = equipConfig()
  const seals = sealOdds()
  const levels = equipTables().inscribeLevels
  const owned = (itemId: string) => countOf(bag.filter((row) => row.itemId === itemId))
  return {
    enhanceCost: Number(config.ConsolidateCost),
    refineCost: Number(config.FlushIdentifyCost),
    enhanceRates: Object.fromEntries(
      Object.entries(enhanceFailRates()).map(([level, row]) => [level, 100 - row.FailRate]),
    ),
    inscribeLevels: Object.fromEntries(
      Object.entries(levels).map(([level, row]) => [
        level,
        {
          BaseOdds: row.BaseOdds,
          FailLevel: row.FailLevel,
          AddLevel: row.AddLevel,
          StoneCost: row.StoneCost,
        },
      ]),
    ),
    sealOdds: { low: seals.LowOdds, high: seals.HighOdds },
    talismans: {
      enhance: owned(ENHANCE_TALISMAN),
      refine: owned(REFINE_TALISMAN),
      lowSeal: owned(seals.LowSeal),
      highSeal: owned(seals.HighSeal),
    },
  }
}

/**
 * Rolls hidden properties. Items without an identify list roll nothing (the original then leaves
 * them unappraised forever and unwearable); we mark them appraised with no properties instead.
 */
function appraiseRoll(row: ItemRow) {
  const rolled = rollIdentify(row, identifyList(row.itemId), identifyTables(), random())
  return rolled ?? { props: [], identifyTimes: row.identifyTimes + 1 }
}

export async function forgeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const respond = async (tx: Tx, characterId: string, itemId?: string) => {
    const [row] = await tx.select().from(characters).where(eq(characters.id, characterId))
    const character = toCharacter(row!, await playerFighter(tx, row!))
    if (!itemId) return { character }
    const rows = await tx.select().from(inventoryItems).where(bagItemsWhere(characterId))
    const forged = rows.find((r) => r.id === itemId)
    if (!forged) throw new HttpError(404, 'no_item', 'You do not have that item.')
    return { character, item: itemView(forged, wornSetCounts(rows, row!.activeSet)) }
  }

  app.get('/forge', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const bag = await db.select().from(inventoryItems).where(unequippedBagItemsWhere(character.id))
    return forgeInfo(bag)
  })

  // Tooltip and forge state of every equipment row the character owns, keyed by row id.
  app.get('/forge/gear', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const rows = await db.select().from(inventoryItems).where(bagItemsWhere(character.id))
    const worn = wornSetCounts(rows, character.activeSet)
    return {
      gear: Object.fromEntries(
        rows.flatMap((row) => {
          const view = gearView(row, worn)
          return view ? [[row.id, view]] : []
        }),
      ),
    }
  })

  // IdentifySystem custom 120: the first roll, for Stone by the item's UseLevel.
  app.post('/forge/appraise', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId } = forgeItemSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, itemId)
      const config = equipmentOf(row, 'appraised')
      if (!canAppraise(row)) throw bad('cannot_appraise', 'That item has nothing to appraise.')
      await pay(tx, character, 'stone', appraiseCost(config.UseLevel ?? 0))
      await tx.update(inventoryItems).set(appraiseRoll(row)).where(eq(inventoryItems.id, row.id))
      await questCommand(tx, character, REBORN_IDENTIFY_COMMAND)
      return respond(tx, character.id, row.id)
    })
  })

  // Custom 128 ("Appraise all"): every appraisable item of the page, for the summed cost.
  app.post('/forge/appraise-all', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    // A repeated id is one item: appraise and charge it once.
    const itemIds = [...new Set(appraiseAllSchema.parse(request.body).itemIds)]
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const rows = await tx
        .select()
        .from(inventoryItems)
        .where(and(bagItemsWhere(character.id), inArray(inventoryItems.id, itemIds)))
      const targets = itemIds.flatMap((id) => {
        const row = rows.find((r) => r.id === id)
        const config = row && equipConfigOf(row.itemId)
        return row && config && canAppraise(row) ? [{ row, config }] : []
      })
      if (targets.length === 0) {
        throw bad('nothing_to_appraise', 'Nothing on this page needs appraising.')
      }
      const total = targets.reduce((sum, { config }) => sum + appraiseCost(config.UseLevel ?? 0), 0)
      await pay(tx, character, 'stone', total)
      for (const { row } of targets) {
        await tx.update(inventoryItems).set(appraiseRoll(row)).where(eq(inventoryItems.id, row.id))
      }
      await questCommand(tx, character, REBORN_IDENTIFY_COMMAND)
      return { ...(await respond(tx, character.id)), appraised: targets.map(({ row }) => row.id) }
    })
  })

  // IdentifySystem custom 134: re-roll the properties of appraised gear.
  app.post('/forge/refine', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, payment } = forgePaidSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, itemId)
      const config = equipmentOf(row, 'refined')
      if (!isAppraised(row)) throw bad('unappraised', 'Appraise that item first.')
      const list = identifyList(row.itemId)
      if (!canRefine(row) || !list) throw bad('no_props', 'That item has no properties to refine.')
      const cost = Number(equipConfig().FlushIdentifyCost)
      const binding = await payForge(
        tx,
        character,
        payment,
        cost,
        REFINE_TALISMAN,
        config.UseLevel ?? 0,
      )
      const rolled = rollIdentify(row, list, identifyTables(), random())!
      await tx
        .update(inventoryItems)
        .set({ ...rolled, bound: row.bound || binding.bindNow || binding.bindOnSuccess })
        .where(eq(inventoryItems.id, row.id))
      return respond(tx, character.id, row.id)
    })
  })

  // ConsolidateSystem custom 133: one attempt at the next level; a failure keeps the level.
  app.post('/forge/enhance', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, payment } = forgePaidSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, itemId)
      const config = equipmentOf(row, 'enhanced')
      const baseType = config.EquipBaseType ?? 0
      if ((baseType !== WEAPON && baseType !== ARMOUR) || !config.ConsolidateMaxLevel) {
        throw bad('wrong_item', 'That item cannot be enhanced.')
      }
      if (!isAppraised(row)) throw bad('unappraised', 'Appraise that item first.')
      const failRates = enhanceFailRates()
      if (!canEnhance(config, row, failRates)) {
        throw bad('max_level', 'That item cannot be enhanced any further.')
      }
      const cost = Number(equipConfig().ConsolidateCost)
      const binding = await payForge(
        tx,
        character,
        payment,
        cost,
        ENHANCE_TALISMAN,
        config.UseLevel ?? 0,
      )
      const result = rollEnhance(row.enhanceLevel, failRates, random())
      await tx
        .update(inventoryItems)
        .set({
          enhanceLevel: result.level,
          bound: row.bound || binding.bindNow || (result.success && binding.bindOnSuccess),
        })
        .where(eq(inventoryItems.id, row.id))
      // The Reborn quest asks for a successful enhance.
      if (result.success) await questCommand(tx, character, REBORN_ENHANCE_COMMAND)
      return { success: result.success, ...(await respond(tx, character.id, row.id)) }
    })
  })

  // InscribeSystem custom 681: seals raise the odds; a failure drops to the row's FailLevel.
  app.post('/forge/inscribe', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, seal, seals } = inscribeSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, itemId)
      equipmentOf(row, 'inscribed')
      const levelRow = inscribeRow(equipTables().inscribeLevels, row.inscribeLevel)
      if (!levelRow) throw bad('max_level', 'That item cannot be inscribed any further.')
      const odds = sealOdds()
      const sealId = seal === 'low' ? odds.LowSeal : odds.HighSeal
      const owned = countOf(await bagRows(tx, character.id, sealId))
      if (owned === 0) {
        throw bad('no_seals', `You need a ${seal === 'low' ? 'Low' : 'High'} Seal for that.`)
      }
      requireMoney(character, 'stone', levelRow.StoneCost)
      const used = inscribeSealsUsed(levelRow, odds, seal, seals, owned)
      await removeItems(tx, character.id, sealId, used)
      await pay(tx, character, 'stone', levelRow.StoneCost)
      const result = rollInscribe(levelRow, odds, seal, used, random())
      await tx
        .update(inventoryItems)
        .set({ inscribeLevel: result.level })
        .where(eq(inventoryItems.id, row.id))
      if (result.success) await questCommand(tx, character, REBORN_INSCRIBE_COMMAND)
      return {
        success: result.success,
        sealsUsed: used,
        ...(await respond(tx, character.id, row.id)),
      }
    })
  })

  // HardinessSystem custom 124: one item, bag or worn.
  app.post('/forge/repair', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId } = forgeItemSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const row = await ownedItem(tx, character.id, itemId)
      const config = equipmentOf(row, 'repaired')
      const cost = repairCost(config, durabilityOf(row, config))
      if (cost === 0) throw bad('not_damaged', 'That item does not need repairing.')
      await pay(tx, character, 'stone', cost)
      await tx
        .update(inventoryItems)
        .set({ durability: config.MaxHardiness ?? 0 })
        .where(eq(inventoryItems.id, row.id))
      return respond(tx, character.id, row.id)
    })
  })

  // Custom 125 ("Repair all"): every damaged equipped item.
  app.post('/forge/repair-all', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const worn = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.characterId, character.id), isNotNull(inventoryItems.equippedSlot)),
        )
      const damaged = worn.flatMap((row) => {
        const config = equipConfigOf(row.itemId)
        const cost = config ? repairCost(config, durabilityOf(row, config)) : 0
        return config && cost > 0 ? [{ row, config, cost }] : []
      })
      if (damaged.length === 0) throw bad('not_damaged', 'Nothing you wear needs repairing.')
      await pay(
        tx,
        character,
        'stone',
        damaged.reduce((sum, { cost }) => sum + cost, 0),
      )
      for (const { row, config } of damaged) {
        await tx
          .update(inventoryItems)
          .set({ durability: config.MaxHardiness ?? 0 })
          .where(eq(inventoryItems.id, row.id))
      }
      return respond(tx, character.id)
    })
  })
}
