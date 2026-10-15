// Zanpakuto under /api/game/zanpakuto (Reborn village icon, level 61): equip, unequip and sell
// crystals, buy spirit slots, activate stats 2 and 3, refine and bulk refine. Every action locks
// the character row first (currency and slots change under it), checks inside the transaction,
// rolls with a seeded Random and answers with the whole view. Crystals change no combat stat yet:
// their ranges are placeholders (game-core ZANPAKUTO_REFINE_RANGES).
import { createRandom } from '@pockie/game-core'
import { eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  applyBulkOption,
  ATTRIBUTE_UNLOCK_COUPONS,
  BULK_REFRESH_COST,
  bulkApplyCost,
  bulkOptions,
  crystalInfo,
  FREE_REFINES_PER_DAY,
  FREE_SPIRIT_SLOTS,
  REFINE_COST_SC,
  rollStats,
  spiritSlotCost,
  weaponSlotOpen,
  ZANPAKUTO_LEVEL,
  type CrystalInfo,
} from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import {
  zanpakutoAttributeBodySchema,
  zanpakutoBulkApplyBodySchema,
  zanpakutoCrystalBodySchema,
  zanpakutoSlotUnlockBodySchema,
} from '../../../../shared/src/schemas/zanpakuto.js'
import type { Db } from '../../db/client.js'
import { characters, characterZanpakuto, zanpakutoCrystals } from '../../db/schema.js'
import { avatarStats } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { bad, newSeed, utcDay } from '../gates/common.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  freeSpiritSlot,
  loadZanpakuto,
  refinesUsedToday,
  spiritSlotOpen,
  zanpakutoView,
  type CrystalRow,
  type ZanpakutoState,
} from './view.js'

type Character = typeof characters.$inferSelect
interface Context {
  tx: Tx
  character: Character
  state: ZanpakutoState
}

function requireLevel(character: Pick<Character, 'level'>) {
  if (character.level < ZANPAKUTO_LEVEL)
    throw new HttpError(403, 'level_too_low', `Zanpakuto opens at level ${ZANPAKUTO_LEVEL}.`)
}

const viewOf = (state: ZanpakutoState, character: Character) =>
  zanpakutoView(state, avatarStats(character.avatarId).Popsinger)

const setZanpakuto = (ctx: Context, values: Partial<typeof characterZanpakuto.$inferInsert>) =>
  ctx.tx
    .update(characterZanpakuto)
    .set(values)
    .where(eq(characterZanpakuto.characterId, ctx.character.id))

const setCrystal = (
  ctx: Context,
  id: string,
  values: Partial<typeof zanpakutoCrystals.$inferInsert>,
) => ctx.tx.update(zanpakutoCrystals).set(values).where(eq(zanpakutoCrystals.id, id))

const CURRENCY = {
  coupons: { column: 'giftCoupon', label: 'Coupons' },
  stones: { column: 'stone', label: 'Stones' },
} as const

/** Takes `amount` of a character currency, or refuses when there is too little. */
async function spend(ctx: Context, currency: keyof typeof CURRENCY, amount: number) {
  if (amount <= 0) return
  const { column, label } = CURRENCY[currency]
  if (ctx.character[column] < amount)
    throw bad('not_enough', `You need ${amount.toLocaleString('en-US')} ${label}.`)
  await ctx.tx
    .update(characters)
    .set({ [column]: sql`${characters[column]} - ${amount}` })
    .where(eq(characters.id, ctx.character.id))
}

/** Takes Spirit Coins (the caller then writes the rest of the row). */
function spendCoins(ctx: Context, amount: number) {
  if (ctx.state.coins < amount) throw bad('not_enough', `You need ${amount} SC.`)
  return ctx.state.coins - amount
}

function ownCrystal(ctx: Context, id: string): [CrystalRow, CrystalInfo] {
  const row = ctx.state.crystals.find((c) => c.id === id)
  if (!row) throw bad('no_crystal', 'That crystal is not yours.')
  return [row, crystalInfo(row.itemId)!]
}

function spiritCrystal(ctx: Context, id: string) {
  const found = ownCrystal(ctx, id)
  if (found[0].spiritSlot === null)
    throw bad('not_in_spirit', 'That crystal is not in your spirit inventory.')
  return found
}

/** Moves crystals by deleting and re-inserting them, so a swap never trips the unique slots. */
async function relocate(tx: Tx, moves: [CrystalRow, Partial<CrystalRow>][]) {
  await tx.delete(zanpakutoCrystals).where(
    inArray(
      zanpakutoCrystals.id,
      moves.map(([row]) => row.id),
    ),
  )
  await tx.insert(zanpakutoCrystals).values(moves.map(([row, place]) => ({ ...row, ...place })))
}

const inSpirit = (slot: number) => ({ spiritSlot: slot, tab: null, tabSlot: null })

export async function zanpakutoRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Runs `action` in a transaction under the character lock and answers with the new view. */
  const act =
    <T>(
      schema: { parse: (value: unknown) => T },
      action: (ctx: Context, body: T) => Promise<void>,
    ) =>
    async (request: FastifyRequest) => {
      const body = schema.parse(request.body)
      const userId = requireUser(request).id
      return db.transaction(async (tx) => {
        const character = await lockCharacter(tx, userId)
        requireLevel(character)
        await tx
          .insert(characterZanpakuto)
          .values({ characterId: character.id })
          .onConflictDoNothing()
        await action({ tx, character, state: await loadZanpakuto(tx, character.id) }, body)
        return viewOf(await loadZanpakuto(tx, character.id), character)
      })
    }
  const action = { config: { rateLimit: RATE_LIMITS.item } }

  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    requireLevel(character)
    return viewOf(await loadZanpakuto(db, character.id), character)
  })

  app.post(
    '/equip',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row, info] = spiritCrystal(ctx, id)
      const tabSlot = info.position - 1
      if (!weaponSlotOpen(tabSlot, ctx.state.impelDownMaxFloor))
        throw bad('slot_locked', `Clear ${25 * tabSlot} Impel Down floors to open that slot.`)
      const worn = ctx.state.crystals.find((c) => c.tab === info.tab && c.tabSlot === tabSlot)
      const moves: [CrystalRow, Partial<CrystalRow>][] = [
        [row, { spiritSlot: null, tab: info.tab, tabSlot }],
      ]
      await relocate(ctx.tx, worn ? [...moves, [worn, inSpirit(row.spiritSlot!)]] : moves)
    }),
  )

  app.post(
    '/unequip',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row] = ownCrystal(ctx, id)
      if (row.tab === null) throw bad('not_equipped', 'That crystal is not equipped.')
      const slot = freeSpiritSlot(ctx.state)
      if (slot === undefined) throw bad('inventory_full', 'Your spirit inventory is full.')
      await relocate(ctx.tx, [[row, inSpirit(slot)]])
    }),
  )

  app.post(
    '/sell',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row, info] = spiritCrystal(ctx, id)
      await ctx.tx.delete(zanpakutoCrystals).where(eq(zanpakutoCrystals.id, row.id))
      await setZanpakuto(ctx, { coins: ctx.state.coins + info.coins })
    }),
  )

  app.post(
    '/slots/unlock',
    action,
    act(zanpakutoSlotUnlockBodySchema, async (ctx, { slot, currency }) => {
      if (slot < FREE_SPIRIT_SLOTS || spiritSlotOpen(ctx.state, slot))
        throw new HttpError(409, 'already_unlocked', 'That slot is already unlocked.')
      await spend(ctx, currency, spiritSlotCost(slot)[currency])
      await setZanpakuto(ctx, {
        unlockedSlots: [...ctx.state.unlockedSlots, slot].sort((a, b) => a - b),
      })
    }),
  )

  app.post(
    '/attributes/unlock',
    action,
    act(zanpakutoAttributeBodySchema, async (ctx, { id, position }) => {
      const [row, info] = ownCrystal(ctx, id)
      if (row.stats.length !== position)
        throw bad(
          'bad_position',
          position === 1 ? 'That attribute is already active.' : 'Activate the second one first.',
        )
      await spend(ctx, 'coupons', ATTRIBUTE_UNLOCK_COUPONS[position])
      const [stat] = rollStats(info.category, 1, createRandom(newSeed()))
      await setCrystal(ctx, row.id, { stats: [...row.stats, stat!], bulkOptions: [] })
    }),
  )

  app.post(
    '/refine',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row, info] = ownCrystal(ctx, id)
      const used = refinesUsedToday(ctx.state)
      const coins = used < FREE_REFINES_PER_DAY ? ctx.state.coins : spendCoins(ctx, REFINE_COST_SC)
      await setZanpakuto(ctx, { coins, refineDay: utcDay(), refinesUsed: used + 1 })
      const stats = rollStats(info.category, row.stats.length, createRandom(newSeed()))
      await setCrystal(ctx, row.id, { stats, bulkOptions: [] })
    }),
  )

  app.post(
    '/bulk',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row, info] = ownCrystal(ctx, id)
      if (row.bulkOptions.length > 0) return
      const options = bulkOptions(info.category, row.stats.length, createRandom(newSeed()))
      await setCrystal(ctx, row.id, { bulkOptions: options })
    }),
  )

  app.post(
    '/bulk/refresh',
    action,
    act(zanpakutoCrystalBodySchema, async (ctx, { id }) => {
      const [row, info] = ownCrystal(ctx, id)
      const coins = spendCoins(ctx, BULK_REFRESH_COST.coins)
      await spend(ctx, 'stones', BULK_REFRESH_COST.stones)
      await setZanpakuto(ctx, { coins })
      const options = bulkOptions(info.category, row.stats.length, createRandom(newSeed()))
      await setCrystal(ctx, row.id, { bulkOptions: options })
    }),
  )

  app.post(
    '/bulk/apply',
    action,
    act(zanpakutoBulkApplyBodySchema, async (ctx, { id, index, locks }) => {
      const [row] = ownCrystal(ctx, id)
      const option = row.bulkOptions[index]
      if (!option) throw bad('no_option', 'Open Bulk Refine and pick an option first.')
      const valid =
        new Set(locks).size === locks.length &&
        locks.length < row.stats.length &&
        locks.every((lock) => lock < row.stats.length)
      if (!valid) throw bad('bad_locks', 'Those attributes cannot be locked.')
      const stats = applyBulkOption(row.stats, option, locks)
      if (!stats) throw bad('duplicate_stat', 'That option repeats a locked attribute.')
      const cost = bulkApplyCost(locks.length)
      const coins = spendCoins(ctx, cost.coins)
      await spend(ctx, 'stones', cost.stones)
      await setZanpakuto(ctx, { coins })
      await setCrystal(ctx, row.id, { stats, bulkOptions: [] })
    }),
  )
}

export default zanpakutoRoutes
