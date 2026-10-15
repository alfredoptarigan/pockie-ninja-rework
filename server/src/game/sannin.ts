// Sannin Test title path: the permanent Max HP of the ninja's rank (SANNIN_PLACEHOLDERS). Lives
// in game/ so combat.ts and the arena snapshot do not import the Sannin Test routes.
import type { Bonuses } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { sanninPlayers } from '../db/schema.js'
import { SANNIN_PLACEHOLDERS } from '../modules/sannin-test/config.js'
import type { Tx } from './progress.js'

const { rankBonuses } = SANNIN_PLACEHOLDERS
export const maxRank = rankBonuses.length - 1

/** Permanent Max HP of a ninja at `rank` (the title path's `hp`). */
export const rankHp = (rank: number) => rankBonuses[Math.min(Math.max(rank, 0), maxRank)]!.hp

/** `{ hp }` of the ninja's Sannin rank; `{}` before the first promotion. */
export async function sanninBonuses(tx: Tx | Db, characterId: string): Promise<Partial<Bonuses>> {
  const [row] = await tx
    .select({ rank: sanninPlayers.rank })
    .from(sanninPlayers)
    .where(eq(sanninPlayers.characterId, characterId))
  const hp = rankHp(row?.rank ?? 0)
  return hp > 0 ? { hp } : {}
}
