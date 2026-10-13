// Market actions (docs/original-data/trade-market.md). Each one runs in one transaction that locks
// characters by id ascending, then the listing, re-checks state under the locks and writes an
// audit row. The listed item stays an inventory_items row (location 'market'); a buy moves it, or a
// split of it, to the buyer's warehouse.
import { and, asc, count, eq, gt, inArray, lte, sql } from 'drizzle-orm'
import {
  claimableWallet,
  CURRENCY_CAP,
  listingFee,
  listingRefusal,
  MARKET_LEVEL,
  MARKET_MAX_LISTINGS,
  MARKET_WAREHOUSE_ROWS,
  priceRefusal,
  sellerPayout,
  type ListingRefusal,
} from '../../../../game-core/src/economy/market.js'
import { MARKET_MAIL } from '../../../../shared/src/schemas/market.js'
import type { Db } from '../../db/client.js'
import {
  characters,
  inventoryItems,
  marketAudit,
  marketListings,
  marketWarehouse,
} from '../../db/schema.js'
import { bagFits, requireBagRoom } from '../../game/bag.js'
import { item, marketCategoryKey } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { sendSystemMail } from '../../game/system-mail.js'
import { HttpError } from '../../http.js'

type Character = typeof characters.$inferSelect
type ItemRow = typeof inventoryItems.$inferSelect

/** How often the coordinator should run expireListings (queries already hide expired rows). */
export const MARKET_EXPIRY_INTERVAL_MS = 60_000
const EXPIRY_BATCH = 100
const HOUR_MS = 3_600_000

const bad = (code: string, message: string) => new HttpError(400, code, message)
const gone = () => new HttpError(404, 'listing_gone', 'That listing is no longer available.')
const noItem = () => new HttpError(404, 'no_item', 'You do not have that item.')

const REFUSALS: Record<ListingRefusal, string> = {
  not_tradable: 'That item cannot be traded.',
  bound: 'Bound items cannot be sold on the Market.',
  equipped: 'Take the item off before you sell it.',
  not_in_bag: 'Only items in your bag can be sold.',
  needs_properties: 'Equipment needs 2 to 4 identified properties to be sold.',
  no_category: 'That item cannot be sold on the Market.',
}

export function requireMarket(character: Pick<Character, 'level'>) {
  if (character.level < MARKET_LEVEL)
    throw new HttpError(403, 'market_level', `The Market opens at level ${MARKET_LEVEL}.`)
}

/** Why a bag row cannot be listed (null = it can), and its browse category. */
export function sellability(row: ItemRow) {
  const def = item(row.itemId)
  const category = marketCategoryKey(row.itemId, row.props.length)
  const refusal = listingRefusal({
    canTrade: Number(def?.CanTrade ?? 0),
    bound: row.bound,
    equipped: row.equippedSlot !== null,
    inBag: row.location === 'bag',
    category,
    equipment: def?.class === 'EquipItem',
    propCount: row.props.length,
  })
  return { refusal, category }
}

/** Locks the given characters in id order (the global lock order) and returns them by id. */
async function lockCharacters(tx: Tx, ids: string[]) {
  const rows = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, ids))
    .orderBy(asc(characters.id))
    .for('update')
  return new Map(rows.map((row) => [row.id, row]))
}

/** The item's instance state, for a row split off a stack. */
const instanceOf = (row: ItemRow) => ({
  itemId: row.itemId,
  bound: row.bound,
  enhanceLevel: row.enhanceLevel,
  inscribeLevel: row.inscribeLevel,
  durability: row.durability,
  canIdentify: row.canIdentify,
  identifyCount: row.identifyCount,
  identifyTimes: row.identifyTimes,
  props: row.props,
  engravedSlot: row.engravedSlot,
})

/** Takes `amount` off a stack into a new row of `ownerId` at `location`; returns the new row. */
async function splitOff(
  tx: Tx,
  row: ItemRow,
  amount: number,
  ownerId: string,
  location: 'market' | 'warehouse',
) {
  const taken = await tx
    .update(inventoryItems)
    .set({ count: row.count - amount })
    .where(and(eq(inventoryItems.id, row.id), eq(inventoryItems.count, row.count)))
    .returning({ id: inventoryItems.id })
  if (!taken.length) throw new HttpError(409, 'conflict', 'That item changed. Try again.')
  const [split] = await tx
    .insert(inventoryItems)
    .values({ ...instanceOf(row), characterId: ownerId, count: amount, location })
    .returning()
  return split!
}

async function warehouseRows(tx: Tx, ownerId: string) {
  const [row] = await tx
    .select({ rows: count() })
    .from(marketWarehouse)
    .where(eq(marketWarehouse.ownerId, ownerId))
  return row!.rows
}

/** Puts an item row into an owner's warehouse. */
async function store(tx: Tx, row: ItemRow, ownerId: string, source: 0 | 1, now: Date) {
  await tx
    .update(inventoryItems)
    .set({ characterId: ownerId, location: 'warehouse' })
    .where(eq(inventoryItems.id, row.id))
  await tx
    .insert(marketWarehouse)
    .values({ inventoryItemId: row.id, ownerId, source, createdAt: now })
}

export interface ListInput {
  inventoryId: string
  count: number
  priceStone: number | null
  priceGold: number | null
  hours: 8 | 12 | 24
}

/** MartSystem.OnCustomMartSale: `c` is the caller's locked character. */
export async function listItem(tx: Tx, c: Character, input: ListInput, now: Date) {
  requireMarket(c)
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.id, input.inventoryId),
        eq(inventoryItems.characterId, c.id),
        eq(inventoryItems.location, 'bag'),
      ),
    )
    .for('update')
  if (!row) throw noItem()
  const { refusal, category } = sellability(row)
  if (refusal) throw bad(refusal, REFUSALS[refusal])
  if (input.count > row.count) throw bad('invalid_count', 'You do not have that many.')
  if (priceRefusal(input.priceStone, input.priceGold))
    throw bad('invalid_price', 'Set a price from 1 to 1,000,000 in Stone or Gold.')
  const [{ active }] = (await tx
    .select({ active: count() })
    .from(marketListings)
    .where(and(eq(marketListings.sellerId, c.id), gt(marketListings.expiresAt, now)))) as [
    { active: number },
  ]
  if (active >= MARKET_MAX_LISTINGS)
    throw bad('too_many_listings', `You can have at most ${MARKET_MAX_LISTINGS} listings.`)
  const fee = listingFee(c.level, input.hours)
  if (c.stone < fee) throw bad('no_stone', `You need ${fee} Stone to pay the listing fee.`)

  await tx
    .update(characters)
    .set({ stone: c.stone - fee })
    .where(eq(characters.id, c.id))
  let listed = row
  if (input.count < row.count) listed = await splitOff(tx, row, input.count, c.id, 'market')
  else
    await tx.update(inventoryItems).set({ location: 'market' }).where(eq(inventoryItems.id, row.id))
  const [listing] = await tx
    .insert(marketListings)
    .values({
      sellerId: c.id,
      inventoryItemId: listed.id,
      category: category!,
      priceStone: input.priceStone,
      priceGold: input.priceGold,
      hours: input.hours,
      fee,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.hours * HOUR_MS),
    })
    .returning()
  await tx.insert(marketAudit).values({
    action: 'list',
    characterId: c.id,
    listingId: listing!.id,
    inventoryItemId: listed.id,
    itemId: row.itemId,
    count: input.count,
    fee,
  })
  return listing!
}

/**
 * OnMartCheckBuy + OnMartBuy in one transaction: the buyer pays every price the listing sets,
 * the seller's wallet gets each total minus the 10% tax, the item goes to the buyer's warehouse.
 * Returns the seller id so the caller can push a notice after commit.
 */
export async function buyListing(
  tx: Tx,
  buyerId: string,
  input: { listingId: string; count: number },
  now: Date,
) {
  const [peek] = await tx
    .select({ sellerId: marketListings.sellerId })
    .from(marketListings)
    .where(eq(marketListings.id, input.listingId))
  if (!peek) throw gone()
  if (peek.sellerId === buyerId) throw bad('own_listing', 'You cannot buy your own listing.')
  const locked = await lockCharacters(tx, [buyerId, peek.sellerId])
  const buyer = locked.get(buyerId)!
  const seller = locked.get(peek.sellerId)
  requireMarket(buyer)
  const [listing] = await tx
    .select()
    .from(marketListings)
    .where(
      and(
        eq(marketListings.id, input.listingId),
        eq(marketListings.sellerId, peek.sellerId),
        gt(marketListings.expiresAt, now),
      ),
    )
    .for('update')
  if (!listing || !seller) throw gone()
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, listing.inventoryItemId))
    .for('update')
  if (!row) throw gone()
  if (input.count > row.count) throw bad('invalid_count', `Only ${row.count} left in that listing.`)
  if ((await warehouseRows(tx, buyer.id)) >= MARKET_WAREHOUSE_ROWS)
    throw bad('warehouse_full', 'Your Market warehouse is full. Claim some items first.')
  const stone = (listing.priceStone ?? 0) * input.count
  const gold = (listing.priceGold ?? 0) * input.count
  if (buyer.stone < stone) throw bad('no_stone', 'You do not have enough Stone.')
  if (buyer.gold < gold) throw bad('no_gold', 'You do not have enough Gold.')
  const payout = { stone: sellerPayout(stone), gold: sellerPayout(gold) }

  await tx
    .update(characters)
    .set({ stone: buyer.stone - stone, gold: buyer.gold - gold })
    .where(eq(characters.id, buyer.id))
  await tx
    .update(characters)
    .set({
      marketStone: sql`${characters.marketStone} + ${payout.stone}`,
      marketGold: sql`${characters.marketGold} + ${payout.gold}`,
    })
    .where(eq(characters.id, seller.id))
  const left = row.count - input.count
  let bought = row
  if (left === 0) await tx.delete(marketListings).where(eq(marketListings.id, listing.id))
  else bought = await splitOff(tx, row, input.count, buyer.id, 'warehouse')
  await store(tx, bought, buyer.id, 0, now)
  await tx.insert(marketAudit).values({
    action: 'buy',
    characterId: buyer.id,
    counterpartyId: seller.id,
    listingId: listing.id,
    inventoryItemId: bought.id,
    itemId: row.itemId,
    count: input.count,
    stone,
    gold,
    taxStone: stone - payout.stone,
    taxGold: gold - payout.gold,
  })
  const sale = { itemId: row.itemId, count: input.count, ...payout }
  await sendSystemMail(
    tx,
    seller.id,
    'market',
    left ? MARKET_MAIL.sold : MARKET_MAIL.soldOut,
    left ? { buyer: buyer.name, ...sale, left } : { buyer: buyer.name, ...sale },
  )
  await sendSystemMail(tx, buyer.id, 'market', MARKET_MAIL.bought, {
    seller: seller.name,
    itemId: row.itemId,
    count: input.count,
    stone,
    gold,
  })
  return { sellerId: seller.id }
}

/** MART_DEPOT_SALE: takes an own listing (live or expired) down into the warehouse. */
export async function cancelListing(tx: Tx, c: Character, listingId: string) {
  requireMarket(c)
  const [listing] = await tx
    .select()
    .from(marketListings)
    .where(and(eq(marketListings.id, listingId), eq(marketListings.sellerId, c.id)))
    .for('update')
  if (!listing) throw gone()
  if ((await warehouseRows(tx, c.id)) >= MARKET_WAREHOUSE_ROWS)
    throw bad('warehouse_full', 'Your Market warehouse is full. Claim some items first.')
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, listing.inventoryItemId))
    .for('update')
  await tx.delete(marketListings).where(eq(marketListings.id, listing.id))
  await store(tx, row!, c.id, 1, new Date())
  await tx.insert(marketAudit).values({
    action: 'cancel',
    characterId: c.id,
    listingId: listing.id,
    inventoryItemId: row!.id,
    itemId: row!.itemId,
    count: row!.count,
  })
}

/**
 * MART_DEPOT_GET: moves one warehouse row (or every row that fits, oldest first) into the bag.
 * A row keeps its count and instance state and takes its own bag cells.
 */
export async function claimItems(tx: Tx, c: Character, inventoryId: string | undefined) {
  requireMarket(c)
  const rows = await tx
    .select()
    .from(marketWarehouse)
    .innerJoin(inventoryItems, eq(inventoryItems.id, marketWarehouse.inventoryItemId))
    .where(
      and(
        eq(marketWarehouse.ownerId, c.id),
        inventoryId ? eq(marketWarehouse.inventoryItemId, inventoryId) : undefined,
      ),
    )
    .orderBy(asc(marketWarehouse.createdAt))
    .for('update')
  if (inventoryId && !rows.length) throw noItem()
  if (!rows.length) throw bad('warehouse_empty', 'Your Market warehouse is empty.')
  let claimed = 0
  for (const { inventory_items: row } of rows) {
    const award = [{ itemId: row.itemId, bound: row.bound }]
    if (inventoryId) await requireBagRoom(tx, c.id, award, { separate: true })
    else if (!(await bagFits(tx, c.id, award, { separate: true }))) continue
    await tx.update(inventoryItems).set({ location: 'bag' }).where(eq(inventoryItems.id, row.id))
    await tx.delete(marketWarehouse).where(eq(marketWarehouse.inventoryItemId, row.id))
    await tx.insert(marketAudit).values({
      action: 'claim_item',
      characterId: c.id,
      inventoryItemId: row.id,
      itemId: row.itemId,
      count: row.count,
    })
    claimed++
  }
  if (!claimed) throw new HttpError(400, 'bag_full', 'Your bag is full.')
  return { claimed, left: rows.length - claimed }
}

/** MART_GAIN: moves the wallet to Stone and Gold, up to the currency cap (the rest stays). */
export async function claimWallet(tx: Tx, c: Character) {
  requireMarket(c)
  if (c.marketStone === 0 && c.marketGold === 0)
    throw bad('wallet_empty', 'Your Market wallet is empty.')
  const stone = claimableWallet(c.stone, c.marketStone)
  const gold = claimableWallet(c.gold, c.marketGold)
  if (stone === 0 && gold === 0)
    throw bad(
      'currency_cap',
      `You cannot hold more than ${CURRENCY_CAP.toLocaleString('en-US')} of a currency.`,
    )
  await tx
    .update(characters)
    .set({
      stone: c.stone + stone,
      gold: c.gold + gold,
      marketStone: c.marketStone - stone,
      marketGold: c.marketGold - gold,
    })
    .where(eq(characters.id, c.id))
  await tx.insert(marketAudit).values({ action: 'claim_wallet', characterId: c.id, stone, gold })
  return { stone, gold }
}

/**
 * Returns listings past their end to the seller's warehouse with a system mail (fixes M13).
 * Idempotent: each listing is re-checked under its locks, so overlapping runs and racing buys
 * settle it once. Returns can overfill the 15-row warehouse (the cap only blocks buys and
 * take-downs), so an item is never stuck. Handles up to EXPIRY_BATCH listings per call; the next
 * run takes the rest. Run every MARKET_EXPIRY_INTERVAL_MS.
 */
export async function expireListings(db: Db, now = new Date()) {
  const due = await db
    .select({ id: marketListings.id, sellerId: marketListings.sellerId })
    .from(marketListings)
    .where(lte(marketListings.expiresAt, now))
    .orderBy(asc(marketListings.expiresAt))
    .limit(EXPIRY_BATCH)
  let expired = 0
  for (const { id, sellerId } of due) {
    const done = await db.transaction(async (tx) => {
      await lockCharacters(tx, [sellerId])
      const [listing] = await tx
        .select()
        .from(marketListings)
        .where(and(eq(marketListings.id, id), lte(marketListings.expiresAt, now)))
        .for('update')
      if (!listing) return false
      const [row] = await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, listing.inventoryItemId))
        .for('update')
      await tx.delete(marketListings).where(eq(marketListings.id, id))
      await store(tx, row!, sellerId, 1, now)
      await tx.insert(marketAudit).values({
        action: 'expire',
        characterId: sellerId,
        listingId: id,
        inventoryItemId: row!.id,
        itemId: row!.itemId,
        count: row!.count,
      })
      await sendSystemMail(tx, sellerId, 'market', MARKET_MAIL.expired, {
        itemId: row!.itemId,
        count: row!.count,
      })
      return true
    })
    if (done) expired++
  }
  return expired
}
