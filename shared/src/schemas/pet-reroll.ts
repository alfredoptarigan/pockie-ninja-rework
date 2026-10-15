// Pet Reroll API (server/src/modules/pet-reroll). Rules and config live in
// game-core/src/pets/reroll.ts.
import { z } from 'zod'

const MAX_STONES = 100_000

export const petRerollSchema = z
  .object({
    /** The pet item in the bag. */
    inventoryId: z.uuid(),
    /** The pet wanted (a REROLL_CONFIG.pets item id). */
    target: z.string().regex(/^i\d+$/),
    /** The most Stones this press may spend. */
    maxStones: z.number().int().min(0).max(MAX_STONES),
  })
  .strict()

export interface PetRerollOutcome {
  itemId: string
  rolls: number
  spent: number
  hit: boolean
}
