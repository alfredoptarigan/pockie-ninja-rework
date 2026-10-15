// The trade swap: one transaction. Both characters are locked in id order (the global lock order),
// then every offered item row in id order; each row is re-checked against what was offered (still
// the owner's, still tradable, same count and instance state), then both currencies, the currency
// cap and the bag room of both sides. Only then does anything move.
import { asc, eq, inArray } from 'drizzle-orm'
import { CURRENCY_CAP } from '../../../../game-core/src/economy/market.js'
import {
  canTradeAt,
  TRADE_CONFIG,
  TRADE_CURRENCIES,
  tradeFee,
  tradeRefusal,
  type TradeAmounts,
  type TradeCurrency,
} from '../../../../game-core/src/economy/trade.js'
import { characters, inventoryItems, tradeLogs, type TradeLogOffer } from '../../db/schema.js'
import { bagFits, itemCells } from '../../game/bag.js'
import { item } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import type { Side, Trade } from './book.js'

type ItemRow = typeof inventoryItems.$inferSelect
type Character = typeof characters.$inferSelect

export const CURRENCY_NAMES: Record<TradeCurrency, string> = {
  stone: 'Stone',
  gold: 'Gold',
  giftCoupon: 'Gift Certificates',
}

/** Offered rows that changed or left their owner; the trade drops them. */
export class TradeChanged extends HttpError {
  constructor(readonly inventoryIds: string[]) {
    super(
      409,
      'trade_changed',
      'An offered item changed, so it left the trade. Check the offers again.',
    )
  }
}

const bad = (code: string, message: string) => new HttpError(400, code, message)

/** Whether a row may be offered, from its state and the item table. */
export function refusalOf(row: ItemRow) {
  const def = item(row.itemId)
  return tradeRefusal({
    canTrade: Number(def?.CanTrade ?? 0),
    questItem: def?.class === 'TaskItem',
    bound: row.bound,
    locked: row.locked,
    equipped: row.equippedSlot !== null,
    inBag: row.location === 'bag',
  })
}

/**
 * The instance state the partner was shown. Any difference at the swap (a refine, a split, a gem)
 * fails the trade. ponytail: an outfit's recast (outfit_recasts) is not part of it.
 */
export const fingerprint = (row: ItemRow) =>
  JSON.stringify([
    row.itemId,
    row.count,
    row.bound,
    row.enhanceLevel,
    row.inscribeLevel,
    row.durability,
    row.canIdentify,
    row.identifyCount,
    row.identifyTimes,
    row.props,
    row.engravedSlot,
    row.gems,
    row.enchantItemId,
  ])

const fees = (paid: TradeAmounts) =>
  Object.fromEntries(TRADE_CURRENCIES.map((c) => [c, tradeFee(c, paid[c]).fee])) as TradeAmounts

/** Locks the offered rows (id order) and checks each one is still what was offered. */
async function lockOffers(tx: Tx, trade: Trade) {
  const ids = trade.sides.flatMap((s) => s.offers.map((o) => o.item.inventoryId))
  const rows = ids.length
    ? await tx
        .select()
        .from(inventoryItems)
        .where(inArray(inventoryItems.id, ids))
        .orderBy(asc(inventoryItems.id))
        .for('update')
    : []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const changed = trade.sides.flatMap((s) =>
    s.offers.flatMap(({ item: { inventoryId }, fingerprint: offered }) => {
      const row = byId.get(inventoryId)
      const same =
        row && row.characterId === s.characterId && !refusalOf(row) && fingerprint(row) === offered
      return same ? [] : [inventoryId]
    }),
  )
  if (changed.length) throw new TradeChanged(changed)
  return (s: Side) => s.offers.map((o) => byId.get(o.item.inventoryId)!)
}

/** Money and bag checks for `c` giving `mine` and getting `theirs`; returns its new balances. */
async function receive(
  tx: Tx,
  c: Character,
  [me, partner]: [Side, Side],
  [given, got]: [ItemRow[], ItemRow[]],
) {
  if (!canTradeAt(c.level))
    throw bad(
      'trade_level',
      `Both players must be at least level ${TRADE_CONFIG.minLevel} to trade.`,
    )
  const balance = {} as TradeAmounts
  for (const currency of TRADE_CURRENCIES) {
    const name = CURRENCY_NAMES[currency]
    if (c[currency] < me.currency[currency])
      throw bad('no_currency', `${c.name} does not have that much ${name}.`)
    const next =
      c[currency] - me.currency[currency] + tradeFee(currency, partner.currency[currency]).net
    if (next > CURRENCY_CAP)
      throw bad(
        'currency_cap',
        `${c.name} cannot hold more than ${CURRENCY_CAP.toLocaleString('en-US')} ${name}.`,
      )
    balance[currency] = next
  }
  // The given rows leave the bag first, so their cells count as free.
  const freed = given.reduce((sum, row) => sum + itemCells(row.itemId), 0)
  const incoming = got.map((row) => ({ itemId: row.itemId, bound: row.bound }))
  if (!(await bagFits(tx, c.id, incoming, { separate: true, reserve: -freed })))
    throw bad('bag_full', `${c.name}'s bag is full.`)
  return balance
}

const logOf = (s: Side, rows: ItemRow[]): TradeLogOffer => ({
  items: rows.map((row) => ({ inventoryId: row.id, itemId: row.itemId, count: row.count })),
  currency: { ...s.currency },
  fee: fees(s.currency),
})

/** Runs the swap of a trade both players confirmed. Throws (and moves nothing) on any failure. */
export async function swap(tx: Tx, trade: Trade) {
  const [a, b] = trade.sides
  const locked = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, [a.characterId, b.characterId]))
    .orderBy(asc(characters.id))
    .for('update')
  const ca = locked.find((row) => row.id === a.characterId)
  const cb = locked.find((row) => row.id === b.characterId)
  if (!ca || !cb) throw new HttpError(404, 'no_trade', 'That trade has ended.')
  const rowsOf = await lockOffers(tx, trade)
  const [ra, rb] = [rowsOf(a), rowsOf(b)]
  const balanceA = await receive(tx, ca, [a, b], [ra, rb])
  const balanceB = await receive(tx, cb, [b, a], [rb, ra])

  // Moved rows lose their bag spot; placeBag gives them one on the next bag read.
  const give = (rows: ItemRow[], to: string) =>
    rows.length
      ? tx
          .update(inventoryItems)
          .set({ characterId: to, bagPage: null, bagSlot: null })
          .where(
            inArray(
              inventoryItems.id,
              rows.map((row) => row.id),
            ),
          )
      : undefined
  await give(ra, b.characterId)
  await give(rb, a.characterId)
  await tx.update(characters).set(balanceA).where(eq(characters.id, a.characterId))
  await tx.update(characters).set(balanceB).where(eq(characters.id, b.characterId))
  await tx.insert(tradeLogs).values({
    initiatorId: a.characterId,
    partnerId: b.characterId,
    initiatorOffer: logOf(a, ra),
    partnerOffer: logOf(b, rb),
  })
}
