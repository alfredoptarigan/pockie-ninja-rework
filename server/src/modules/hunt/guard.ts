// Reborn's battle guard (`3198.lt()`, reborn-lazy-features.md): no battle while the ninja is on an
// adventure with Jiraiya or a chain attack runs (until it is claimed). Reborn checks it in the
// client before every battle; we check it on the server in each battle route.
import { eq } from 'drizzle-orm'
import { BATTLE_GUARD } from '../../../../shared/src/schemas/hunt.js'
import type { Db } from '../../db/client.js'
import { chainAttacks, jiraiyaAdventures } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { bad } from '../gates/common.js'

export async function requireBattleFree(tx: Tx | Db, characterId: string) {
  const [away] = await tx
    .select({ id: jiraiyaAdventures.characterId })
    .from(jiraiyaAdventures)
    .where(eq(jiraiyaAdventures.characterId, characterId))
  if (away) throw bad('on_adventure', BATTLE_GUARD.adventure)
  const [chain] = await tx
    .select({ id: chainAttacks.characterId })
    .from(chainAttacks)
    .where(eq(chainAttacks.characterId, characterId))
  if (chain) throw bad('chain_attack', BATTLE_GUARD.chainAttack)
}
