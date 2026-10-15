// Market read views: the board, own listings (with the Sell tab's bag items), the warehouse and the
// sales (Recent and History tabs, read from the audit trail).
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import {
  listingFee,
  MARKET_HOURS,
  MARKET_MAX_LISTINGS,
  MARKET_WAREHOUSE_ROWS,
} from '../../../../game-core/src/economy/market.js'
import type {
  MarketBoardView,
  MarketHistoryView,
  MarketItem,
  MarketMineView,
  MarketRecentView,
  MarketSale,
  MarketWarehouseView,
} from '../../../../shared/src/schemas/market.js'
import type { Db } from '../../db/client.js'
import {
  characters,
  inventoryItems,
  marketAudit,
  marketListings,
  marketWarehouse,
} from '../../db/schema.js'
import { itemInfo } from '../../game/bag.js'
import { gearView } from '../../game/gear.js'
import { sellability } from './market.js'

type Character = typeof characters.$inferSelect
type ItemRow = typeof inventoryItems.$inferSelect

const itemView = (row: ItemRow): MarketItem => {
  const gear = gearView(row)
  return {
    inventoryId: row.id,
    itemId: row.itemId,
    count: row.count,
    bound: row.bound,
    enhanceLevel: row.enhanceLevel,
    identifyCount: row.identifyCount,
    props: row.props,
    info: itemInfo(row.itemId),
    ...(gear && { gear }),
  }
}

/**
 * The board loads every live listing at once, as Reborn's Market tab does.
 * ponytail: one capped read; page or filter on the server when the Market outgrows it.
 */
export const MARKET_BOARD_LIMIT = 1000
/** Reborn's Recent tab: "Last 50 Sales". History keeps the same depth per side. */
export const MARKET_RECENT_SALES = 50

const listingQuery = (db: Db) =>
  db
    .select({ listing: marketListings, item: inventoryItems, sellerName: characters.name })
    .from(marketListings)
    .innerJoin(inventoryItems, eq(inventoryItems.id, marketListings.inventoryItemId))
    .innerJoin(characters, eq(characters.id, marketListings.sellerId))

type ListingRow = Awaited<ReturnType<ReturnType<typeof listingQuery>['execute']>>[number]

const listingView = (viewerId: string) => (row: ListingRow) => ({
  ...itemView(row.item),
  id: row.listing.id,
  sellerName: row.sellerName,
  priceStone: row.listing.priceStone,
  priceGold: row.listing.priceGold,
  expiresAt: row.listing.expiresAt.toISOString(),
  mine: row.listing.sellerId === viewerId,
})

/** Every live listing, soonest to end first. */
export async function board(db: Db, viewer: Character, now: Date): Promise<MarketBoardView> {
  const rows = await listingQuery(db)
    .where(gt(marketListings.expiresAt, now))
    .orderBy(asc(marketListings.expiresAt), asc(marketListings.id))
    .limit(MARKET_BOARD_LIMIT)
  return { listings: rows.map(listingView(viewer.id)) }
}

type AuditRow = typeof marketAudit.$inferSelect

const saleView = (row: AuditRow): MarketSale => ({
  id: row.id,
  itemId: row.itemId!,
  count: row.count!,
  stone: row.stone,
  gold: row.gold,
  taxStone: row.taxStone,
  taxGold: row.taxGold,
  at: row.createdAt.toISOString(),
  info: itemInfo(row.itemId!),
})

/** Buys from the audit trail, newest first. */
const sales = (db: Db, where?: ReturnType<typeof eq>) =>
  db
    .select()
    .from(marketAudit)
    .where(and(eq(marketAudit.action, 'buy'), where))
    .orderBy(desc(marketAudit.createdAt), desc(marketAudit.id))
    .limit(MARKET_RECENT_SALES)

/**
 * The last sales on the whole Market.
 * ponytail: no index on market_audit (action, created_at), so this scans the audit trail; add a
 * partial index on created_at where action = 'buy' once the trail is large.
 */
export async function recentSales(db: Db): Promise<MarketRecentView> {
  return { sales: (await sales(db)).map(saleView) }
}

/** The caller's sales (they were the seller) and purchases. */
export async function history(db: Db, c: Character): Promise<MarketHistoryView> {
  const [sold, bought] = await Promise.all([
    sales(db, eq(marketAudit.counterpartyId, c.id)),
    sales(db, eq(marketAudit.characterId, c.id)),
  ])
  return { sales: sold.map(saleView), purchases: bought.map(saleView) }
}

/** Own listings (live and expired-but-not-swept), fees and the bag items that can be listed. */
export async function mine(db: Db, c: Character, now: Date): Promise<MarketMineView> {
  const rows = await listingQuery(db)
    .where(eq(marketListings.sellerId, c.id))
    .orderBy(asc(marketListings.createdAt))
  const bag = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.characterId, c.id),
        eq(inventoryItems.location, 'bag'),
        isNull(inventoryItems.equippedSlot),
      ),
    )
    .orderBy(asc(inventoryItems.createdAt))
  const fee = (hours: number) => listingFee(c.level, hours)
  return {
    listings: rows.map((row) => ({
      ...listingView(c.id)(row),
      hours: row.listing.hours,
      fee: row.listing.fee,
      expired: row.listing.expiresAt <= now,
    })),
    maxListings: MARKET_MAX_LISTINGS,
    fees: { '8': fee(MARKET_HOURS[0]), '12': fee(MARKET_HOURS[1]), '24': fee(MARKET_HOURS[2]) },
    sellable: bag.flatMap((row) => {
      const { refusal, category } = sellability(row)
      return refusal ? [] : [{ ...itemView(row), category: category! }]
    }),
  }
}

export async function warehouseView(db: Db, c: Character): Promise<MarketWarehouseView> {
  const rows = await db
    .select()
    .from(marketWarehouse)
    .innerJoin(inventoryItems, eq(inventoryItems.id, marketWarehouse.inventoryItemId))
    .where(eq(marketWarehouse.ownerId, c.id))
    .orderBy(asc(marketWarehouse.createdAt))
  return {
    items: rows.map((row) => ({
      ...itemView(row.inventory_items),
      source: row.market_warehouse.source as 0 | 1,
      createdAt: row.market_warehouse.createdAt.toISOString(),
    })),
    capacity: MARKET_WAREHOUSE_ROWS,
    wallet: { stone: c.marketStone, gold: c.marketGold },
  }
}
