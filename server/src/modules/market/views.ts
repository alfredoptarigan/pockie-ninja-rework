// Market read views: browse, own listings (with the Sell tab's bag items) and the warehouse.
import { and, asc, count, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import {
  listingFee,
  MARKET_HOURS,
  MARKET_MAX_LISTINGS,
  MARKET_PAGE_SIZE,
  MARKET_WAREHOUSE_ROWS,
} from '../../../../game-core/src/economy/market.js'
import type {
  MarketBrowseView,
  MarketItem,
  MarketMineView,
  MarketWarehouseView,
} from '../../../../shared/src/schemas/market.js'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems, marketListings, marketWarehouse } from '../../db/schema.js'
import { sellability } from './market.js'

type Character = typeof characters.$inferSelect
type ItemRow = typeof inventoryItems.$inferSelect

const itemView = (row: ItemRow): MarketItem => ({
  inventoryId: row.id,
  itemId: row.itemId,
  count: row.count,
  bound: row.bound,
  enhanceLevel: row.enhanceLevel,
  identifyCount: row.identifyCount,
  props: row.props,
})

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

export interface BrowseQuery {
  category?: string | undefined
  itemIds?: string[] | undefined
  sort: 'time' | 'stone' | 'gold'
  order: 'asc' | 'desc'
  page: number
}

/** Live listings of a category subtree, optionally limited to item ids (the name search). */
export async function browse(
  db: Db,
  viewer: Character,
  query: BrowseQuery,
  now: Date,
): Promise<MarketBrowseView> {
  const where = and(
    gt(marketListings.expiresAt, now),
    query.category
      ? sql`(${marketListings.category} = ${query.category} or starts_with(${marketListings.category}, ${`${query.category}_`}))`
      : undefined,
    query.itemIds ? inArray(inventoryItems.itemId, query.itemIds) : undefined,
  )
  const column = {
    time: marketListings.expiresAt,
    stone: marketListings.priceStone,
    gold: marketListings.priceGold,
  }[query.sort]
  const direction = query.order === 'asc' ? asc : desc
  const orderBy: SQL[] = [
    sql`${column} is null`, // listings without that price go last
    direction(column),
    asc(marketListings.id),
  ]
  const [{ total }] = (await db
    .select({ total: count() })
    .from(marketListings)
    .innerJoin(inventoryItems, eq(inventoryItems.id, marketListings.inventoryItemId))
    .where(where)) as [{ total: number }]
  const rows = await listingQuery(db)
    .where(where)
    .orderBy(...orderBy)
    .limit(MARKET_PAGE_SIZE)
    .offset((query.page - 1) * MARKET_PAGE_SIZE)
  return {
    listings: rows.map(listingView(viewer.id)),
    page: query.page,
    pages: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)),
    total,
  }
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
