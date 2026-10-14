// Pet EXP (decisions 10 and 12). The 2011 home server that levelled pets is not decompiled, so
// `PetExp[L]` is read like the player table: the EXP to go from level L to L + 1 (ours).
import data from '../../../server/data/game/reborn/pet-foods.json'
import { gainExp } from '../progression.js'
import { PET_EXP_SHARE_PERCENT, PET_MAX_LEVEL } from './constants.js'

/** gainExp's shape: the cost to reach level n is `PetExp[n - 1]`. */
const COST_TO_REACH = Object.fromEntries(data.exp.map((cost, i) => [String(i + 2), cost]))

/** Adds EXP; the pet stops at `PET_MAX_LEVEL` and at its master's level, keeping the rest. */
export const petLevelFromExp = (level: number, exp: number, gained: number, masterLevel: number) =>
  gainExp(level, exp, gained, COST_TO_REACH, Math.min(PET_MAX_LEVEL, masterLevel))

/** Decision 12: the active pet's share of the master's field, toll gate and Las Noches EXP. */
export const petExpShare = (masterExp: number) =>
  Math.trunc((masterExp * PET_EXP_SHARE_PERCENT) / 100)
