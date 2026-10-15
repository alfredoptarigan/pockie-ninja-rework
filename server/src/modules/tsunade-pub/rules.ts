// Tsunade Pub rules: tier rolls, the wheel, a spin with its bonus / guaranteed / Valhalla rolls.
// Pure given a seeded Random (the routes seed it per request, like the dungeons).
import type { Random } from '@pockie/game-core'
import {
  PUB_RARITIES,
  TSUNADE_PUB_RULES,
  type PubPrize,
  type PubRarity,
} from '../../../../shared/src/schemas/tsunade-pub.js'
import { identifiableItemIds, item } from '../../game/data.js'
import { equipConfigOf } from '../../game/gear.js'
import { TSUNADE_PUB_PLACEHOLDERS as PLACEHOLDERS } from './config.js'

const RULES = TSUNADE_PUB_RULES
const rank = (rarity: PubRarity) => PUB_RARITIES.indexOf(rarity)

/** One tier by the tier weights. */
export function rollTier(random: Random): PubRarity {
  const weights = PUB_RARITIES.map((rarity) => PLACEHOLDERS.tierWeights[rarity])
  let roll = random.next() * weights.reduce((sum, weight) => sum + weight, 0)
  return PUB_RARITIES.find((_, i) => (roll -= weights[i]!) < 0) ?? 'common'
}

/** A prize of `tier`, uniformly from its pool. */
export function pickPrize(tier: PubRarity, random: Random): PubPrize {
  const pool = PLACEHOLDERS.prizes[tier]
  const { itemId, amount } = pool[random.int(pool.length)]!
  return { itemId, amount, rarity: tier }
}

/** A fresh wheel: every slot rolls its tier and prize. */
export const makeBoard = (random: Random) =>
  Array.from({ length: RULES.boardSlots }, () => pickPrize(rollTier(random), random))

/**
 * The tier of spin number `spin` (1-based, over all spins): every 100th is legendary, every 5th
 * is a bonus roll that keeps the better of two tiers.
 */
export function spinTier(spin: number, random: Random): PubRarity {
  if (spin % RULES.guaranteedEvery === 0) return 'legendary'
  const first = rollTier(random)
  if (spin % RULES.bonusEvery !== 0) return first
  const second = rollTier(random)
  return rank(second) > rank(first) ? second : first
}

/** Spins left until the next multiple of `every` (5 / 100), 1 to `every`. */
export const rollsUntil = (spins: number, every: number) => every - (spins % every)

let gear: { itemId: string; level: number }[] | undefined
/**
 * Valhalla gear for a ninja of `level`: equipment of its ten-level band (51-60 for 51-60) that
 * it can wear (UseLevel at or under its level).
 * ponytail: Reborn's Valhalla is a named orange set; ours is any 2011 gear of that band with all
 * its refinement lines rolled. Add a real set when one exists.
 */
export function valhallaPool(level: number) {
  gear ??= identifiableItemIds().flatMap((itemId) => {
    const config = equipConfigOf(itemId)
    const useLevel = Number(config?.UseLevel ?? 0)
    const wing = item(itemId)?.EquipType === 'Wing'
    return config && useLevel > 0 && !wing ? [{ itemId, level: useLevel }] : []
  })
  const bandStart = Math.floor((level - 1) / 10) * 10 + 1
  return gear.filter((g) => g.level >= bandStart && g.level <= level).map((g) => g.itemId)
}

const unbound = (random: Random) => random.next() * 100 < RULES.unboundChance

/**
 * Spin number `spins + 1` on `board`: the prize lands in a random slot of the wheel, Valhalla
 * gear may come on top, and the next wheel is rolled.
 */
export function spin(board: readonly PubPrize[], spins: number, level: number, random: Random) {
  const won = pickPrize(spinTier(spins + 1, random), random)
  const prize: PubPrize = { ...won, bound: !unbound(random) }
  const winningIndex = random.int(RULES.boardSlots)
  const currentBoard = Array.from({ length: RULES.boardSlots }, (_, i) =>
    i === winningIndex ? won : (board[i] ?? won),
  )
  const pool = random.next() * 100 < RULES.valhallaChance ? valhallaPool(level) : []
  const extra: PubPrize | null = pool.length
    ? {
        itemId: pool[random.int(pool.length)]!,
        amount: 1,
        rarity: PLACEHOLDERS.valhallaRarity,
        bound: !unbound(random),
        valhalla: true,
      }
    : null
  return { prize, winningIndex, currentBoard, extra, newBoard: makeBoard(random) }
}

/** Stone for selling a prize: the item's shop price x amount, else the tier's placeholder. */
export function sellValue(prize: PubPrize) {
  const def = item(prize.itemId)
  const price = (Number(def?.CanTrade ?? 0) & 1) !== 0 ? Number(def?.Price ?? 0) : 0
  return price > 0 ? price * prize.amount : PLACEHOLDERS.sellStone[prize.rarity]
}
