// Pet Reroll under /api/game/pet-reroll (Reborn's `rerollPet {targetIID, maxStones}`,
// reborn-windows-A-L.md "Reroll"). The pet item stays in the bag (Reborn parks it in slot 400);
// the server rolls with a fresh seed, takes the Stones and changes the item in one transaction:
// the character row is locked first, then the item row.
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { isRerollPet, REROLL_CONFIG, rerollUntil } from '../../../../game-core/src/pets/reroll.js'
import {
  petRerollSchema,
  type PetRerollOutcome,
} from '../../../../shared/src/schemas/pet-reroll.js'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import { bagItemsWhere, inventoryView } from '../../game/bag.js'
import { petSpecies } from '../../game/pets.js'
import { HttpError } from '../../http.js'
import { reloadCharacter } from '../game/actions.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

const bad = (code: string, message: string) => new HttpError(400, code, message)
const stones = (n: number) => n.toLocaleString('en-US')

/** A fresh crypto seed per press for the seeded game-core random. */
const random = () => createRandom(randomInt(2 ** 31))

export default async function petRerollRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post('/', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const { inventoryId, target, maxStones } = petRerollSchema.parse(request.body)
    if (!isRerollPet(target)) throw bad('bad_target', 'Choose a target pet from the list.')
    if (maxStones < REROLL_CONFIG.minStones)
      throw bad('low_budget', `Max Stones must be at least ${stones(REROLL_CONFIG.minStones)}.`)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const [row] = await tx
        .select()
        .from(inventoryItems)
        .where(and(bagItemsWhere(character.id), eq(inventoryItems.id, inventoryId)))
        .for('update')
      if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
      if (!petSpecies(row.itemId)) throw bad('not_pet', 'Only pets can be rerolled.')
      if (row.itemId === target) throw bad('already_target', 'Your pet is already the target.')
      const budget = Math.min(maxStones, character.stone)
      if (budget < REROLL_CONFIG.stonesPerRoll)
        throw bad(
          'not_enough_currency',
          `You need ${stones(REROLL_CONFIG.stonesPerRoll)} Stone for a reroll.`,
        )
      const outcome: PetRerollOutcome = rerollUntil(row.itemId, target, budget, random())
      await tx
        .update(characters)
        .set({ stone: character.stone - outcome.spent })
        .where(eq(characters.id, character.id))
      await tx
        .update(inventoryItems)
        .set({ itemId: outcome.itemId })
        .where(eq(inventoryItems.id, row.id))
      const fresh = await reloadCharacter(tx, character.id)
      return { character: fresh, ...(await inventoryView(tx, fresh)), reroll: outcome }
    })
  })
}
