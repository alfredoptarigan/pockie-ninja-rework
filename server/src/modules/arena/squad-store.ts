// Squad Arena rows: the ladder, the squad row, the five equipment sets' main stats and a ninja's
// fighter in any set.
import { and, asc, desc, eq, inArray, sql, TransactionRollbackError } from 'drizzle-orm'
import {
  MAIN_STATS,
  type MainStat,
  type SquadLoadoutView,
} from '../../../../shared/src/schemas/arena-extras.js'
import { characters, inventoryItems, outfitRecasts, squadPlayers } from '../../db/schema.js'
import { avatarStats } from '../../game/data.js'
import { OUTFIT_SLOT, outfitOf, syncOutfit } from '../../game/outfit.js'
import type { Tx } from '../../game/progress.js'
import { isVip } from '../../game/vip.js'
import type { CharacterRow } from '../gates/common.js'
import { SQUAD_ARENA } from './config.js'
import { arenaFighter, type ArenaFighter } from './snapshot.js'

export type SquadRow = typeof squadPlayers.$inferSelect

const SETS = [1, 2, 3, 4, 5]
/** Sets IV and V need VIP (like switching to them). */
const VIP_SETS = 3

const hasSquad = sql`cardinality(${squadPlayers.loadouts}) = ${SQUAD_ARENA.squadSize}`
const ladderOrder = [
  desc(squadPlayers.score),
  asc(squadPlayers.scoreAt),
  asc(squadPlayers.characterId),
]

/** The squad ladder's top `limit` (valid squads only), rank 1 first. */
export async function squadLadder(tx: Tx, limit: number) {
  const rows = await tx
    .select({
      characterId: squadPlayers.characterId,
      name: characters.name,
      score: squadPlayers.score,
    })
    .from(squadPlayers)
    .innerJoin(characters, eq(characters.id, squadPlayers.characterId))
    .where(hasSquad)
    .orderBy(...ladderOrder)
    .limit(limit)
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

/** The 1-based ladder rank of a ninja with a squad, else null. */
export async function squadRankOf(tx: Tx, characterId: string) {
  const ranked = tx
    .select({
      characterId: squadPlayers.characterId,
      rank: sql<number>`(row_number() over (order by ${squadPlayers.score} desc, ${squadPlayers.scoreAt}, ${squadPlayers.characterId}))::int`.as(
        'rank',
      ),
    })
    .from(squadPlayers)
    .where(hasSquad)
    .as('ranked')
  const [row] = await tx.select().from(ranked).where(eq(ranked.characterId, characterId))
  return row?.rank ?? null
}

/** Squad rows locked by character id ascending (call after the character locks). */
export async function lockSquads(tx: Tx, ids: string[]) {
  for (const characterId of ids)
    await tx.insert(squadPlayers).values({ characterId }).onConflictDoNothing()
  const rows = await tx
    .select()
    .from(squadPlayers)
    .where(inArray(squadPlayers.characterId, ids))
    .orderBy(asc(squadPlayers.characterId))
    .for('update')
  return new Map(rows.map((row) => [row.characterId, row]))
}

/** Reborn's main stat: the largest of the outfit's STR / AGI / STA (the first on a tie). */
export function mainStatOf(isv: readonly number[]): MainStat | null {
  const max = Math.max(...isv)
  return max > 0 ? MAIN_STATS[isv.indexOf(max)]! : null
}

/** Each set's outfit, its main stat (recast values, else the outfit's own) and the VIP lock. */
export async function loadoutViews(tx: Tx, character: CharacterRow): Promise<SquadLoadoutView[]> {
  const outfits = await tx
    .select({
      set: inventoryItems.equippedSet,
      itemId: inventoryItems.itemId,
      recast: outfitRecasts,
    })
    .from(inventoryItems)
    .leftJoin(outfitRecasts, eq(outfitRecasts.itemId, inventoryItems.id))
    .where(
      and(
        eq(inventoryItems.characterId, character.id),
        eq(inventoryItems.equippedSlot, OUTFIT_SLOT),
        eq(inventoryItems.location, 'bag'),
      ),
    )
  const vip = isVip(character)
  return SETS.map((set) => {
    const row = outfits.find((outfit) => outfit.set === set)
    const facts = row && outfitOf(row.itemId)
    const base = { set, vipLocked: set > VIP_SETS && !vip }
    if (!row || !facts) return { ...base, mainStat: null, clothing: null }
    const own = avatarStats(facts.avatarId)
    const isv = row.recast
      ? [row.recast.strength, row.recast.agility, row.recast.stamina]
      : [own.Strength, own.Agility, own.Stamina]
    return { ...base, mainStat: mainStatOf(isv), clothing: facts.clothing }
  })
}

/** Why `sets` is not a valid squad (three sets with an outfit, three main stats), or null. */
export function squadError(views: SquadLoadoutView[], sets: readonly number[]) {
  if (sets.length !== SQUAD_ARENA.squadSize || new Set(sets).size !== sets.length)
    return 'Select three different loadouts.'
  const picked = sets.map((set) => views.find((view) => view.set === set))
  if (picked.some((view) => !view || view.vipLocked)) return 'Loadouts IV and V need VIP.'
  if (picked.some((view) => !view!.mainStat)) return 'Every loadout in the squad needs an outfit.'
  if (new Set(picked.map((view) => view!.mainStat)).size !== sets.length)
    return 'Each loadout must have a different main stat (STR, AGI, STA).'
  return null
}

/**
 * The ninja as an arena fighter in equipment set `set`. Another set is worn inside a savepoint
 * that is rolled back, so every bonus is counted exactly as when the ninja wears it. The caller
 * holds the character lock.
 */
export async function setFighter(tx: Tx, character: CharacterRow, set: number) {
  if (set === character.activeSet) return arenaFighter(tx, character)
  let fighter: ArenaFighter | undefined
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint
        .update(characters)
        .set({ activeSet: set })
        .where(eq(characters.id, character.id))
      await syncOutfit(savepoint, character.id, set)
      const [worn] = await savepoint
        .select()
        .from(characters)
        .where(eq(characters.id, character.id))
      fighter = await arenaFighter(savepoint, worn!)
      savepoint.rollback()
    })
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error
  }
  return fighter!
}
