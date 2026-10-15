// Konoha Boutique (Reborn chunk 358, slot machine) under /api/game/konoha-boutique: spins (bet =
// multiplier x lines, both capped by the boutique level), free coins, coins bought with Gold /
// Stone / Gift Coupons, Exchange Rewards for items, the Bonus Round chests and Double Chance. The
// server rolls and prices everything; every action locks the character row, then the boutique's.
import { createRandom } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  BOUTIQUE_RULES as RULES,
  boutiqueBuyCoinsSchema,
  boutiqueChestSchema,
  boutiqueExchangeSchema,
  boutiqueGuessSchema,
  boutiqueSpinSchema,
  type BoutiqueActionResult,
  type BoutiqueChestResult,
  type BoutiqueCurrency,
  type BoutiqueGuessResult,
  type BoutiqueSpinResult,
  type BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique.js'
import type { Db } from '../../db/client.js'
import { characters, konohaBoutique } from '../../db/schema.js'
import { itemInfo, requireBagRoom } from '../../game/bag.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { BOUTIQUE_PLACEHOLDERS as P } from './config.js'
import {
  chestCoins,
  doubleNumber,
  doubleOperator,
  evaluate,
  guess,
  levelFor,
  maxBet,
  rollPieces,
} from './rules.js'

type Row = typeof konohaBoutique.$inferSelect

const freeClaimed = (row: Row | undefined, now: Date) =>
  row?.freeDay === utcDay(now) ? row.freeClaimed : 0

const REWARDS = P.rewards.map((reward) => ({ ...reward, info: itemInfo(reward.itemId) }))

function view(row: Row | undefined, now: Date): BoutiqueView {
  const exp = row?.exp ?? 0
  return {
    coins: row?.coins ?? 0,
    level: levelFor(exp),
    currentExp: exp,
    levels: P.levels,
    bonusChance: row?.bonusBet ? 1 : 0,
    bonusPicks: row?.bonusPicks ?? [],
    doubleChance: row?.doubleCoins ? 1 : 0,
    doubleChanceCoins: row?.doubleCoins ?? 0,
    doubleChanceNumber: row?.doubleNumber ?? 0,
    doubleChanceOperator: row?.doubleOperator ?? 'higher',
    lastCoinWon: row?.lastWon ?? 0,
    nextFreeCoinTime: (row?.nextFreeAt ?? now).toISOString(),
    freeCoinsClaimed: freeClaimed(row, now),
    freeCoinsPerDay: RULES.freeCoinsPerDay,
    rewards: REWARDS,
    buyTiers: P.buyTiers as BoutiqueView['buyTiers'],
  }
}

/** The ninja's boutique row, created on first use and locked (after the character row). */
async function lockRow(tx: Tx, characterId: string) {
  await tx.insert(konohaBoutique).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(konohaBoutique)
    .where(eq(konohaBoutique.characterId, characterId))
    .for('update')
  return row!
}

async function save(tx: Tx, characterId: string, values: Partial<Row>) {
  const [row] = await tx
    .update(konohaBoutique)
    .set(values)
    .where(eq(konohaBoutique.characterId, characterId))
    .returning()
  return row!
}

const requireNothingPending = (row: Row) => {
  if (row.bonusBet > 0) throw bad('bonus_pending', 'Open your Bonus Round chests first.')
  if (row.doubleCoins > 0) throw bad('double_pending', 'Finish your Double Chance first.')
}

async function spin(
  tx: Tx,
  character: CharacterRow,
  multiplier: number,
  lines: number,
): Promise<BoutiqueSpinResult> {
  const row = await lockRow(tx, character.id)
  requireNothingPending(row)
  const max = maxBet(levelFor(row.exp))
  if (multiplier > max.multiplier || lines > max.lines)
    throw bad(
      'bet_too_high',
      `Your boutique level allows up to x${max.multiplier} on ${max.lines} lines.`,
    )
  const bet = multiplier * lines
  if (row.coins < bet) throw bad('not_enough_coins', `You need ${bet} Boutique Coins to spin.`)
  const random = createRandom(newSeed())
  const pieces = rollPieces(random)
  const result = evaluate(pieces, lines, multiplier)
  // A win may go to a Double Chance instead of the balance (not when a Bonus Round starts too).
  const double = result.coins > 0 && !result.bonus && random.next() * 100 < P.doubleChancePercent
  const after = await save(tx, character.id, {
    coins: row.coins - bet + (double ? 0 : result.coins),
    exp: row.exp + bet * P.expPerCoin,
    lastWon: result.coins,
    bonusBet: result.bonus ? bet : 0,
    bonusPicks: [],
    doubleCoins: double ? result.coins : 0,
    doubleNumber: double ? doubleNumber(random) : 0,
    doubleOperator: doubleOperator(random),
  })
  return {
    pieces,
    winningLines: result.winningLines,
    winningPieces: result.winningPieces,
    coinsGained: result.coins,
    boutique: view(after, new Date()),
  }
}

async function claimFreeCoins(tx: Tx, character: CharacterRow) {
  const now = new Date()
  const row = await lockRow(tx, character.id)
  const claimed = freeClaimed(row, now)
  if (claimed >= RULES.freeCoinsPerDay)
    throw bad('free_limit', 'You have claimed all your free coins today.')
  if (row.nextFreeAt && row.nextFreeAt > now)
    throw bad('free_wait', 'Your next free coins are not ready yet.')
  const after = await save(tx, character.id, {
    coins: row.coins + RULES.freeCoins,
    freeDay: utcDay(now),
    freeClaimed: claimed + 1,
    nextFreeAt: new Date(now.getTime() + RULES.freeCoinsEveryMs),
  })
  return { boutique: view(after, now) }
}

const CURRENCY_NAMES: Record<BoutiqueCurrency, string> = {
  gold: 'Gold',
  stone: 'Stone',
  giftCoupon: 'Gift Coupons',
}

async function buyCoins(
  tx: Tx,
  character: CharacterRow,
  currency: BoutiqueCurrency,
  tier: number,
): Promise<BoutiqueActionResult> {
  const offer = P.buyTiers[currency][tier]
  if (!offer) throw bad('no_tier', 'That offer does not exist.')
  const [cost, coins] = offer
  if (character[currency] < cost)
    throw bad('not_enough', `You need ${cost.toLocaleString('en-US')} ${CURRENCY_NAMES[currency]}.`)
  const row = await lockRow(tx, character.id)
  await tx
    .update(characters)
    .set({ [currency]: sql`${characters[currency]} - ${cost}` })
    .where(eq(characters.id, character.id))
  const after = await save(tx, character.id, { coins: row.coins + coins })
  return { boutique: view(after, new Date()), character: await characterView(tx, character.id) }
}

async function exchange(
  tx: Tx,
  character: CharacterRow,
  rewardId: string,
): Promise<BoutiqueActionResult> {
  const reward = P.rewards.find((entry) => entry.id === rewardId)
  if (!reward) throw bad('no_reward', 'That reward is not for sale.')
  const row = await lockRow(tx, character.id)
  if (row.coins < reward.price)
    throw bad(
      'not_enough_coins',
      `You need ${reward.price.toLocaleString('en-US')} Boutique Coins.`,
    )
  const items = Array.from({ length: reward.amount }, () => ({
    itemId: reward.itemId,
    bound: true,
  }))
  await requireBagRoom(tx, character.id, items, {
    message: 'Make room in your bag before you buy this.',
  })
  await grantItems(tx, character.id, items)
  const after = await save(tx, character.id, { coins: row.coins - reward.price })
  return { boutique: view(after, new Date()), character: await characterView(tx, character.id) }
}

/** Opens a chest of the waiting Bonus Round; -1 (or the third chest) ends the round. */
async function openChest(
  tx: Tx,
  character: CharacterRow,
  index: number,
): Promise<BoutiqueChestResult> {
  const row = await lockRow(tx, character.id)
  if (row.bonusBet === 0) throw bad('no_bonus', 'You have no Bonus Round waiting.')
  if (index === -1) {
    const after = await save(tx, character.id, { bonusBet: 0, bonusPicks: [] })
    return { index, coinsWon: 0, boutique: view(after, new Date()) }
  }
  if (row.bonusPicks.some((pick) => pick.index === index))
    throw bad('chest_open', 'That chest is already open.')
  const coinsWon = chestCoins(row.bonusBet, createRandom(newSeed()))
  const picks = [...row.bonusPicks, { index, coins: coinsWon }]
  const done = picks.length >= RULES.chestPicks
  const after = await save(tx, character.id, {
    coins: row.coins + coinsWon,
    bonusBet: done ? 0 : row.bonusBet,
    bonusPicks: done ? [] : picks,
  })
  return { index, coinsWon, boutique: view(after, new Date()) }
}

/**
 * Double Chance: a box higher (or lower) than the number doubles the coins at stake, else they
 * are lost. ponytail: one guess per Double Chance; chaining doubles would need a round counter.
 */
async function doubleGuess(
  tx: Tx,
  character: CharacterRow,
  index: number,
): Promise<BoutiqueGuessResult> {
  const row = await lockRow(tx, character.id)
  if (row.doubleCoins === 0) throw bad('no_double', 'You have no Double Chance waiting.')
  const operator = row.doubleOperator
  const result = guess(index, row.doubleNumber, operator, createRandom(newSeed()))
  const after = await save(tx, character.id, {
    coins: row.coins + (result.won ? row.doubleCoins * 2 : 0),
    lastWon: result.won ? row.doubleCoins * 2 : 0,
    doubleCoins: 0,
    doubleNumber: 0,
  })
  return { ...result, index, operator, target: row.doubleNumber, boutique: view(after, new Date()) }
}

/** Takes the coins at stake without guessing. */
async function claimDouble(tx: Tx, character: CharacterRow) {
  const row = await lockRow(tx, character.id)
  if (row.doubleCoins === 0) throw bad('no_double', 'You have no Double Chance waiting.')
  const after = await save(tx, character.id, {
    coins: row.coins + row.doubleCoins,
    doubleCoins: 0,
    doubleNumber: 0,
  })
  return { boutique: view(after, new Date()) }
}

export async function konohaBoutiqueRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const [row] = await db
      .select()
      .from(konohaBoutique)
      .where(eq(konohaBoutique.characterId, character.id))
    return view(row, new Date())
  })
  app.post('/spin', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { multiplier, lines } = boutiqueSpinSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => spin(tx, character, multiplier, lines))
  })
  app.post('/free-coins', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) =>
    withCharacter(db, request, claimFreeCoins),
  )
  app.post('/buy-coins', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { currency, tier } = boutiqueBuyCoinsSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => buyCoins(tx, character, currency, tier))
  })
  app.post('/exchange', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { rewardId } = boutiqueExchangeSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => exchange(tx, character, rewardId))
  })
  app.post('/chest', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { index } = boutiqueChestSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => openChest(tx, character, index))
  })
  app.post('/double', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { index } = boutiqueGuessSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => doubleGuess(tx, character, index))
  })
  app.post('/double/claim', { config: { rateLimit: RATE_LIMITS.item } }, async (request) =>
    withCharacter(db, request, claimDouble),
  )
}

export default konohaBoutiqueRoutes
