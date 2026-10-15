// Energy (Reborn's VP, shared/src/schemas/energy.ts). The state lives in characters.energy as
// {current, day, refills, items}; the daily restore is applied lazily when the state is read on a
// new UTC day, so no job ticks it. Every write runs under the caller's character row lock.
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  ENERGY_RULES,
  REBORN_SERVER_PLACEHOLDERS,
  energyRefillCost,
  type EnergyView,
} from '../../../../shared/src/schemas/energy.js'
import { characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { isVip } from '../../game/vip.js'
import { HttpError } from '../../http.js'

type CharacterRow = typeof characters.$inferSelect
const bad = (code: string, message: string) => new HttpError(400, code, message)
const utcDay = (now: Date) => now.toISOString().slice(0, 10)

const count = z.number().int().nonnegative()
const stateSchema = z.object({
  current: count,
  /** The UTC day the counters below belong to. */
  day: z.string(),
  refills: count,
  /** Energy item uses on `day`, by item id. */
  items: z.record(z.string(), count),
})
export type EnergyState = z.infer<typeof stateSchema>

type EnergyHolder = Pick<CharacterRow, 'energy' | 'vipUntil'>

/** The stored state with today's restore applied; a missing or broken one starts full. */
export function energyState(row: EnergyHolder, now = new Date()): EnergyState {
  const today = utcDay(now)
  const parsed = stateSchema.safeParse(row.energy)
  if (!parsed.success) {
    return {
      current: REBORN_SERVER_PLACEHOLDERS.energy.startEnergy,
      day: today,
      refills: 0,
      items: {},
    }
  }
  const state = parsed.data
  if (state.day >= today) return state
  const restore = isVip(row, now) ? ENERGY_RULES.vipDailyRestore : ENERGY_RULES.dailyRestore
  return {
    current: Math.min(ENERGY_RULES.max, state.current + restore),
    day: today,
    refills: 0,
    items: {},
  }
}

export function energyView(row: EnergyHolder, now = new Date()): EnergyView {
  const state = energyState(row, now)
  return { current: state.current, max: ENERGY_RULES.max, refillsToday: state.refills }
}

const save = (tx: Tx, characterId: string, state: EnergyState) =>
  tx.update(characters).set({ energy: state }).where(eq(characters.id, characterId))

/** Pays `amount` energy (a field fight, a chain attack's monsters), or a 400 without it. */
export async function spendEnergy(tx: Tx, character: CharacterRow, amount: number) {
  const state = energyState(character)
  if (state.current < amount) {
    throw bad(
      'no_energy',
      amount === 1
        ? 'Not enough energy. No energy left.'
        : `Not enough energy. You need ${amount} energy but only have ${state.current}.`,
    )
  }
  await save(tx, character.id, { ...state, current: state.current - amount })
}

/** Reborn's `refillEnergy`: back to full for 35 x 2^refillsToday Gold. */
export async function refillEnergy(tx: Tx, character: CharacterRow) {
  const state = energyState(character)
  const missing = ENERGY_RULES.max - state.current
  if (missing <= 0) throw bad('energy_full', 'Your energy is already full!')
  const cost = energyRefillCost(missing, state.refills)
  if (character.gold < cost) throw bad('not_enough', 'Not enough gold.')
  await tx
    .update(characters)
    .set({
      gold: sql`${characters.gold} - ${cost}`,
      energy: { ...state, current: ENERGY_RULES.max, refills: state.refills + 1 },
    })
    .where(eq(characters.id, character.id))
  return missing
}

/** An energy item (our `SP`, Reborn's `energy`): `amount` back, 3 uses a day per item. */
export async function drinkEnergyItem(
  tx: Tx,
  character: CharacterRow,
  itemId: string,
  amount: number,
) {
  const state = energyState(character)
  const used = state.items[itemId] ?? 0
  if (used >= ENERGY_RULES.itemDailyLimit) {
    throw bad(
      'daily_limit',
      `You can use this item ${ENERGY_RULES.itemDailyLimit} times a day. Try again tomorrow.`,
    )
  }
  if (state.current >= ENERGY_RULES.max) throw bad('energy_full', 'Your energy is already full!')
  await save(tx, character.id, {
    ...state,
    current: Math.min(ENERGY_RULES.max, state.current + amount),
    items: { ...state.items, [itemId]: used + 1 },
  })
}
