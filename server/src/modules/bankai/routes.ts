// Bankai under /api/game/bankai (Reborn bottom menu, level 30): unlock, upgrade, activate, forms
// and stat swaps of the three weapons; ring, move, devour, absorb and sell crystals; buy crystal
// cells. Every action locks the character row first (currency and cells change under it), checks
// inside the transaction, and answers with the whole view.
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  bankaiForms,
  canUnlockWeapon,
  CRYSTAL_INVENTORY_FREE,
  CRYSTAL_INVENTORY_SLOTS,
  CRYSTAL_QUALITY_INFO,
  crystalFoodXp,
  feedCrystal,
  inventorySlotCost,
  ringSlotUnlocked,
  upgradeWeapon,
  WEAPON_MAX_LEVEL,
  type BankaiWeapon,
  type CrystalQuality,
} from '../../../../game-core/src/bankai/bankai.js'
import {
  bankaiFormBodySchema,
  bankaiStatSwapBodySchema,
  bankaiWeaponBodySchema,
  crystalAbsorbBodySchema,
  crystalDevourBodySchema,
  crystalIdBodySchema,
  crystalMoveBodySchema,
  crystalRingBodySchema,
  crystalSlotUnlockBodySchema,
  type CrystalPlace,
} from '../../../../shared/src/schemas/bankai.js'
import type { Db } from '../../db/client.js'
import { bankaiCrystals, bankaiWeapons, characterBankai, characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bankaiView,
  inventorySlotOpen,
  loadBankai,
  WEAPON_NAMES,
  type BankaiState,
  type CrystalRow,
} from './view.js'

/** Reborn's bottom-menu gate for the Bankai window. */
export const BANKAI_LEVEL = 30

type Character = typeof characters.$inferSelect
interface Context {
  tx: Tx
  character: Character
  state: BankaiState
}

const bad = (code: string, message: string) => new HttpError(400, code, message)

function requireLevel(character: Pick<Character, 'level'>) {
  if (character.level < BANKAI_LEVEL)
    throw new HttpError(403, 'level_too_low', `Bankai opens at level ${BANKAI_LEVEL}.`)
}

const setBankai = (ctx: Context, values: Partial<typeof characterBankai.$inferInsert>) =>
  ctx.tx
    .update(characterBankai)
    .set(values)
    .where(eq(characterBankai.characterId, ctx.character.id))

function weaponRow(ctx: Context, weapon: BankaiWeapon) {
  const row = ctx.state.weapons.find((w) => w.weapon === weapon)
  if (!row) throw bad('not_unlocked', `Unlock ${WEAPON_NAMES[weapon]} first.`)
  return row
}

const crystalAt = (state: BankaiState, place: CrystalPlace) =>
  state.crystals.find((c) =>
    place.type === 'inventory'
      ? c.inventorySlot === place.index
      : c.weapon === place.weapon && c.ringSlot === place.slot,
  )

function placeOpen(state: BankaiState, place: CrystalPlace) {
  if (place.type === 'inventory') return inventorySlotOpen(state, place.index)
  const level = state.weapons.find((w) => w.weapon === place.weapon)?.level ?? 0
  return ringSlotUnlocked(place.slot, level)
}

const placement = (place: CrystalPlace) =>
  place.type === 'inventory'
    ? { inventorySlot: place.index, weapon: null, ringSlot: null }
    : { inventorySlot: null, weapon: place.weapon, ringSlot: place.slot }

/** Moves crystals by deleting and re-inserting them, so a swap never trips the unique cells. */
async function relocate(tx: Tx, moves: [CrystalRow, CrystalPlace][]) {
  const ids = moves.map(([row]) => row.id)
  await tx.delete(bankaiCrystals).where(inArray(bankaiCrystals.id, ids))
  await tx
    .insert(bankaiCrystals)
    .values(moves.map(([row, place]) => ({ ...row, ...placement(place) })))
}

function inventoryCrystal(state: BankaiState, id: string, code = 'no_crystal') {
  const row = state.crystals.find((c) => c.id === id && c.inventorySlot !== null)
  if (!row) throw bad(code, 'That crystal is not in your crystal inventory.')
  return row
}

/** Devour and absorb: the foods' XP levels the target up; the foods are used up. */
async function feed(ctx: Context, target: CrystalRow, foods: CrystalRow[]) {
  const quality = target.quality as CrystalQuality
  if (target.level >= CRYSTAL_QUALITY_INFO[quality].maxLevel)
    throw bad('max_level', 'That crystal is already at its maximum level.')
  const xpGained = foods.reduce(
    (sum, food) => sum + crystalFoodXp(food.quality as CrystalQuality, food.level),
    0,
  )
  const result = feedCrystal({ quality, level: target.level, exp: target.exp }, xpGained)
  await ctx.tx.update(bankaiCrystals).set(result).where(eq(bankaiCrystals.id, target.id))
  await ctx.tx.delete(bankaiCrystals).where(
    inArray(
      bankaiCrystals.id,
      foods.map((food) => food.id),
    ),
  )
  return { xpGained, targetLevel: result.level }
}

const CURRENCY = {
  coupons: { column: 'giftCoupon', label: 'Coupons' },
  stones: { column: 'stone', label: 'Stones' },
  gold: { column: 'gold', label: 'Gold' },
} as const

export async function bankaiRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Runs `action` in a transaction under the character lock and answers with the new view. */
  const act =
    <T>(parse: (body: unknown) => T, action: (ctx: Context, body: T) => Promise<object | void>) =>
    async (request: FastifyRequest) => {
      const body = parse(request.body)
      const userId = requireUser(request).id
      return db.transaction(async (tx) => {
        const character = await lockCharacter(tx, userId)
        requireLevel(character)
        await tx.insert(characterBankai).values({ characterId: character.id }).onConflictDoNothing()
        const state = await loadBankai(tx, character.id)
        const extra = await action({ tx, character, state }, body)
        return { ...extra, ...bankaiView(await loadBankai(tx, character.id), character.level) }
      })
    }
  const parser =
    <T>(schema: { parse: (value: unknown) => T }) =>
    (body: unknown) =>
      schema.parse(body)
  const action = { config: { rateLimit: RATE_LIMITS.item } }
  const move = { config: { rateLimit: RATE_LIMITS.bagMove } }

  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    requireLevel(character)
    return bankaiView(await loadBankai(db, character.id), character.level)
  })

  app.post(
    '/unlock',
    action,
    act(parser(bankaiWeaponBodySchema), async (ctx, { weapon }) => {
      if (ctx.state.weapons.some((w) => w.weapon === weapon))
        throw new HttpError(409, 'already_unlocked', `${WEAPON_NAMES[weapon]} is already unlocked.`)
      const levels = Object.fromEntries(ctx.state.weapons.map((w) => [w.weapon, w.level]))
      if (!canUnlockWeapon(weapon, ctx.character.level, levels))
        throw bad('locked', `${WEAPON_NAMES[weapon]} is still locked.`)
      await ctx.tx.insert(bankaiWeapons).values({ characterId: ctx.character.id, weapon })
    }),
  )

  app.post(
    '/upgrade',
    action,
    act(parser(bankaiWeaponBodySchema), async (ctx, { weapon }) => {
      const row = weaponRow(ctx, weapon)
      if (row.level >= WEAPON_MAX_LEVEL) throw bad('max_level', 'Max Level')
      if (ctx.state.expPool <= 0) throw bad('no_exp', 'Your Bankai EXP pool is empty.')
      const result = upgradeWeapon(row, ctx.state.expPool)
      await ctx.tx
        .update(bankaiWeapons)
        .set({ level: result.level, exp: result.exp })
        .where(
          and(eq(bankaiWeapons.characterId, ctx.character.id), eq(bankaiWeapons.weapon, weapon)),
        )
      await setBankai(ctx, { expPool: ctx.state.expPool - result.spent })
    }),
  )

  app.post(
    '/activate',
    action,
    act(parser(bankaiWeaponBodySchema), async (ctx, { weapon }) => {
      weaponRow(ctx, weapon)
      await setBankai(ctx, { activeWeapon: weapon })
    }),
  )

  app.post(
    '/form',
    action,
    act(parser(bankaiFormBodySchema), async (ctx, { weapon, form }) => {
      const row = weaponRow(ctx, weapon)
      if (form > bankaiForms(row.level))
        throw bad('form_locked', `Form ${form} opens at a higher Bankai level.`)
      await ctx.tx
        .update(bankaiWeapons)
        .set({ form })
        .where(
          and(eq(bankaiWeapons.characterId, ctx.character.id), eq(bankaiWeapons.weapon, weapon)),
        )
    }),
  )

  app.post(
    '/stat-swap',
    action,
    act(parser(bankaiStatSwapBodySchema), async (ctx, { stat }) => {
      const swaps = ctx.state.statSwaps.includes(stat)
        ? ctx.state.statSwaps.filter((s) => s !== stat)
        : [...ctx.state.statSwaps, stat]
      await setBankai(ctx, { statSwaps: swaps })
    }),
  )

  app.post(
    '/crystals/move',
    move,
    act(parser(crystalMoveBodySchema), async (ctx, { from, to }) => {
      const source = crystalAt(ctx.state, from)
      if (!source) throw bad('no_crystal', 'There is no crystal there.')
      if (!placeOpen(ctx.state, to)) throw bad('slot_locked', 'That slot is locked.')
      const target = crystalAt(ctx.state, to)
      if (target?.id === source.id) return
      await relocate(
        ctx.tx,
        target
          ? [
              [source, to],
              [target, from],
            ]
          : [[source, to]],
      )
    }),
  )

  app.post(
    '/crystals/unequip',
    move,
    act(parser(crystalRingBodySchema), async (ctx, { weapon, slot }) => {
      const source = crystalAt(ctx.state, { type: 'ring', weapon, slot })
      if (!source) throw bad('no_crystal', 'There is no crystal there.')
      const free = Array.from({ length: CRYSTAL_INVENTORY_SLOTS }, (_, i) => i).find(
        (i) =>
          inventorySlotOpen(ctx.state, i) && !crystalAt(ctx.state, { type: 'inventory', index: i }),
      )
      if (free === undefined) throw bad('inventory_full', 'Your crystal inventory is full.')
      await relocate(ctx.tx, [[source, { type: 'inventory', index: free }]])
    }),
  )

  app.post(
    '/crystals/devour',
    action,
    act(parser(crystalDevourBodySchema), async (ctx, { targetId, foodIds }) => {
      const target = inventoryCrystal(ctx.state, targetId)
      if (foodIds.includes(targetId) || new Set(foodIds).size !== foodIds.length)
        throw bad('bad_food', 'A crystal cannot be devoured into itself or twice.')
      const foods = foodIds.map((id) => inventoryCrystal(ctx.state, id, 'bad_food'))
      return feed(ctx, target, foods)
    }),
  )

  app.post(
    '/crystals/absorb',
    action,
    act(parser(crystalAbsorbBodySchema), async (ctx, { weapon, slot, foodId }) => {
      const target = crystalAt(ctx.state, { type: 'ring', weapon, slot })
      if (!target) throw bad('no_crystal', 'There is no crystal in that slot.')
      return feed(ctx, target, [inventoryCrystal(ctx.state, foodId, 'bad_food')])
    }),
  )

  app.post(
    '/crystals/sell',
    action,
    act(parser(crystalIdBodySchema), async (ctx, { id }) => {
      const row = inventoryCrystal(ctx.state, id)
      await ctx.tx.delete(bankaiCrystals).where(eq(bankaiCrystals.id, row.id))
      const price = CRYSTAL_QUALITY_INFO[row.quality as CrystalQuality].price
      await setBankai(ctx, { coins: ctx.state.coins + price })
    }),
  )

  app.post(
    '/slots/unlock',
    action,
    act(parser(crystalSlotUnlockBodySchema), async (ctx, { slot, payWith }) => {
      if (slot < CRYSTAL_INVENTORY_FREE || inventorySlotOpen(ctx.state, slot))
        throw new HttpError(409, 'already_unlocked', 'That slot is already unlocked.')
      const cost = inventorySlotCost(slot)[payWith]
      const { column, label } = CURRENCY[payWith]
      if (ctx.character[column] < cost) throw bad('not_enough', `You need ${cost} ${label}.`)
      await ctx.tx
        .update(characters)
        .set({ [column]: sql`${characters[column]} - ${cost}` })
        .where(eq(characters.id, ctx.character.id))
      await setBankai(ctx, {
        unlockedSlots: [...ctx.state.unlockedSlots, slot].sort((a, b) => a - b),
      })
    }),
  )
}

export default bankaiRoutes
