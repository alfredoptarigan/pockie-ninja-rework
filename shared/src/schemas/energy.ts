// Energy (the portrait's VP bar) and Battle Power (reborn-windows-M-Z-hud.md "Player portrait
// card", "VP Refill / Energy Refill", "Monster cards row"; reborn-windows-A-L.md "Chain Attack").
// POST /api/game/energy/refill; the character carries its energy, GET /character `stats` its BP.
import type { Character } from './game.js'

/**
 * Reborn's client: 200 max (portrait "cur/200", Energy Refill), a field fight needs energy > 0 and
 * a chain attack 1 per monster ("You need N energy but only have M"); Energy Refill fills to full
 * for 35 x 2^refillsToday Gold (`Vg`); the VIP perk reads "200 VP daily restore (instead of 100)";
 * energy items (json_items 160001-160005 `energy`, our `SP`) are limited to 3 uses a day each.
 */
export const ENERGY_RULES = {
  max: 200,
  fieldFightCost: 1,
  chainCostPerMonster: 1,
  refillBaseGold: 35,
  dailyRestore: 100,
  vipDailyRestore: 200,
  itemDailyLimit: 3,
} as const

/**
 * PLACEHOLDER: Reborn keeps these on its server and our data has nothing on them. Confirm with the
 * user:
 * - energy: a new ninja's energy (existing ninjas start with it too). Rules in code, not values:
 *   the daily restore and the refill count reset at 00:00 UTC (Reborn: midnight Lisbon); the
 *   restore is added once on a new day, capped at the max, with no catch-up for missed days
 *   (2011 EnergySystem.java); a field fight costs its energy win or lose; a chain attack pays
 *   every monster at Begin and refunds none when it stops at a loss.
 * - battlePower: Reborn's server sends `stats.bp` with no formula in its client, so ours is a
 *   weighted sum of the fighter's totals (see battlePower below).
 */
export const REBORN_SERVER_PLACEHOLDERS = {
  energy: {
    startEnergy: 200,
  },
  battlePower: {
    maxHp: 0.2,
    maxMp: 0.2,
    /** Per point of min plus max attack. */
    attack: 2,
    defense: 0.5,
    /** Per point of hit, dodge, crit, parry, pierce, tough, counter and defense break. */
    secondary: 2,
    /** Strength, agility and stamina are stored x100: 0.01 is 1 per whole point. */
    baseStat: 0.01,
  },
} as const

/** Energy as the HUD and the Energy Refill window show it (Reborn's `character.energy`). */
export interface EnergyView {
  current: number
  max: number
  refillsToday: number
}

/** Reborn's `Vg(missing, n)`: 0 when full, else 35 x 2^n Gold, whatever is missing. */
export const energyRefillCost = (missing: number, refillsToday: number) =>
  missing <= 0 ? 0 : ENERGY_RULES.refillBaseGold * 2 ** refillsToday

/** POST /api/game/energy/refill: the energy restored and the updated ninja. */
export interface EnergyRefillResult {
  restored: number
  character: Character
}

/** The fighter totals Battle Power is computed from. */
export interface BattlePowerStats {
  strength: number
  agility: number
  stamina: number
  maxHp: number
  maxMp: number
  minAttack: number
  maxAttack: number
  defense: number
  hit: number
  dodge: number
  crit: number
  parry: number
  pierce: number
  tough: number
  counter: number
  neglectDefense: number
}

/** PLACEHOLDER formula (REBORN_SERVER_PLACEHOLDERS.battlePower): one number for the HUD. */
export function battlePower(stats: BattlePowerStats) {
  const w = REBORN_SERVER_PLACEHOLDERS.battlePower
  const secondary =
    stats.hit +
    stats.dodge +
    stats.crit +
    stats.parry +
    stats.pierce +
    stats.tough +
    stats.counter +
    stats.neglectDefense
  return Math.max(
    0,
    Math.round(
      stats.maxHp * w.maxHp +
        stats.maxMp * w.maxMp +
        (stats.minAttack + stats.maxAttack) * w.attack +
        stats.defense * w.defense +
        secondary * w.secondary +
        (stats.strength + stats.agility + stats.stamina) * w.baseStat,
    ),
  )
}
