// The arena extras row (bought tickets, Team Coins, Hero Coins, Championship record) and the
// coin exchanges that spend Team Coins and Hero Coins. Lock order: the character, then arena
// rows, then this row.
import { eq } from 'drizzle-orm'
import type { CoinOfferView } from '../../../../shared/src/schemas/arena-extras.js'
import type { Db } from '../../db/client.js'
import { arenaExtras } from '../../db/schema.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { bad, requireBagRoom } from '../gates/common.js'
import type { CoinOffer } from './config.js'

export type ExtrasRow = typeof arenaExtras.$inferSelect

/** The ninja's extras row, created on first use and locked. */
export async function lockExtras(tx: Tx, characterId: string): Promise<ExtrasRow> {
  await tx.insert(arenaExtras).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(arenaExtras)
    .where(eq(arenaExtras.characterId, characterId))
    .for('update')
  return row!
}

/** The row without a lock (defaults when the ninja has none yet). */
export async function readExtras(tx: Tx | Db, characterId: string): Promise<ExtrasRow> {
  const [row] = await tx.select().from(arenaExtras).where(eq(arenaExtras.characterId, characterId))
  return (
    row ?? {
      characterId,
      arenaTickets: 0,
      squadTickets: 0,
      teamCoins: 0,
      heroCoins: 0,
      championshipWins: 0,
      championshipLosses: 0,
      championshipTop3: 0,
    }
  )
}

export async function saveExtras(tx: Tx, characterId: string, values: Partial<ExtrasRow>) {
  await tx.update(arenaExtras).set(values).where(eq(arenaExtras.characterId, characterId))
}

export const offerViews = (offers: readonly CoinOffer[]): CoinOfferView[] =>
  offers.map(({ id, itemId, amount, price }) => ({ id, itemId, amount, price }))

/** Buys `amount` x the offer's item (bound) with Team Coins or Hero Coins. */
export async function buyCoinOffer(
  tx: Tx,
  characterId: string,
  offers: readonly CoinOffer[],
  id: string,
  coin: 'teamCoins' | 'heroCoins',
) {
  const offer = offers.find((o) => o.id === id)
  if (!offer) throw bad('unknown_offer', 'That item is not sold here.')
  const extras = await lockExtras(tx, characterId)
  const label = coin === 'teamCoins' ? 'Team Coins' : 'Hero Coins'
  if (extras[coin] < offer.price) throw bad('no_coins', `You do not have enough ${label}.`)
  const items = Array.from({ length: offer.amount }, () => ({ itemId: offer.itemId, bound: true }))
  await requireBagRoom(tx, characterId, items)
  await grantItems(tx, characterId, items)
  await saveExtras(tx, characterId, { [coin]: extras[coin] - offer.price })
}
