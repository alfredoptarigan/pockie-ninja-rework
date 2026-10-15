// Collection under /api/game/collection: the Avatars / Pets / Gear Sets view and Submit (Reborn's
// `collectItem`). Submit locks the character row, then the copy's row, checks inside, records the
// entry once (primary key) and destroys the copy. The Wings tab stays on /api/game/wings.
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  collectionSubmitSchema,
  type CollectionCandidate,
  type CollectionKind,
  type CollectionView,
  type StatTriple,
} from '../../../../shared/src/schemas/collection.js'
import type { Db } from '../../db/client.js'
import { characterCollection, characterPets, inventoryItems } from '../../db/schema.js'
import { unequippedBagItemsWhere } from '../../game/bag.js'
import {
  collectedOf,
  collectionData,
  collectionTotals,
  gearEntry,
  gearEntryOf,
  petFamily,
} from '../../game/collection.js'
import { itemNameKey } from '../../game/data.js'
import { outfitOf } from '../../game/outfit.js'
import { petAvatar, petSpecies } from '../../game/pets.js'
import { consumeOne, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { lockPet } from '../pets/kennel.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

type ItemRow = typeof inventoryItems.$inferSelect
type PetRow = typeof characterPets.$inferSelect

/** Reborn's avatarSelect: only outfits at +2 or more count as spare copies. */
const MIN_OUTFIT_PLUS = 2

let outfitClothings: Set<number> | undefined
const isCollectionOutfit = (clothing: number) =>
  (outfitClothings ??= new Set(
    collectionData().avatars.flatMap((rarity) => rarity.outfits.map(([c]) => c)),
  )).has(clothing)

/**
 * The entry a bag row can be submitted for, or undefined. Bag rows only (not worn, not in the
 * Wardrobe or Market), never locked ones. Gear needs Reborn's refine lines and no gems.
 */
function entryOf(kind: CollectionKind, row: ItemRow): string | undefined {
  if (row.location !== 'bag' || row.equippedSlot || row.locked) return undefined
  if (kind === 'outfit') {
    const outfit = outfitOf(row.itemId)
    return outfit && outfit.plus >= MIN_OUTFIT_PLUS && isCollectionOutfit(outfit.clothing)
      ? String(outfit.clothing)
      : undefined
  }
  if (kind === 'pet') return petFamily(row.itemId)
  const lines = collectionData().gearSets.requiredLines
  if (row.props.length < lines || row.gems.some(Boolean)) return undefined
  return gearEntryOf(row.itemId)
}

/** Any kennel pet but the active one counts for its family. */
const kennelEntryOf = (pet: PetRow) => (pet.active ? undefined : petFamily(pet.species))

const bagCandidate = (row: ItemRow, kind: CollectionKind): CollectionCandidate => ({
  id: row.id,
  source: 'bag',
  itemId: row.itemId,
  nameKey: itemNameKey(row.itemId),
  level:
    kind === 'outfit' ? (outfitOf(row.itemId)?.plus ?? 0) : kind === 'pet' ? 1 : row.enhanceLevel,
})

async function collectionView(tx: Tx | Db, characterId: string): Promise<CollectionView> {
  const rows = await tx.select().from(inventoryItems).where(unequippedBagItemsWhere(characterId))
  const pets = await tx
    .select()
    .from(characterPets)
    .where(eq(characterPets.characterId, characterId))
  const candidates = new Map<string, CollectionCandidate[]>()
  const push = (kind: CollectionKind, entry: string | undefined, c: CollectionCandidate) => {
    if (!entry) return
    const key = `${kind}/${entry}`
    candidates.set(key, [...(candidates.get(key) ?? []), c])
  }
  for (const row of rows)
    for (const kind of ['outfit', 'pet', 'gear'] as const)
      push(kind, entryOf(kind, row), bagCandidate(row, kind))
  for (const pet of pets)
    push('pet', kennelEntryOf(pet), {
      id: pet.id,
      source: 'kennel',
      itemId: pet.species,
      nameKey: itemNameKey(pet.species),
      level: pet.level,
    })
  const spare = (kind: CollectionKind, entry: string) =>
    (candidates.get(`${kind}/${entry}`) ?? []).sort((a, b) => a.level - b.level)

  const collected = await collectedOf(tx, characterId)
  const totals = collectionTotals(collected)
  const data = collectionData()
  return {
    outfits: {
      ...totals.outfits.totals,
      rarities: data.avatars.map((rarity, index) => ({
        id: rarity.id,
        milestones: totals.outfits.lists[index]!,
        entries: rarity.outfits.map(([clothing, ...stats]) => ({
          clothing,
          stats: stats as StatTriple,
          collected: collected.outfit.has(String(clothing)),
          candidates: spare('outfit', String(clothing)),
        })),
      })),
    },
    pets: {
      ...totals.pets.totals,
      natures: data.pets.map((nature, index) => ({
        nature: nature.nature,
        milestones: totals.pets.lists[index]!,
        entries: nature.families.map(([family, ...stats]) => ({
          family,
          nameKey: itemNameKey(family),
          avatar: petAvatar(petSpecies(family)!),
          stats: stats as StatTriple,
          collected: collected.pet.has(family),
          candidates: spare('pet', family),
        })),
      })),
    },
    gear: {
      ...totals.gear.totals,
      requiredLines: data.gearSets.requiredLines,
      piece: data.gearSets.piece,
      complete: data.gearSets.complete,
      tiers: data.gearSets.tiers.map((tier, index) => ({
        label: tier.label,
        milestones: totals.gear.lists[index]!,
        sets: tier.sets.map((set) => ({
          id: set.id,
          pieces: Object.entries(set.slots).map(([slot, ids]) => {
            const entry = gearEntry(set.id, slot)
            return {
              slot,
              itemId: ids[0]!,
              nameKey: itemNameKey(ids[0]!),
              collected: collected.gear.has(entry),
              candidates: spare('gear', entry),
            }
          }),
        })),
      })),
    },
  }
}

const notSpare = () =>
  new HttpError(400, 'not_eligible', 'That copy cannot be submitted to the Collection.')

export async function collectionRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    collectionView(db, (await characterOf(db, requireUser(request).id)).id),
  )

  app.post('/submit', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const body = collectionSubmitSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      let entry: string | undefined
      let destroy: () => Promise<unknown>
      if (body.source === 'kennel') {
        const pet = await lockPet(tx, character.id, body.id)
        entry = kennelEntryOf(pet)
        if (pet.active) throw new HttpError(400, 'active', 'Rest this pet before you submit it.')
        destroy = () => tx.delete(characterPets).where(eq(characterPets.id, pet.id))
      } else {
        const [row] = await tx
          .select()
          .from(inventoryItems)
          .where(and(unequippedBagItemsWhere(character.id), eq(inventoryItems.id, body.id)))
          .for('update')
        if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
        entry = entryOf(body.kind, row)
        destroy = () => consumeOne(tx, row)
      }
      if (!entry) throw notSpare()
      const added = await tx
        .insert(characterCollection)
        .values({ characterId: character.id, kind: body.kind, entry })
        .onConflictDoNothing()
        .returning()
      if (added.length === 0)
        throw new HttpError(409, 'already_collected', 'That entry is already collected.')
      await destroy()
      await refreshArenaSnapshot(tx, character.id)
      return collectionView(tx, character.id)
    })
  })
}

export default collectionRoutes
