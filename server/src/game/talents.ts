// Active Reborn talents of a ninja as fight input (M5 decision 8), used by live fights and arena
// snapshots. Lives in game/ so combat.ts does not import the talents routes.
import { and, eq, isNotNull } from 'drizzle-orm'
import { talentCap, TALENT_IDS, type Talents } from '../../../game-core/src/reborn/talents.js'
import type { Db } from '../db/client.js'
import { characters, characterTalents } from '../db/schema.js'
import type { Tx } from './progress.js'

/** Active talents with levels capped by the ninja's level; `{}` when none are active. */
export async function talentFighterInput(tx: Tx | Db, characterId: string): Promise<Talents> {
  const [character] = await tx
    .select({ level: characters.level })
    .from(characters)
    .where(eq(characters.id, characterId))
  const rows = await tx
    .select()
    .from(characterTalents)
    .where(
      and(eq(characterTalents.characterId, characterId), isNotNull(characterTalents.activeSlot)),
    )
  const cap = talentCap(character?.level ?? 0)
  const talents: Talents = {}
  for (const id of TALENT_IDS) {
    const level = Math.min(rows.find((r) => r.talentId === id)?.level ?? 0, cap)
    if (level > 0) talents[id] = level
  }
  return talents
}
