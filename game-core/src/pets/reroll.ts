// Pet Reroll (Reborn's "Reroll" window `ic`, reborn-windows-A-L.md "Reroll"): a pet item becomes
// another pet of the Reroll list at random, paid in Stones, until it is the chosen Target or the
// player's Max Stones budget runs out. The server rolls; the client uses the limits for its hints.
import type { Random } from '../random.js'

/**
 * Every Reroll value in one place.
 *
 * SPEC = read from Reborn's client or serverConfig.json. PLACEHOLDER = Reborn keeps the value on
 * its server; ours is a guess the product owner must confirm.
 */
export const REROLL_CONFIG = {
  /** SPEC: serverConfig.json `reroll.pets`, the pets a reroll can turn into (and the targets). */
  pets: [
    'i320002',
    'i320003',
    'i320006',
    'i320008',
    'i320015',
    'i320016',
    'i320017',
    'i320018',
    'i320019',
    'i320025',
    'i320026',
    'i320027',
    'i320028',
    'i320029',
    'i320030',
    'i320031',
    'i320033',
  ],
  /** SPEC: the Max Stones input defaults to 1500 and Reroll is disabled below it. */
  minStones: 1500,
  /** SPEC: the Max Stones input stops at 100,000. */
  maxStones: 100_000,
  /**
   * PLACEHOLDER: Stones per roll. Reborn's server charges an unknown price; we charge the
   * client's minimum budget, so the default budget buys exactly one roll.
   */
  stonesPerRoll: 1500,
} as const

export type RerollPet = (typeof REROLL_CONFIG.pets)[number]

export const isRerollPet = (itemId: string): itemId is RerollPet =>
  (REROLL_CONFIG.pets as readonly string[]).includes(itemId)

export interface RerollOutcome {
  /** The pet after the last roll (the input pet when no roll was affordable). */
  itemId: string
  rolls: number
  spent: number
  /** The last roll landed on the target. */
  hit: boolean
}

/**
 * One roll: a listed pet other than `current`, uniformly. PLACEHOLDER odds: Reborn's are
 * server-side; ours make every listed pet equally likely and each roll change the pet.
 */
export function rollPet(current: string, random: Random) {
  const pool = REROLL_CONFIG.pets.filter((pet) => pet !== current)
  return pool[random.int(pool.length)]!
}

/**
 * Rolls `current` until it is `target` or the next roll would cost more than `budget` Stones.
 * `budget` is the smaller of Max Stones and the Stones the player holds.
 */
export function rerollUntil(
  current: string,
  target: string,
  budget: number,
  random: Random,
  cost: number = REROLL_CONFIG.stonesPerRoll,
): RerollOutcome {
  let itemId = current
  let rolls = 0
  while ((rolls + 1) * cost <= budget && itemId !== target) {
    itemId = rollPet(itemId, random)
    rolls++
  }
  return { itemId, rolls, spent: rolls * cost, hit: rolls > 0 && itemId === target }
}
