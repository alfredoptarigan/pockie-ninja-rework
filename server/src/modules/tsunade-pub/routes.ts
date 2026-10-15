// Tsunade Pub (Reborn chunk 221, prize roulette) under /api/game/tsunade-pub: the wheel, spins
// (free first, then reward, then bought), buying a spin for Gold, and collecting or selling the
// unclaimed prizes. Every action locks the character row, then the pub row.
import { createRandom } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  pubCollectSchema,
  pubSellSchema,
  TSUNADE_PUB_RULES as RULES,
  type PubActionResult,
  type PubPrize,
  type PubPrizeView,
  type PubSpinResult,
  type TsunadePubView,
} from '../../../../shared/src/schemas/tsunade-pub.js'
import type { Db } from '../../db/client.js'
import { characters, tsunadePub } from '../../db/schema.js'
import { bagFits, itemInfo } from '../../game/bag.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { nextDay } from '../events/view.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { TSUNADE_PUB_PLACEHOLDERS as PLACEHOLDERS } from './config.js'
import { makeBoard, rollsUntil, sellValue, spin } from './rules.js'

type PubRow = typeof tsunadePub.$inferSelect

const freeUsed = (row: PubRow, now: Date) => (row.freeDay === utcDay(now) ? row.freeUsed : 0)

/** The ninja's pub row, created with a first wheel and locked (after the character row). */
async function lockPub(tx: Tx, characterId: string) {
  await tx
    .insert(tsunadePub)
    .values({ characterId, board: makeBoard(createRandom(newSeed())) })
    .onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(tsunadePub)
    .where(eq(tsunadePub.characterId, characterId))
    .for('update')
  return row!
}

const save = async (tx: Tx, characterId: string, values: Partial<PubRow>) => {
  const [row] = await tx
    .update(tsunadePub)
    .set(values)
    .where(eq(tsunadePub.characterId, characterId))
    .returning()
  return row!
}

const prizeView = (prize: PubPrize): PubPrizeView => ({
  ...prize,
  info: itemInfo(prize.itemId),
  sellValue: sellValue(prize),
})

function view(row: PubRow, now: Date): TsunadePubView {
  return {
    board: row.board.map(prizeView),
    won: row.won.map(prizeView),
    freeAttempts: RULES.freeSpinsPerDay - freeUsed(row, now),
    rewardAttempts: row.rewardAttempts,
    paidAttempts: row.paidAttempts,
    rollsUntilBonus: rollsUntil(row.spins, RULES.bonusEvery),
    rollsUntilGuaranteed: rollsUntil(row.spins, RULES.guaranteedEvery),
    resetAt: nextDay(now),
  }
}

/** The counter a spin uses: free spins first, then reward spins, then bought ones. */
function useSpin(row: PubRow, now: Date): Partial<PubRow> {
  const used = freeUsed(row, now)
  if (used < RULES.freeSpinsPerDay) return { freeDay: utcDay(now), freeUsed: used + 1 }
  if (row.rewardAttempts > 0) return { rewardAttempts: row.rewardAttempts - 1 }
  if (row.paidAttempts > 0) return { paidAttempts: row.paidAttempts - 1 }
  throw bad('no_spins', `You have no spins left. Buy one for ${RULES.spinCost} Gold.`)
}

async function spinOnce(tx: Tx, character: CharacterRow): Promise<PubSpinResult> {
  const now = new Date()
  const row = await lockPub(tx, character.id)
  const counters = useSpin(row, now)
  // A spin adds at most two prizes (the prize and Valhalla gear).
  if (row.won.length + 2 > PLACEHOLDERS.maxUnclaimed)
    throw bad('prizes_full', 'Collect or sell your unclaimed prizes before you spin again.')
  const result = spin(row.board, row.spins, character.level, createRandom(newSeed()))
  const won = [...row.won, result.prize, ...(result.extra ? [result.extra] : [])]
  const after = await save(tx, character.id, {
    ...counters,
    spins: row.spins + 1,
    board: result.newBoard,
    won,
  })
  return {
    currentBoard: result.currentBoard.map(prizeView),
    winningIndex: result.winningIndex,
    prize: prizeView(result.prize),
    extra: result.extra && prizeView(result.extra),
    pub: view(after, now),
    character: await characterView(tx, character.id),
  }
}

async function buySpin(tx: Tx, character: CharacterRow): Promise<PubActionResult> {
  if (character.gold < RULES.spinCost)
    throw bad('no_gold', `You need ${RULES.spinCost} Gold to buy a spin.`)
  const row = await lockPub(tx, character.id)
  await tx
    .update(characters)
    .set({ gold: sql`${characters.gold} - ${RULES.spinCost}` })
    .where(eq(characters.id, character.id))
  const after = await save(tx, character.id, { paidAttempts: row.paidAttempts + 1 })
  return { pub: view(after, new Date()), character: await characterView(tx, character.id) }
}

const units = (prize: PubPrize) =>
  Array.from({ length: prize.amount }, () => ({
    itemId: prize.itemId,
    bound: prize.bound ?? true,
    identifyCount: prize.valhalla ? PLACEHOLDERS.valhallaLines : 0,
  }))

/** Moves one prize, or every prize that fits (in order), into the bag. */
async function collect(tx: Tx, character: CharacterRow, index: number | undefined) {
  const row = await lockPub(tx, character.id)
  if (index !== undefined && index >= row.won.length)
    throw bad('no_prize', 'That prize is no longer there.')
  const wanted = new Set(index === undefined ? row.won.keys() : [index])
  const kept: PubPrize[] = []
  let collected = 0
  for (const [i, prize] of row.won.entries()) {
    const take = wanted.has(i) && (await bagFits(tx, character.id, units(prize)))
    if (!take) {
      kept.push(prize)
      continue
    }
    await grantItems(tx, character.id, units(prize))
    collected += 1
  }
  if (collected === 0 && wanted.size > 0)
    throw bad('bag_full', 'Make room in your bag before you collect prizes.')
  const after = await save(tx, character.id, { won: kept })
  const result: PubActionResult = {
    pub: view(after, new Date()),
    character: await characterView(tx, character.id),
    collected,
  }
  return result
}

async function sell(tx: Tx, character: CharacterRow, indexes: number[]) {
  const row = await lockPub(tx, character.id)
  const sold = new Set(indexes)
  if ([...sold].some((i) => i >= row.won.length))
    throw bad('no_prize', 'Some of those prizes are no longer there.')
  const earned = row.won.reduce((sum, prize, i) => sum + (sold.has(i) ? sellValue(prize) : 0), 0)
  await tx
    .update(characters)
    .set({ stone: sql`${characters.stone} + ${earned}` })
    .where(eq(characters.id, character.id))
  const after = await save(tx, character.id, { won: row.won.filter((_, i) => !sold.has(i)) })
  const result: PubActionResult = {
    pub: view(after, new Date()),
    character: await characterView(tx, character.id),
    earned,
  }
  return result
}

export async function tsunadePubRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // The first look rolls the first wheel, so it runs in a locked transaction too.
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) =>
      view(await lockPub(tx, character.id), new Date()),
    ),
  )
  app.post('/spin', { config: { rateLimit: RATE_LIMITS.item } }, async (request) =>
    withCharacter(db, request, spinOnce),
  )
  app.post('/buy', { config: { rateLimit: RATE_LIMITS.item } }, async (request) =>
    withCharacter(db, request, buySpin),
  )
  app.post('/collect', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { index } = pubCollectSchema.parse(request.body ?? {})
    return withCharacter(db, request, (tx, character) => collect(tx, character, index))
  })
  app.post('/sell', { config: { rateLimit: RATE_LIMITS.bagSell } }, async (request) => {
    const { indexes } = pubSellSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => sell(tx, character, indexes))
  })
}

export default tsunadePubRoutes
