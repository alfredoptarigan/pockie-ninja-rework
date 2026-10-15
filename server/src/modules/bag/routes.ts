// Reborn bag actions (Inventory window): move, swap, lock, split, use multiple, Multi Sell and
// Sort Inventory. Every action returns the character and the whole inventory list.
import {
  activeSetSchema,
  bagMoveSchema,
  FIRST_VIP_SET,
  bagSellSchema,
  bagSortSchema,
  bagSplitSchema,
  bagSwapSchema,
  itemActionParamsSchema,
  useMultipleSchema,
} from '@pockie/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import {
  bagFits,
  bagItemsWhere,
  inventoryView,
  itemInfo,
  placeAt,
  placeBag,
  rectsOf,
  setSpot,
  spotOf,
  unequippedBagRows,
} from '../../game/bag.js'
import {
  USABLE_PAGES,
  firstFit,
  firstFitAnywhere,
  fits,
  footprint,
  occupancy,
} from '../../game/bag-grid.js'
import type { Tx } from '../../game/progress.js'
import { canSell, sellRows } from '../../game/sell.js'
import { syncOutfit } from '../../game/outfit.js'
import { isVip } from '../../game/vip.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { reloadCharacter, ownedItem, useItem } from '../game/actions.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

type Character = typeof characters.$inferSelect
type ItemRow = typeof inventoryItems.$inferSelect

const bad = (code: string, message: string) => new HttpError(400, code, message)
const changed = () => new HttpError(409, 'conflict', 'That item changed. Try again.')
// Sort Inventory: equipment by slot (the Reborn equip slot order), then level, then item id.
const SLOT_ORDER = ['Weapon', 'Glove', 'Ring', 'Amulet', 'Hat', 'Cloth', 'Girdle', 'Shoes', 'Wing']

async function unequippedItem(tx: Tx, characterId: string, id: string) {
  const row = await ownedItem(tx, characterId, id)
  if (row.equippedSlot) throw bad('equipped', 'Take the item off first.')
  return row
}

function sortKey(row: ItemRow): [number, number, number, string] {
  const info = itemInfo(row.itemId)
  if (info.kind !== 'equip') return [1, 0, 0, row.itemId]
  const rank = SLOT_ORDER.indexOf(info.equipSlot ?? '')
  return [0, rank < 0 ? SLOT_ORDER.length : rank, info.level, row.itemId]
}
function bySortKey(a: ItemRow, b: ItemRow) {
  const [x, y] = [sortKey(a), sortKey(b)]
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1
  return 0
}

/** Merges stacks of the same item, binding and lock up to the stack size; returns the rows left. */
async function mergeStacks(tx: Tx, rows: ItemRow[]) {
  const groups = new Map<string, ItemRow[]>()
  for (const row of rows) {
    const key = `${row.itemId}|${row.bound}|${row.locked}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const left: ItemRow[] = []
  for (const group of groups.values()) {
    const stack = itemInfo(group[0]!.itemId).stack
    let total = group.reduce((sum, row) => sum + row.count, 0)
    for (const [index, row] of group.entries()) {
      // The last row keeps any excess, so an over-full stack never loses items.
      const count = index === group.length - 1 ? total : Math.min(stack, total)
      total -= count
      if (count === row.count) left.push(row)
      else if (count > 0) {
        await tx.update(inventoryItems).set({ count }).where(eq(inventoryItems.id, row.id))
        left.push({ ...row, count })
      } else await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
    }
  }
  return left
}

export async function bagRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Runs a bag action under the character lock with the bag placed; adds character and items. */
  const act = (request: FastifyRequest, fn: (tx: Tx, c: Character) => Promise<object>) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const c = await lockCharacter(tx, userId)
      await placeBag(tx, c.id)
      const extra = await fn(tx, c)
      const character = await reloadCharacter(tx, c.id)
      return { ...extra, character, ...(await inventoryView(tx, character)) }
    })
  }
  const itemId = (request: FastifyRequest) => itemActionParamsSchema.parse(request.params).id

  // Reborn's equipment-set bar (setActiveLoadout): wears set I-V, a no-op for the worn one. Rows of
  // the other sets stay where they are; IV and V need VIP.
  app.post('/sets/active', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const { set } = activeSetSchema.parse(request.body)
    return act(request, async (tx, c) => {
      if (set === c.activeSet) return {}
      if (set >= FIRST_VIP_SET && !isVip(c))
        throw bad('vip_required', 'VIP required for equipment sets')
      await tx.update(characters).set({ activeSet: set }).where(eq(characters.id, c.id))
      await syncOutfit(tx, c.id, set)
      await refreshArenaSnapshot(tx, c.id)
      return {}
    })
  })

  app.post('/items/:id/move', { config: { rateLimit: RATE_LIMITS.bagMove } }, (request) => {
    const id = itemId(request)
    const spot = bagMoveSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const row = await unequippedItem(tx, c.id, id)
      if (spot.page >= USABLE_PAGES || !(await placeAt(tx, c.id, row, spot)))
        throw bad('no_room', 'There is no room there.')
      return {}
    })
  })

  // Each item takes the other's top-left tile; equal footprints always fit.
  app.post('/items/:id/swap', { config: { rateLimit: RATE_LIMITS.bagMove } }, (request) => {
    const id = itemId(request)
    const { targetId } = bagSwapSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const a = await unequippedItem(tx, c.id, id)
      const b = await unequippedItem(tx, c.id, targetId)
      const [aSpot, bSpot] = [spotOf(a), spotOf(b)]
      const invalid = bad('invalid_swap', 'Invalid Swap')
      if (a.id === b.id || !aSpot || !bSpot) throw invalid
      const others = rectsOf(await unequippedBagRows(tx, c.id, [a.id, b.id]))
      const aRect = { ...bSpot, ...footprint(a.itemId) }
      const bRect = { ...aSpot, ...footprint(b.itemId) }
      if (
        !fits(occupancy(others, aRect.page), aRect.slot, aRect) ||
        !fits(occupancy([...others, aRect], bRect.page), bRect.slot, bRect)
      )
        throw invalid
      await setSpot(tx, a.id, bSpot)
      await setSpot(tx, b.id, aSpot)
      return {}
    })
  })

  app.post('/items/:id/lock', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const id = itemId(request)
    return act(request, async (tx, c) => {
      const row = await ownedItem(tx, c.id, id)
      await tx
        .update(inventoryItems)
        .set({ locked: !row.locked })
        .where(eq(inventoryItems.id, row.id))
      return { locked: !row.locked }
    })
  })

  app.post('/items/:id/split', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const id = itemId(request)
    const { count } = bagSplitSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const row = await unequippedItem(tx, c.id, id)
      if (count >= row.count)
        throw bad('invalid_count', 'Split off fewer items than the stack holds.')
      const spot = firstFit(rectsOf(await unequippedBagRows(tx, c.id)), footprint(row.itemId))
      const room = await bagFits(tx, c.id, [{ itemId: row.itemId, bound: row.bound }], {
        separate: true,
      })
      if (!spot || !room) throw bad('bag_full', 'Inventory is full! Please make some space first.')
      const taken = await tx
        .update(inventoryItems)
        .set({ count: row.count - count })
        .where(and(eq(inventoryItems.id, row.id), eq(inventoryItems.count, row.count)))
        .returning({ id: inventoryItems.id })
      if (!taken.length) throw changed()
      const { id: _id, createdAt: _createdAt, ...instance } = row
      await tx
        .insert(inventoryItems)
        .values({ ...instance, count, bagPage: spot.page, bagSlot: spot.slot })
      return {}
    })
  })

  // Uses the item up to `amount` times; a refused first use fails the request, later ones only
  // stop it (each later use runs in a savepoint, so a refused one leaves no trace).
  app.post('/items/:id/use-multiple', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const id = itemId(request)
    const { amount } = useMultipleSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const first = await useItem(tx, c, await ownedItem(tx, c.id, id))
      const completed = [...first.completed]
      const rewards = [...first.rewards]
      const cards = 'card' in first && first.card ? [first.card] : []
      let used = 1
      while (used < amount) {
        const [row] = await tx
          .select()
          .from(inventoryItems)
          .where(and(bagItemsWhere(c.id), eq(inventoryItems.id, id)))
        if (!row) break
        const [fresh] = await tx.select().from(characters).where(eq(characters.id, c.id))
        try {
          const next = await tx.transaction((savepoint) => useItem(savepoint, fresh!, row))
          completed.push(...next.completed)
          rewards.push(...next.rewards)
          if ('card' in next && next.card) cards.push(next.card)
        } catch (error) {
          if (error instanceof HttpError) break
          throw error
        }
        used++
      }
      const levelsGained = rewards.reduce((sum, handIn) => sum + handIn.levelsGained, 0)
      return { used, completed, rewards, levelsGained, ...(cards.length && { cards }) }
    })
  })

  // Multi Sell: whole stacks, anywhere; one unsellable item refuses the whole request.
  app.post('/items/sell', { config: { rateLimit: RATE_LIMITS.bagSell } }, (request) => {
    const { inventoryIds } = bagSellSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const rows = await tx
        .select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.characterId, c.id), inArray(inventoryItems.id, inventoryIds)))
      if (rows.length !== inventoryIds.length || !rows.every(canSell))
        throw bad('cannot_sell', 'Some of those items cannot be sold.')
      const earned = await sellRows(
        tx,
        c.id,
        rows.map((row) => ({ row, count: row.count })),
      )
      return { earned }
    })
  })

  // Sort Inventory: optionally merges stacks, then re-places the tab (or every tab) first-fit.
  app.post('/items/sort', { config: { rateLimit: RATE_LIMITS.bagSort } }, (request) => {
    const { scope, page, stack } = bagSortSchema.parse(request.body)
    return act(request, async (tx, c) => {
      const rows = await unequippedBagRows(tx, c.id)
      const inScope = (row: ItemRow) => scope === 'all' || row.bagPage === page
      const affected = rows.filter(inScope)
      const sorted = (stack ? await mergeStacks(tx, affected) : affected).sort(bySortKey)
      const placed = rectsOf(rows.filter((row) => !inScope(row)))
      for (const row of sorted) {
        const size = footprint(row.itemId)
        const spot =
          (page !== undefined && scope === 'tab' ? firstFit(placed, size, page, page + 1) : null) ??
          firstFitAnywhere(placed, size)
        if (spot) placed.push({ ...spot, ...size })
        await setSpot(tx, row.id, spot)
      }
      return {}
    })
  })
}
