// Reborn's Collection, Avatars / Pets / Gear Sets (reborn-windows-A-L.md "Collection", "Submit
// Gear / Outfit / Pet"). collection-data.json comes from Reborn's serverConfig `collection`:
// outfits keep the entries our 2011 clothing 1-120 has (Reborn-only outfits and the Red rarity's
// 2950xx variants have no item here), pets are 1:1, and gear sets are our equip-suits sets put into
// Reborn's five level tiers with Reborn's per-piece / full-set / milestone values.
// Submitting destroys the copy; each entry counts once. The bonuses join fighterEffects.
// Lives in game/ so combat.ts and snapshot.ts do not import the collection routes.
import { eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Bonuses } from '@pockie/game-core'
import type {
  CollectionKind,
  CollectionMilestone,
  CollectionTotals,
  PercentTriple,
  StatTriple,
} from '../../../shared/src/schemas/collection.js'
import type { Db } from '../db/client.js'
import { characterCollection } from '../db/schema.js'
import { petSpecies } from './pets.js'
import type { Tx } from './progress.js'

const int = z.number().int().nonnegative()
/** [count, Max HP, Attack, Speed] in tenths of a percent. */
const milestones = z.array(z.tuple([int, int, int, int]))
const dataSchema = z.object({
  avatars: z.array(
    z.object({
      id: z.string(),
      outfits: z.array(z.tuple([int, int, int, int])),
      milestones,
    }),
  ),
  pets: z.array(
    z.object({
      nature: int,
      families: z.array(z.tuple([z.string().regex(/^i\d{6}$/), int, int, int])),
      milestones,
    }),
  ),
  gearSets: z.object({
    requiredLines: int,
    piece: int,
    complete: int,
    /** Bonus of completing every set of a tier (Reborn: threshold = the tier's set count). */
    milestone: int,
    tiers: z.array(
      z.object({
        label: z.string(),
        sets: z.array(z.object({ id: int, slots: z.record(z.string(), z.array(z.string())) })),
      }),
    ),
  }),
})
export type CollectionData = z.infer<typeof dataSchema>

let cached: CollectionData | undefined
export const collectionData = () =>
  (cached ??= dataSchema.parse(
    JSON.parse(readFileSync(new URL('./collection-data.json', import.meta.url), 'utf8')),
  ))

/** Reborn points to our x100 attribute units (Reborn stat scale, as bloodlines). */
const ATTRIBUTE_SCALE = 100

/** Base species of a pet item id (any evolution counts for its family). */
export const petFamily = (itemId: string) => {
  const species = petSpecies(itemId)
  return species ? (species.parent ?? species.item) : undefined
}

export const gearEntry = (setId: number, slot: string) => `${setId}:${slot}`

let pieceIndex: Map<string, string> | undefined
/** The gear entry (`set:slot`) an item id fills, if it is a collection piece. */
export function gearEntryOf(itemId: string) {
  pieceIndex ??= new Map(
    collectionData().gearSets.tiers.flatMap((tier) =>
      tier.sets.flatMap((set) =>
        Object.entries(set.slots).flatMap(([slot, ids]) =>
          ids.map((id) => [id, gearEntry(set.id, slot)] as const),
        ),
      ),
    ),
  )
  return pieceIndex.get(itemId)
}

const add = (a: number[], b: readonly number[], times = 1) => a.map((v, i) => v + b[i]! * times)

/** Reached milestones; "a higher milestone replaces the lower one", so only the top one pays. */
function milestoneState(rows: readonly (readonly number[])[], count: number) {
  const list: CollectionMilestone[] = rows.map(([at, hp, atk, spd]) => ({
    count: at!,
    bonus: [hp!, atk!, spd!],
    reached: count >= at!,
  }))
  const top = list.filter((m) => m.reached).at(-1)
  return { list, bonus: top?.bonus ?? [0, 0, 0], reached: list.filter((m) => m.reached).length }
}

/** Totals of one tab and its milestone lists, by group (rarity, nature, tier). */
function tabTotals(
  groups: { entries: { key: string; stats: StatTriple }[]; milestones: number[][] }[],
  has: (key: string) => boolean,
  extra: (group: number) => StatTriple = () => [0, 0, 0],
) {
  let stats: number[] = [0, 0, 0]
  let bonus: number[] = [0, 0, 0]
  let level = 0
  const lists = groups.map((group, index) => {
    const owned = group.entries.filter((entry) => has(entry.key))
    for (const entry of owned) stats = add(stats, entry.stats)
    stats = add(stats, extra(index))
    const state = milestoneState(group.milestones, owned.length)
    bonus = add(bonus, state.bonus)
    level += state.reached
    return state.list
  })
  const totals: CollectionTotals = {
    level,
    stats: stats as StatTriple,
    bonus: bonus as PercentTriple,
  }
  return { totals, lists }
}

export type Collected = Record<CollectionKind, ReadonlySet<string>>

/** The three tabs' totals and milestone lists for a set of collected entries. */
export function collectionTotals(collected: Collected) {
  const data = collectionData()
  const outfits = tabTotals(
    data.avatars.map((rarity) => ({
      entries: rarity.outfits.map(([clothing, ...stats]) => ({
        key: String(clothing),
        stats: stats as StatTriple,
      })),
      milestones: rarity.milestones,
    })),
    (key) => collected.outfit.has(key),
  )
  const pets = tabTotals(
    data.pets.map((nature) => ({
      entries: nature.families.map(([family, ...stats]) => ({
        key: family,
        stats: stats as StatTriple,
      })),
      milestones: nature.milestones,
    })),
    (key) => collected.pet.has(key),
  )
  const { piece, complete, milestone, tiers } = data.gearSets
  const isComplete = (set: CollectionData['gearSets']['tiers'][number]['sets'][number]) =>
    Object.keys(set.slots).every((slot) => collected.gear.has(gearEntry(set.id, slot)))
  // Each piece pays `piece`; a full set pays `complete` on top. Milestone: every set of the tier.
  const gear = tabTotals(
    tiers.map((tier) => ({
      entries: tier.sets.flatMap((set) =>
        Object.keys(set.slots).map((slot) => ({
          key: gearEntry(set.id, slot),
          stats: [piece, piece, piece] as StatTriple,
        })),
      ),
      milestones: [],
    })),
    (key) => collected.gear.has(key),
    (index) => {
      const sets = tiers[index]!.sets.filter(isComplete).length
      return [sets * complete, sets * complete, sets * complete]
    },
  )
  // Tier milestones count sets, not pieces, so they are worked out here.
  tiers.forEach((tier, index) => {
    const state = milestoneState(
      [[tier.sets.length, milestone, milestone, milestone]],
      tier.sets.filter(isComplete).length,
    )
    gear.lists[index] = state.list
    gear.totals.bonus = add(gear.totals.bonus, state.bonus) as PercentTriple
    gear.totals.level += state.reached
  })
  return { outfits, pets, gear }
}

/** Bonuses of the collected entries: STR / AGI / STA and Max HP / Attack / Speed percent. */
export function bonusesOf(collected: Collected): Partial<Bonuses> {
  const { outfits, pets, gear } = collectionTotals(collected)
  const tabs = [outfits.totals, pets.totals, gear.totals]
  const stats = tabs.reduce<number[]>((sum, tab) => add(sum, tab.stats), [0, 0, 0])
  const bonus = tabs.reduce<number[]>((sum, tab) => add(sum, tab.bonus), [0, 0, 0])
  const fields = {
    strength: stats[0]! * ATTRIBUTE_SCALE,
    agility: stats[1]! * ATTRIBUTE_SCALE,
    stamina: stats[2]! * ATTRIBUTE_SCALE,
    // Reborn stats 9 / 11 / 12 (tenths of a percent), our per-mille multipliers.
    hpMul: bonus[0]!,
    attackMul: bonus[1]!,
    atkTimeMul: bonus[2]!,
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== 0))
}

/** The character's collected entries by kind. */
export async function collectedOf(tx: Tx | Db, characterId: string): Promise<Collected> {
  const rows = await tx
    .select({ kind: characterCollection.kind, entry: characterCollection.entry })
    .from(characterCollection)
    .where(eq(characterCollection.characterId, characterId))
  const of = (kind: CollectionKind) =>
    new Set(rows.filter((row) => row.kind === kind).map((row) => row.entry))
  return { outfit: of('outfit'), pet: of('pet'), gear: of('gear') }
}

/** `Partial<Bonuses>` of the character's collection; `{}` when nothing is collected. */
export async function collectionBonuses(
  tx: Tx | Db,
  characterId: string,
): Promise<Partial<Bonuses>> {
  return bonusesOf(await collectedOf(tx, characterId))
}
