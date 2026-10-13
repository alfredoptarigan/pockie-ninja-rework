// Pub fights in 26xx-28xx (PubMonsterFightSystem.java) under /pub: the scene's line-up, the
// hourly pull with combo rewards, and the 3-duel fight (no energy, decision 1).
import {
  canPull,
  comboRule,
  createRandom,
  firstLineup,
  PUB_FIGHT_MAX_PER_DAY,
  PULL_COOLDOWN_MS,
  pullLineup,
} from '@pockie/game-core'
import type { PubFightResult, PubPullResult, PubView } from '@pockie/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { pubFightLineups } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { drawPouch } from '../../game/pouch.js'
import type { Tx } from '../../game/progress.js'
import { vipDropMul, vipExp } from '../../game/vip.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { requireNoTeam } from '../teams/index.js'
import {
  bad,
  characterView,
  duel,
  grantDrops,
  lastNpcRewards,
  newSeed,
  requireBagRoom,
  rollDropLib,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from './common.js'
import { pubData, pubPool } from './data.js'

export function requirePool(character: CharacterRow) {
  const pool = pubPool(character.sceneId)
  if (!pool?.length) throw bad('not_here', 'There are no pub fights in this area.')
  return pool
}

export const fightsToday = (character: CharacterRow) =>
  character.pubFightDay === utcDay() ? character.pubFightsToday : 0

export function pubView(character: CharacterRow, lineup: string[], now = new Date()): PubView {
  const pulled = character.pubFightPulledAt
  return {
    sceneId: character.sceneId,
    lineup,
    fightsToday: fightsToday(character),
    maxFights: PUB_FIGHT_MAX_PER_DAY,
    nextPullAt: canPull(pulled, now)
      ? null
      : new Date(pulled!.getTime() + PULL_COOLDOWN_MS).toISOString(),
  }
}

/** The scene's line-up; the first visit picks three different NPCs. */
export async function lineupOf(tx: Tx, character: CharacterRow, pool: string[]) {
  const where = and(
    eq(pubFightLineups.characterId, character.id),
    eq(pubFightLineups.sceneId, character.sceneId),
  )
  const [row] = await tx.select().from(pubFightLineups).where(where)
  if (row) return row.npcIds
  const npcIds = firstLineup(pool, createRandom(newSeed()))
  await saveLineup(tx, character, npcIds)
  return npcIds
}

async function saveLineup(tx: Tx, character: CharacterRow, npcIds: string[]) {
  await tx
    .insert(pubFightLineups)
    .values({ characterId: character.id, sceneId: character.sceneId, npcIds })
    .onConflictDoUpdate({
      target: [pubFightLineups.characterId, pubFightLineups.sceneId],
      set: { npcIds },
    })
}

/**
 * A pull: a new line-up and, for a matching combo, its DropLib at once. The hourly pull refuses a
 * full bag; the pull after a win is fight loot, so combo items that do not fit are lost.
 */
export async function pull(tx: Tx, character: CharacterRow, pool: string[], afterWin = false) {
  const lineup = pullLineup(pool, createRandom(newSeed()))
  const { rewardRules, drops } = pubData()
  const ruleId = comboRule(lineup, rewardRules)
  const rolled = ruleId ? rollDropLib(drops[ruleId]?.DropLibID ?? 0, vipDropMul(character)) : []
  if (!afterWin) await requireBagRoom(tx, character.id, rolled)
  const items = await grantDrops(tx, character.id, rolled)
  await saveLineup(tx, character, lineup)
  const combo = ruleId ? { ruleId, grade: rewardRules[ruleId]!.RewardGrade, items } : null
  return { lineup, combo, lost: rolled.length - items.length }
}

export async function pubFightRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Creates the first line-up on the first look, so it runs in a locked transaction too.
  app.get('/pub', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    withCharacter(db, request, async (tx, character) =>
      pubView(character, await lineupOf(tx, character, requirePool(character))),
    ),
  )

  app.post('/pub/pull', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<PubPullResult> => {
      const pool = requirePool(character)
      if (!canPull(character.pubFightPulledAt, new Date()))
        throw bad('pull_cooldown', 'You can pull again once the hour is up.')
      const now = new Date()
      const { lineup, combo } = await pull(tx, character, pool)
      await saveCharacter(tx, character.id, { pubFightPulledAt: now })
      const updated = { ...character, pubFightPulledAt: now }
      return {
        pub: pubView(updated, lineup),
        combo,
        character: await characterView(tx, character.id),
      }
    }),
  )

  app.post('/pub/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withCharacter(db, request, async (tx, character): Promise<PubFightResult> => {
      await requireNoTeam(tx, character.id, 'fight in the pub alone')
      const pool = requirePool(character)
      const npcIds = await lineupOf(tx, character, pool)
      if (character.hp < (await playerFighter(tx, character)).maxHp)
        throw bad('not_full_hp', 'You need full HP for a pub fight.')
      const count = fightsToday(character)
      if (count >= PUB_FIGHT_MAX_PER_DAY)
        throw bad('daily_limit', 'You cannot fight in the pub any more today.')
      const { replay, won, hp, mp, maxHp, maxMp } = await duel(tx, character, npcIds)
      const daily = { pubFightDay: utcDay(), pubFightsToday: count + 1 }
      const rewards: PubFightResult['rewards'] = { exp: 0, stone: 0, items: [], levelsGained: 0 }
      let combo: PubPullResult['combo'] = null
      let lineup = npcIds
      if (!won) {
        await saveCharacter(tx, character.id, { ...daily, hp: 1, mp })
      } else {
        const hpDraw = drawPouch(hp, maxHp, character.hpPouch)
        const mpDraw = drawPouch(mp, maxMp, character.mpPouch)
        const kill = lastNpcRewards(npcIds[npcIds.length - 1]!, vipDropMul(character))
        const exp = vipExp(kill.exp, character)
        const { update, levelsGained } = withExp(
          character,
          { hp: hpDraw.value, mp: mpDraw.value, hpPouch: hpDraw.pouch, mpPouch: mpDraw.pouch },
          exp,
        )
        const items = await grantDrops(tx, character.id, kill.items)
        await saveCharacter(tx, character.id, {
          ...update,
          ...daily,
          stone: character.stone + kill.stone,
        })
        // A win pulls a new line-up at once (outside the hourly limit).
        const next = await pull(tx, character, pool, true)
        ;({ lineup, combo } = next)
        const lost = kill.items.length - items.length + next.lost
        Object.assign(rewards, {
          exp,
          stone: kill.stone,
          items,
          levelsGained,
          ...(lost > 0 && { lost }),
        })
      }
      return {
        replay,
        won,
        npcIds,
        rewards,
        combo,
        pub: pubView({ ...character, ...daily }, lineup),
        character: await characterView(tx, character.id),
      }
    }),
  )
}
