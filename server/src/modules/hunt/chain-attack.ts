// Chain Attack (Reborn `fieldFightMulti`, `fieldFightMultiClaim`, `fieldFightMultiInstantFinish`):
// the ninja sets off against N of one field monster, 3 minutes each. Claiming fights the monsters
// whose time has passed (all of them once it ended, or after Instant Finish) as ordinary field
// fights, stopping at the first loss.
import { eq, sql } from 'drizzle-orm'
import {
  CHAIN_ATTACK_RULES,
  instantFinishCost,
  type ChainAttack,
  type ChainAttackClaimResult,
  type ChainAttackStartInput,
} from '../../../../shared/src/schemas/hunt.js'
import { ENERGY_RULES } from '../../../../shared/src/schemas/energy.js'
import { chainAttacks, characters } from '../../db/schema.js'
import { fightMonster, monsterDrops } from '../../game/combat.js'
import { npc } from '../../game/data.js'
import { rookieHandIns, type Tx } from '../../game/progress.js'
import { rollFieldAmbush } from '../akatsuki/routes.js'
import { requireAlive } from '../game/characters.js'
import { recordBossKill, sceneMonsters } from '../game/world.js'
import { bad, characterView, type CharacterRow } from '../gates/common.js'
import { spendEnergy } from '../energy/energy.js'
import { requireNoTeam } from '../teams/index.js'
import { requireBattleFree } from './guard.js'
import { recordHuntKill } from './hunt.js'

type ChainRow = typeof chainAttacks.$inferSelect

const STEP_MS = CHAIN_ATTACK_RULES.secondsPerMonster * 1000

export function chainView(row: ChainRow | undefined): ChainAttack | null {
  if (!row) return null
  const monster = npc(row.monsterId)
  return {
    monsterId: row.monsterId,
    nameKey: `lg_${monster?.Name ?? row.monsterId}`,
    level: Number(monster?.Level ?? 0),
    amount: row.amount,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    drops: monsterDrops(row.monsterId),
  }
}

export async function chainRow(tx: Tx, characterId: string, lock = false) {
  const query = tx.select().from(chainAttacks).where(eq(chainAttacks.characterId, characterId))
  const [row] = lock ? await query.for('update') : await query
  return row
}

export async function startChain(tx: Tx, character: CharacterRow, input: ChainAttackStartInput) {
  requireAlive(character, 'fight')
  await requireNoTeam(tx, character.id, 'start a chain attack')
  await requireBattleFree(tx, character.id)
  const monster = sceneMonsters(character.sceneId, character.level).find(
    (m) => m.id === input.monsterId,
  )
  if (!monster) throw bad('not_here', 'That monster is not in this area.')
  // Reborn: 1 energy per monster, paid at Begin.
  await spendEnergy(tx, character, input.amount * ENERGY_RULES.chainCostPerMonster)
  const now = new Date()
  const [row] = await tx
    .insert(chainAttacks)
    .values({
      characterId: character.id,
      monsterId: monster.id,
      sceneId: character.sceneId,
      amount: input.amount,
      startedAt: now,
      endsAt: new Date(now.getTime() + input.amount * STEP_MS),
    })
    .returning()
  return { chain: chainView(row), character: await characterView(tx, character.id) }
}

/** Monsters whose 3 minutes have passed (all of them once the chain ended). */
export const dueMonsters = (row: Pick<ChainRow, 'amount' | 'startedAt'>, now: Date) =>
  Math.min(row.amount, Math.max(0, Math.floor((now.getTime() - row.startedAt.getTime()) / STEP_MS)))

/** Claim (early or at the end), or Instant Finish: pay, then fight every monster. */
export async function claimChain(
  tx: Tx,
  character: CharacterRow,
  instant: boolean,
): Promise<ChainAttackClaimResult> {
  requireAlive(character, 'claim a chain attack')
  const row = await chainRow(tx, character.id, true)
  if (!row) throw bad('no_chain', 'No chain attack is running.')
  const now = new Date()
  let due = dueMonsters(row, now)
  if (instant) {
    const cost = instantFinishCost(row.endsAt.getTime() - now.getTime())
    if (character.giftCoupon < cost) throw bad('not_enough', 'Not enough Gift Certificates.')
    await tx
      .update(characters)
      .set({ giftCoupon: sql`${characters.giftCoupon} - ${cost}` })
      .where(eq(characters.id, character.id))
    due = row.amount
  }
  await tx.delete(chainAttacks).where(eq(chainAttacks.characterId, character.id))

  const totals: ChainAttackClaimResult['rewards'] = { exp: 0, stone: 0, items: [], levelsGained: 0 }
  let fought = 0
  let won = 0
  let ambush: ChainAttackClaimResult['akatsukiAmbush'] | null = null
  for (let i = 0; i < due; i++) {
    const [fresh] = await tx.select().from(characters).where(eq(characters.id, character.id))
    // Quest kills count in the scene the chain was started in.
    const result = await fightMonster(tx, { ...fresh!, sceneId: row.sceneId }, row.monsterId)
    fought += 1
    totals.exp += result.rewards.exp
    totals.stone += result.rewards.stone
    totals.items.push(...result.rewards.items)
    totals.levelsGained += result.rewards.levelsGained
    if (result.rewards.lost) totals.lost = (totals.lost ?? 0) + result.rewards.lost
    if (!result.won) break
    won += 1
    await recordBossKill(tx, character.id, row.monsterId, row.sceneId)
    await recordHuntKill(tx, character.id, row.monsterId)
    ambush ??= await rollFieldAmbush(tx, fresh!)
  }
  const handIns = await rookieHandIns(tx, character.id)
  totals.levelsGained += handIns.levelsGained
  return {
    fought,
    won,
    rewards: totals,
    ...(ambush && { akatsukiAmbush: ambush }),
    character: await characterView(tx, character.id),
  }
}
