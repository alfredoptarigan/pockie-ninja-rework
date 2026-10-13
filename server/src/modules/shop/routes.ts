import { requireBagRoom, unequippedBagItemsWhere } from '../../game/bag.js'
import { randomInt } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  shopOpenSchema,
  merchantOpenSchema,
  wholesaleBuySchema,
  shopRefreshSchema,
  shopBuySchema,
  shopBuyAllSchema,
  shopSellSchema,
  shopSellAllSchema,
  shopPouchRefillSchema,
  merchantBuySchema,
} from '@pockie/shared'
import { createRandom, rollIdentify } from '@pockie/game-core'
import {
  drawRefreshStock,
  findLevelBand,
  parsePrices,
  pricesFromCosts,
  restockDue,
  utcDay,
  pouchRefill,
  merchantSpawn,
  merchantPrice,
} from '../../../../game-core/src/economy/shops.js'
import type { Db } from '../../db/client.js'
import {
  characters,
  inventoryItems,
  characterShops,
  characterShopStock,
  mysticSpawns,
  mysticItemSales,
  characterMysticPurchases,
} from '../../db/schema.js'
import { item, itemNameKey, sceneSpawns, task } from '../../game/data.js'
import {
  grantItems,
  consumeOne,
  loadQuests,
  saveQuests,
  rookieHandIns,
  type Tx,
} from '../../game/progress.js'
import { recordCommand } from '../../game/quests.js'
import { shopGearState } from '../../game/gear.js'
import { isVip } from '../../game/vip.js'
import { HttpError } from '../../http.js'
import { lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { npcMenu } from '../game/field-data.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { wholesale, refresh, sellAsk, identifyLists, identifyTables, mystic } from './data.js'

type Character = typeof characters.$inferSelect
const bad = (code: string, message: string) => new HttpError(400, code, message)
const now = () => new Date(Date.now())
const random = () => createRandom(randomInt(2 ** 31))
const stockWhere = (id: string, type: number) =>
  and(eq(characterShopStock.characterId, id), eq(characterShopStock.shopType, type))
const poolOf = (level: number, type: number) =>
  findLevelBand(refresh.pools, level, (row) => row.Type === type)!
const money = (costs: { stone: number; gold: number; coupons: number }) => ({
  stone: costs.stone,
  gold: costs.gold,
  giftCoupon: costs.coupons,
})
async function charge(
  tx: Tx,
  c: Character,
  costs: Partial<Record<'stone' | 'gold' | 'giftCoupon', number>>,
) {
  for (const currency of ['stone', 'gold', 'giftCoupon'] as const) {
    if (c[currency] < (costs[currency] ?? 0))
      throw bad(
        `no_${currency}`,
        `You do not have enough ${currency === 'giftCoupon' ? 'Gift Coupons' : currency === 'gold' ? 'Gold' : 'Stone'}.`,
      )
  }
  await tx
    .update(characters)
    .set({
      stone: c.stone - (costs.stone ?? 0),
      gold: c.gold - (costs.gold ?? 0),
      giftCoupon: c.giftCoupon - (costs.giftCoupon ?? 0),
    })
    .where(eq(characters.id, c.id))
}
async function command(tx: Tx, c: Character, code: number) {
  await saveQuests(tx, c.id, recordCommand(await loadQuests(tx, c.id), code, c.sceneId))
}
async function result(tx: Tx, c: Character) {
  const rewards = await rookieHandIns(tx, c.id)
  const [updated] = await tx.select().from(characters).where(eq(characters.id, c.id))
  return { ...rewards, character: toCharacter(updated!) }
}
async function restock(tx: Tx, c: Character, type: 1 | 2 | 3, at: Date) {
  const [poolId, pool] = poolOf(c.level, type)
  const quests = await loadQuests(tx, c.id)
  const tutorialComplete = quests.some(
    (q) =>
      q.state === 2 &&
      Number(task(q.taskId)?.TaskBaseType) === 4 &&
      Number(task(q.taskId)?.NextTaskID) < 90000,
  )
  const rng = random()
  const stock = drawRefreshStock(
    refresh.items[poolId]!,
    pool.RandCount,
    type,
    tutorialComplete,
    rng,
    (id) => {
      const def = item(id)
      return def ? { equipment: def.class === 'EquipItem', maxIdentifyCount: 4 } : undefined
    },
  )
  await tx.delete(characterShopStock).where(stockWhere(c.id, type))
  for (const row of stock) {
    const rolled = row.appraised
      ? rollIdentify(
          { identifyCount: row.identifyCount, identifyTimes: 0, props: [], engravedSlot: null },
          identifyLists[row.item],
          identifyTables,
          rng,
        )
      : null
    const gear = shopGearState(row.item, row.identifyCount, row.appraised, rolled?.props ?? [])
    const offer = refresh.items[poolId]!.find((offer) => offer.item === row.item)!
    const has = (type: number) => offer.costs.some((cost) => cost.type === type)
    await tx.insert(characterShopStock).values({
      characterId: c.id,
      shopType: type,
      slot: row.slot,
      itemId: row.item,
      priceStone: has(0) ? row.prices.stone : null,
      priceGold: has(2) ? row.prices.gold : null,
      priceGiftCoupon: has(3) ? row.prices.coupons : null,
      identifyCount: gear.identifyCount,
      appraised: !gear.canIdentify || gear.identifyTimes > 0,
      props: gear.props,
      bound: row.bound,
    })
  }
  await tx
    .insert(characterShops)
    .values({ characterId: c.id, shopType: type, lastRefreshAt: at })
    .onConflictDoUpdate({
      target: [characterShops.characterId, characterShops.shopType],
      set: { lastRefreshAt: at },
    })
}
const canSell = (row: typeof inventoryItems.$inferSelect) =>
  row.location === 'bag' && !row.equippedSlot && (Number(item(row.itemId)?.CanTrade ?? 0) & 1) !== 0
async function sell(tx: Tx, c: Character, ids: string[], amount?: number) {
  const bag = await tx.select().from(inventoryItems).where(unequippedBagItemsWhere(c.id))
  let earned = 0
  for (const id of ids) {
    const row = bag.find((r) => r.id === id)
    if (!row || !canSell(row)) {
      if (amount !== undefined) throw bad('cannot_sell', 'That item cannot be sold.')
      continue
    }
    const count = amount ?? row.count
    if (count > row.count) throw bad('invalid_count', 'You do not have that many items.')
    earned += Number(item(row.itemId)?.Price ?? 0) * count
    for (let n = 0; n < count; n++) {
      await consumeOne(tx, { ...row, count: row.count - n })
    }
  }
  await tx
    .update(characters)
    .set({ stone: c.stone + earned })
    .where(eq(characters.id, c.id))
  return { ...(await result(tx, c)), earned }
}
async function openView(tx: Tx, c: Character) {
  const at = now()
  const tabs = []
  for (const type of [1, 3, 2] as const) {
    const [, pool] = poolOf(c.level, type)
    let [state] = await tx
      .select()
      .from(characterShops)
      .where(and(eq(characterShops.characterId, c.id), eq(characterShops.shopType, type)))
    if (restockDue(state?.lastRefreshAt ?? null, at, pool.RefreshTime, 'open')) {
      await restock(tx, c, type, at)
      ;[state] = await tx
        .select()
        .from(characterShops)
        .where(and(eq(characterShops.characterId, c.id), eq(characterShops.shopType, type)))
    }
    const stock = await tx
      .select()
      .from(characterShopStock)
      .where(stockWhere(c.id, type))
      .orderBy(characterShopStock.slot)
    tabs.push({
      shopType: type,
      stock,
      refreshAt: new Date(state!.lastRefreshAt!.getTime() + pool.RefreshTime * 1000).toISOString(),
      freeRestocks: state!.freeRestockDay === utcDay(at) ? 0 : pool.GratisCount,
      restockCosts: Object.fromEntries(
        Object.entries(money(parsePrices(pool.ImidRequireMoney))).filter(([, value]) => value > 0),
      ),
    })
  }
  const [boxId, box] = findLevelBand(wholesale.boxes, c.level)!
  const stock = wholesale.items[box.BoxName]!.map((row) => ({
    itemId: row.item,
    priceStone: pricesFromCosts(row.costs).stone,
    maxStack: Number(item(row.item)?.ItemMaxFoldNum ?? 1),
  }))
  const bag = await tx.select().from(inventoryItems).where(unequippedBagItemsWhere(c.id))
  const sellable = bag.filter(canSell).map((row) => {
    const def = item(row.itemId)!
    return {
      inventoryId: row.id,
      itemId: row.itemId,
      nameKey: itemNameKey(row.itemId),
      count: row.count,
      price: Number(def.Price ?? 0),
      confirm:
        sellAsk.some((a) => a.ID === row.itemId) ||
        Number(def.SuitID ?? 0) > 0 ||
        row.identifyCount >= 3 ||
        (row.canIdentify && !row.identifyTimes) ||
        ['PetItem', 'FoodItem', 'AvatarItem', 'JewelItem'].includes(String(def.class)),
    }
  })
  return { tabs, wholesale: { boxId: Number(boxId), stock }, sellable }
}
export async function shopRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const locked = (request: FastifyRequest, fn: (tx: Tx, c: Character) => Promise<unknown>) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => fn(tx, await lockCharacter(tx, userId)))
  }
  // The original only gates the window on the client; the server needs a shop NPC in the scene.
  const atShop = (request: FastifyRequest, fn: (tx: Tx, c: Character) => Promise<unknown>) =>
    locked(request, async (tx, c) => {
      if (!sceneSpawns(c.sceneId).some((spawn) => npcMenu(spawn.id) === 'shop'))
        throw bad('not_here', 'Visit a shop in a village first.')
      return fn(tx, c)
    })
  app.get('/open', { config: { rateLimit: RATE_LIMITS.shopOpen } }, (request) =>
    atShop(request, async (tx, c) => {
      const { tab } = shopOpenSchema.parse(request.query)
      if (tab === 2) {
        await command(tx, c, 2109)
        return { ...(await openView(tx, c)), ...(await result(tx, c)) }
      }
      return openView(tx, c)
    }),
  )
  app.post('/wholesale/buy', { config: { rateLimit: RATE_LIMITS.shopWholesale } }, (request) =>
    atShop(request, async (tx, c) => {
      const input = wholesaleBuySchema.parse(request.body)
      const [, box] = findLevelBand(wholesale.boxes, c.level)!
      const offer = wholesale.items[box.BoxName]!.find((row) => row.item === input.itemId)
      if (!offer) throw bad('unknown_item', 'That item is not in your Wholesale shop.')
      // The original client caps one purchase at one stack; larger counts held the lock for seconds.
      if (input.count > Number(item(offer.item)?.ItemMaxFoldNum ?? 1))
        throw bad('invalid_count', 'You can buy at most one stack at a time.')
      const awards = Array.from({ length: input.count }, () => ({
        itemId: offer.item,
        bound: true,
      }))
      await requireBagRoom(tx, c.id, awards)
      const costs = money(pricesFromCosts(offer.costs))
      await charge(tx, c, {
        stone: costs.stone * input.count,
        gold: costs.gold * input.count,
        giftCoupon: costs.giftCoupon * input.count,
      })
      await grantItems(tx, c.id, awards)
      await command(tx, c, 2017)
      return result(tx, c)
    }),
  )
  app.post('/refresh', { config: { rateLimit: RATE_LIMITS.shopRefresh } }, (request) =>
    atShop(request, async (tx, c) => {
      const { shopType, mode, currency } = shopRefreshSchema.parse(request.body)
      const at = now()
      const [, pool] = poolOf(c.level, shopType)
      const [state] = await tx
        .select()
        .from(characterShops)
        .where(and(eq(characterShops.characterId, c.id), eq(characterShops.shopType, shopType)))
      if (mode === 'instant') {
        const prices = money(parsePrices(pool.ImidRequireMoney))
        const allowed = pool.ImidRequireMoney.split(',')
          .filter((_, i) => i % 2 === 1)
          .map(Number)
        if (!allowed.includes({ stone: 0, gold: 2, giftCoupon: 3 }[currency]))
          throw bad('invalid_currency', 'That restock cannot use this currency.')
        const free = pool.GratisCount > 0 && state?.freeRestockDay !== utcDay(at)
        if (!free) await charge(tx, c, { [currency]: prices[currency] })
        await restock(tx, c, shopType, at)
        if (free)
          await tx
            .update(characterShops)
            .set({ freeRestockDay: utcDay(at) })
            .where(and(eq(characterShops.characterId, c.id), eq(characterShops.shopType, shopType)))
      } else if (restockDue(state?.lastRefreshAt ?? null, at, pool.RefreshTime, 'countdown'))
        await restock(tx, c, shopType, at)
      return { ...(await result(tx, c)), ...(await openView(tx, c)) }
    }),
  )
  const purchaseStock = async (
    tx: Tx,
    c: Character,
    type: number,
    slot?: number,
    currency?: 'stone' | 'gold' | 'giftCoupon',
  ) => {
    const stock = await tx
      .select()
      .from(characterShopStock)
      .where(stockWhere(c.id, type))
      .orderBy(characterShopStock.slot)
    const rows = slot === undefined ? stock : stock.filter((row) => row.slot === slot)
    if (!rows.length) throw bad('stock_empty', 'That stock has already been bought.')
    const costs = { stone: 0, gold: 0, giftCoupon: 0 }
    for (const row of rows) {
      if (/^i15900[0-3]$/.test(row.itemId))
        throw bad('unavailable', 'Treasure scrolls are unavailable in the shop.')
      if (currency) {
        const price = {
          stone: row.priceStone,
          gold: row.priceGold,
          giftCoupon: row.priceGiftCoupon,
        }[currency]
        if (price === null) throw bad('invalid_currency', 'That item cannot use this currency.')
      }
      costs.stone += row.priceStone ?? 0
      costs.gold += row.priceGold ?? 0
      costs.giftCoupon += row.priceGiftCoupon ?? 0
    }
    await requireBagRoom(
      tx,
      c.id,
      rows.map((row) => ({ itemId: row.itemId, bound: row.bound })),
      { separate: true },
    )
    await charge(tx, c, costs)
    for (const row of rows) {
      await tx.insert(inventoryItems).values({
        characterId: c.id,
        itemId: row.itemId,
        bound: row.bound,
        ...shopGearState(row.itemId, row.identifyCount, row.appraised, row.props),
      })
      await tx
        .delete(characterShopStock)
        .where(and(stockWhere(c.id, type), eq(characterShopStock.slot, row.slot)))
    }
    if (type === 1 || type === 3) await command(tx, c, type === 1 ? 2002 : 2004)
    return result(tx, c)
  }
  app.post('/buy', { config: { rateLimit: RATE_LIMITS.shopBuy } }, (request) =>
    atShop(request, async (tx, c) => {
      const i = shopBuySchema.parse(request.body)
      return purchaseStock(tx, c, i.shopType, i.slot, i.currency)
    }),
  )
  app.post('/buy-all', { config: { rateLimit: RATE_LIMITS.shopBuyAll } }, (request) =>
    atShop(request, async (tx, c) =>
      purchaseStock(tx, c, shopBuyAllSchema.parse(request.body).shopType),
    ),
  )
  app.post('/sell', { config: { rateLimit: RATE_LIMITS.shopSell } }, (request) =>
    atShop(request, async (tx, c) => {
      const i = shopSellSchema.parse(request.body)
      return sell(tx, c, [i.inventoryId], i.count)
    }),
  )
  app.post('/sell-all', { config: { rateLimit: RATE_LIMITS.shopSellAll } }, (request) =>
    atShop(request, async (tx, c) =>
      sell(tx, c, shopSellAllSchema.parse(request.body).inventoryIds),
    ),
  )
  app.post('/pouches/refill', { config: { rateLimit: RATE_LIMITS.shopPouch } }, (request) =>
    atShop(request, async (tx, c) => {
      const i = shopPouchRefillSchema.parse(request.body)
      const refill = pouchRefill(c.hpPouch, c.mpPouch, 9000 + c.level * 1000, i.hp, i.mp)
      if (!refill.cost) throw bad('pouch_full', 'Your selected pouches are already full.')
      await charge(tx, c, { [i.currency]: refill.cost })
      await tx
        .update(characters)
        .set({ hpPouch: refill.hp, mpPouch: refill.mp })
        .where(eq(characters.id, c.id))
      await command(tx, c, 2118)
      return result(tx, c)
    }),
  )
  app.get('/merchant', { config: { rateLimit: RATE_LIMITS.shopMerchant } }, (request) =>
    locked(request, async (tx, c) => {
      merchantOpenSchema.parse(request.query)
      return merchantView(tx, c)
    }),
  )
  app.post('/merchant/buy', { config: { rateLimit: RATE_LIMITS.shopMerchantBuy } }, (request) =>
    locked(request, async (tx, c) => {
      const i = merchantBuySchema.parse(request.body)
      const vip = i.tab === 'vip'
      if (vip && !isVip(c, now()))
        throw bad('vip_required', 'The VIP merchant tab requires VIP membership.')
      const [spawn] = await tx
        .select()
        .from(mysticSpawns)
        .where(eq(mysticSpawns.id, i.spawnId))
        .for('update')
      if (!spawn || now() < spawn.startsAt || now() >= spawn.endsAt || spawn.sceneId !== c.sceneId)
        throw bad('merchant_unavailable', 'The merchant is not here.')
      const offer = mystic.items[vip ? '2' : '1']![i.slot]
      // The VIP tab (lib 2) has a fixed price and no stock limit.
      const row = vip
        ? offer && { itemId: offer.item, price: offer.price, left: Infinity }
        : spawn.stock[i.slot]
      if (!offer || !row || row.left < i.count)
        throw bad('stock_empty', 'The merchant has no more of that item.')
      if (c.level < offer.useLevel) throw bad('too_low', 'Your level is too low to buy that item.')
      const [purchase] = await tx
        .select()
        .from(characterMysticPurchases)
        .where(
          and(
            eq(characterMysticPurchases.spawnId, spawn.id),
            eq(characterMysticPurchases.characterId, c.id),
            eq(characterMysticPurchases.itemId, row.itemId),
          ),
        )
      const count = (purchase?.count ?? 0) + i.count
      if (count > (mystic.buyLimits[row.itemId] ?? 1))
        throw bad('purchase_limit', 'You have reached the purchase limit for this spawn.')
      const awards = Array.from({ length: i.count }, () => ({
        itemId: row.itemId,
        bound: offer.bind === 1,
      }))
      await requireBagRoom(tx, c.id, awards)
      await charge(tx, c, { gold: row.price * i.count })
      await grantItems(tx, c.id, awards)
      await tx
        .insert(characterMysticPurchases)
        .values({ spawnId: spawn.id, characterId: c.id, itemId: row.itemId, count })
        .onConflictDoUpdate({
          target: [
            characterMysticPurchases.spawnId,
            characterMysticPurchases.characterId,
            characterMysticPurchases.itemId,
          ],
          set: { count },
        })
      if (!vip) await recordGoldSale(tx, spawn, i.slot, i.count)
      return result(tx, c)
    }),
  )
}
/** Takes a Gold tab sale off the spawn's stock and adds it to the server-wide sales. */
async function recordGoldSale(
  tx: Tx,
  spawn: typeof mysticSpawns.$inferSelect,
  slot: number,
  count: number,
) {
  const row = spawn.stock[slot]!
  const stock = spawn.stock.map((entry, i) =>
    i === slot ? { ...row, left: row.left - count } : entry,
  )
  await tx.update(mysticSpawns).set({ stock }).where(eq(mysticSpawns.id, spawn.id))
  await tx
    .insert(mysticItemSales)
    .values({ itemId: row.itemId, sold: count })
    .onConflictDoUpdate({
      target: mysticItemSales.itemId,
      set: { sold: sql`${mysticItemSales.sold} + ${count}` },
    })
}
async function merchantView(tx: Tx, c: Character) {
  const at = now()
  const candidate = merchantSpawn(at, mystic.times, mystic.locations, random())
  if (!candidate) return { available: false }
  // Serialize lazy spawn creation and its price snapshot across all characters.
  await tx.execute(sql`select pg_advisory_xact_lock(734631)`)
  let [spawn] = await tx
    .select()
    .from(mysticSpawns)
    .where(eq(mysticSpawns.startsAt, candidate.startsAt))
  if (!spawn) {
    const sales = await tx.select().from(mysticItemSales)
    const stock = mystic.items['1']!.map((row) => ({
      itemId: row.item,
      price: merchantPrice(
        row.price,
        sales.find((s) => s.itemId === row.item)?.sold ?? 0,
        row.maxCnt,
      ),
      maxCount: row.maxCnt,
      left: row.maxCnt,
    }))
    ;[spawn] = await tx
      .insert(mysticSpawns)
      .values({
        sceneId: candidate.scene,
        startsAt: candidate.startsAt,
        endsAt: candidate.until,
        stock,
      })
      .returning()
  }
  const purchases = await tx
    .select()
    .from(characterMysticPurchases)
    .where(
      and(
        eq(characterMysticPurchases.spawnId, spawn!.id),
        eq(characterMysticPurchases.characterId, c.id),
      ),
    )
  return {
    available: true,
    spawnId: spawn!.id,
    sceneId: spawn!.sceneId,
    endsAt: spawn!.endsAt.toISOString(),
    stock: spawn!.stock.map((row, slot) => ({
      ...row,
      slot,
      bound: mystic.items['1']![slot]!.bind === 1,
      useLevel: mystic.items['1']![slot]!.useLevel,
      limit: mystic.buyLimits[row.itemId] ?? 1,
      purchased: purchases.find((p) => p.itemId === row.itemId)?.count ?? 0,
    })),
    vipStock: mystic.items['2']!.map((row, slot) => ({
      itemId: row.item,
      slot,
      price: row.price,
      bound: row.bind === 1,
      useLevel: row.useLevel,
      limit: mystic.buyLimits[row.item] ?? 1,
      purchased: purchases.find((p) => p.itemId === row.item)?.count ?? 0,
      left: null,
    })),
    vipAvailable: isVip(c, at),
  }
}

export default shopRoutes
