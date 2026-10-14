import { randomInt, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createRandom, type Random } from '@pockie/game-core'
import {
  flip,
  newBoard,
  rollPetReward,
  type PetTracingBoard,
} from '../../../../game-core/src/events/pet-tracing.js'
import {
  kennelBuyBodySchema,
  tracingBuyBodySchema,
  tracingFlipBodySchema,
  type KennelShopView,
  type TracingView,
} from '../../../../shared/src/schemas/kennel.js'
import type { Db } from '../../db/client.js'
import {
  characterKennelPurchases,
  characterPetTracing,
  characters,
  inventoryItems,
} from '../../db/schema.js'
import { requireBagRoom, unequippedBagItemsWhere } from '../../game/bag.js'
import { itemNameKey, rebornKennelShop, rebornPets } from '../../game/data.js'
import type { GrantedItem } from '../../game/gear.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  DAILY_ATTEMPTS,
  FEATHER_ITEM,
  REFILL_ATTEMPTS,
  REFILL_GOLD,
  TRACING_LEVEL,
} from './constants.js'

type Character = typeof characters.$inferSelect
type State = typeof characterPetTracing.$inferSelect
type StoredBoard = PetTracingBoard & Record<string, unknown> & { id: string; seed: number }
const bad = (code: string, message: string) => new HttpError(400, code, message)
const freshBoard = (random: Random): StoredBoard => {
  const seed = random.int(2 ** 31)
  return { ...newBoard(createRandom(seed)), id: randomUUID(), seed }
}
const boardOf = (state: State) => state.board as unknown as StoredBoard
const awards = (itemId: string, count: number): GrantedItem[] =>
  Array.from({ length: count }, () => ({ itemId, bound: true }))
async function feathers(tx: Tx, id: string) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(id), eq(inventoryItems.itemId, FEATHER_ITEM)))
  return rows.reduce((n, r) => n + r.count, 0)
}
async function tracingState(tx: Tx, character: Character, day: string, random: Random) {
  if (character.level < TRACING_LEVEL) throw bad('too_low', 'Pet Tracing opens at level 20.')
  await tx.insert(characterPetTracing).values({ characterId: character.id }).onConflictDoNothing()
  let [state] = await tx
    .select()
    .from(characterPetTracing)
    .where(eq(characterPetTracing.characterId, character.id))
    .for('update')
  if (state!.day !== day || !state!.board) {
    ;[state] = await tx
      .update(characterPetTracing)
      .set({ day, attemptsUsed: 0, boughtDay: null, board: freshBoard(random) })
      .where(eq(characterPetTracing.characterId, character.id))
      .returning()
  }
  return state!
}
async function tracingView(tx: Tx, state: State, day: string): Promise<TracingView> {
  const board = boardOf(state)
  return {
    boardId: board.id,
    cells: Array.from({ length: 9 }, (_, cell) =>
      board.opened.includes(cell) ? flip({ ...board, opened: [] }, cell).arrow : null,
    ),
    attemptsLeft:
      DAILY_ATTEMPTS + (state.boughtDay === day ? REFILL_ATTEMPTS : 0) - state.attemptsUsed,
    canBuy: state.boughtDay !== day,
    feathers: await feathers(tx, state.characterId),
  }
}
async function shopView(tx: Tx, character: Character, day: string): Promise<KennelShopView> {
  const rows = await tx
    .select()
    .from(characterKennelPurchases)
    .where(
      and(
        eq(characterKennelPurchases.characterId, character.id),
        eq(characterKennelPurchases.day, day),
      ),
    )
  return {
    level: character.level,
    feathers: await feathers(tx, character.id),
    offers: rebornKennelShop().offers.map((o) => ({
      itemId: o.item,
      nameKey: itemNameKey(o.item),
      price: o.price,
      level: o.level,
      dailyLimit: o.dailyLimit,
      purchased: rows.find((r) => r.itemId === o.item)?.count ?? 0,
    })),
  }
}
export interface KennelRouteOptions {
  db: Db
  random?: () => Random
  now?: () => Date
}
export async function kennelRoutes(
  app: FastifyInstance,
  {
    db,
    random = () => createRandom(randomInt(2 ** 31)),
    now = () => new Date(),
  }: KennelRouteOptions,
) {
  const run = (
    request: FastifyRequest,
    action: (tx: Tx, character: Character, day: string) => Promise<unknown>,
  ) => {
    const user = requireUser(request)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, user.id)
      return action(tx, character, now().toISOString().slice(0, 10))
    })
  }
  const read = { config: { rateLimit: RATE_LIMITS.read } }
  const write = { config: { rateLimit: RATE_LIMITS.item } }
  app.get('/tracing', read, (request) =>
    run(request, async (tx, c, day) =>
      tracingView(tx, await tracingState(tx, c, day, random()), day),
    ),
  )
  app.post('/tracing/buy', write, (request) => {
    tracingBuyBodySchema.parse(request.body)
    return run(request, async (tx, c, day) => {
      const state = await tracingState(tx, c, day, random())
      if (state.boughtDay === day)
        throw bad('already_bought', 'You already bought extra attempts today.')
      if (c.gold < REFILL_GOLD) throw bad('not_enough_currency', 'You need 10 Gold.')
      await tx
        .update(characters)
        .set({ gold: c.gold - REFILL_GOLD })
        .where(eq(characters.id, c.id))
      const [updated] = await tx
        .update(characterPetTracing)
        .set({ boughtDay: day })
        .where(eq(characterPetTracing.characterId, c.id))
        .returning()
      return tracingView(tx, updated!, day)
    })
  })
  app.post('/tracing/flip', write, (request) => {
    const body = tracingFlipBodySchema.parse(request.body)
    return run(request, async (tx, c, day) => {
      const rng = random()
      const state = await tracingState(tx, c, day, rng)
      const board = boardOf(state)
      if (state.attemptsUsed >= DAILY_ATTEMPTS + (state.boughtDay === day ? REFILL_ATTEMPTS : 0))
        throw bad('no_attempts', 'You have no attempts left today.')
      if (board.id !== body.boardId)
        throw bad('stale_board', 'This board has changed. Reopen Pet Tracing.')
      if (board.opened.includes(body.cell))
        throw bad('already_flipped', 'That cell is already flipped.')
      const result = flip(board, body.cell)
      // The persisted board seed determines its pet reward, including after a rolled-back full bag.
      const rewardRandom = createRandom(board.seed)
      newBoard(rewardRandom)
      const petItem = result.found
        ? rollPetReward(
            rewardRandom,
            rebornPets()
              .filter((p) => p.nature <= 3)
              .map((p) => p.item),
          )
        : null
      const rewards = [
        ...awards(FEATHER_ITEM, result.feathers),
        ...(petItem ? awards(petItem, 1) : []),
      ]
      await requireBagRoom(tx, c.id, rewards)
      await grantItems(tx, c.id, rewards)
      const [updated] = await tx
        .update(characterPetTracing)
        .set({
          attemptsUsed: state.attemptsUsed + 1,
          finds: state.finds + (result.found ? 1 : 0),
          board: result.found ? freshBoard(rng) : { ...board, ...result.board },
        })
        .where(eq(characterPetTracing.characterId, c.id))
        .returning()
      return {
        ...(await tracingView(tx, updated!, day)),
        reward: { feathers: result.feathers, petItem },
      }
    })
  })
  app.get('/shop', read, (request) => run(request, shopView))
  app.post('/shop/buy', write, (request) => {
    const { itemId, count } = kennelBuyBodySchema.parse(request.body)
    return run(request, async (tx, c, day) => {
      const offer = rebornKennelShop().offers.find((o) => o.item === itemId)
      if (!offer) throw bad('not_for_sale', 'That item is not sold here.')
      if (c.level < offer.level) throw bad('too_low', `This item requires level ${offer.level}.`)
      const [purchase] = await tx
        .select()
        .from(characterKennelPurchases)
        .where(
          and(
            eq(characterKennelPurchases.characterId, c.id),
            eq(characterKennelPurchases.day, day),
            eq(characterKennelPurchases.itemId, itemId),
          ),
        )
        .for('update')
      const purchased = purchase?.count ?? 0
      if (purchased + count > offer.dailyLimit)
        throw bad('daily_limit', "That would exceed today's purchase limit.")
      const { spendItems } = await import('../pets/kennel.js')
      await spendItems(
        tx,
        c.id,
        FEATHER_ITEM,
        offer.price * count,
        'You do not have enough Feathers.',
      )
      const rewards = awards(itemId, count)
      await requireBagRoom(tx, c.id, rewards)
      await grantItems(tx, c.id, rewards)
      await tx
        .insert(characterKennelPurchases)
        .values({ characterId: c.id, day, itemId, count: purchased + count })
        .onConflictDoUpdate({
          target: [
            characterKennelPurchases.characterId,
            characterKennelPurchases.day,
            characterKennelPurchases.itemId,
          ],
          set: { count: purchased + count },
        })
      return shopView(tx, c, day)
    })
  })
}
export default kennelRoutes
